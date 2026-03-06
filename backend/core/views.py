from django.core.cache import cache
from django.db import connection
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django_tenants.utils import get_tenant_domain_model, get_tenant_model, schema_context
from celery.result import AsyncResult
from rest_framework import permissions, status
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema, inline_serializer

from accounts.audit import create_security_audit_event
from accounts.rbac import CAP_VIEW, has_capability, permissions_map_for_user
from accounts.models import UserPreference
from core.dashboard import (
    build_dashboard_payload,
    get_tenant_summaries_for_user,
    update_tenant_order_for_user,
    update_widget_layout,
)
from core.tasks import create_tenant_task
from tenant_data.rbac import get_accessible_customer_ids, parse_and_validate_customer_id

RootResponseSerializer = inline_serializer(
    name="RootResponseSerializer",
    fields={
        "service": serializers.CharField(),
        "version": serializers.CharField(),
        "docs": serializers.CharField(),
    },
)

HealthResponseSerializer = inline_serializer(
    name="HealthResponseSerializer",
    fields={"status": serializers.CharField()},
)

ReadyResponseSerializer = inline_serializer(
    name="ReadyResponseSerializer",
    fields={
        "status": serializers.CharField(),
        "checks": serializers.DictField(child=serializers.BooleanField()),
    },
)

CurrentContextSerializer = inline_serializer(
    name="CurrentContextSerializer",
    fields={
        "user": serializers.CharField(),
        "role": serializers.CharField(),
        "tenant": serializers.CharField(),
        "permissions": serializers.DictField(child=serializers.BooleanField()),
    },
)

DashboardPayloadSerializer = inline_serializer(
    name="DashboardPayloadSerializer",
    fields={
        "available_widgets": serializers.ListField(child=serializers.JSONField()),
        "widgets_layout": serializers.ListField(child=serializers.JSONField()),
        "widgets": serializers.ListField(child=serializers.JSONField()),
    },
)

DashboardTenantSerializer = inline_serializer(
    name="DashboardTenantSerializer",
    fields={
        "schema_name": serializers.CharField(),
        "name": serializers.CharField(),
        "on_trial": serializers.BooleanField(),
        "active_alerts": serializers.IntegerField(),
        "domain": serializers.CharField(),
        "entry_url": serializers.CharField(),
    },
)


@extend_schema(responses=RootResponseSerializer, tags=["System"])
@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def root_index(request):
    return Response(
        {
            "service": "SocView",
            "version": "0.1.0",
            "docs": "/api/docs/",
        },
        status=status.HTTP_200_OK,
    )


@extend_schema(responses=HealthResponseSerializer, tags=["System"])
@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def healthz(request):
    return Response({"status": "ok"}, status=status.HTTP_200_OK)


@extend_schema(responses=ReadyResponseSerializer, tags=["System"])
@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def readyz(request):
    checks = {"database": False, "cache": False, "celery": False}

    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        checks["database"] = True
    except Exception:
        checks["database"] = False

    try:
        cache.set("readyz", "ok", timeout=5)
        checks["cache"] = cache.get("readyz") == "ok"
    except Exception:
        checks["cache"] = False

    try:
        from socview.celery import app as celery_app

        ping_result = celery_app.control.ping(timeout=1.0)
        checks["celery"] = bool(ping_result)
    except Exception:
        checks["celery"] = False

    core_checks_ok = checks["database"] and checks["cache"]
    if core_checks_ok and checks["celery"]:
        return Response({"status": "ready", "checks": checks}, status=status.HTTP_200_OK)
    if core_checks_ok:
        return Response({"status": "degraded", "checks": checks}, status=status.HTTP_200_OK)

    return Response({"status": "not_ready", "checks": checks}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class CurrentContextView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=CurrentContextSerializer, tags=["System"])
    def get(self, request):
        if not has_capability(request.user, CAP_VIEW):
            raise PermissionDenied("Permessi insufficienti")
        tenant = getattr(request, "tenant", None)
        return Response(
            {
                "user": request.user.username,
                "role": request.user.role,
                "tenant": getattr(tenant, "schema_name", "public"),
                "permissions": permissions_map_for_user(request.user),
            },
            status=status.HTTP_200_OK,
        )


class DashboardWidgetsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _parse_customer_id(self, request):
        return parse_and_validate_customer_id(
            request.query_params.get("customer_id"),
            user=request.user,
            capability=CAP_VIEW,
        )

    def _parse_window(self, request):
        from_param = request.query_params.get("from")
        to_param = request.query_params.get("to")

        from_dt = parse_datetime(from_param) if from_param else None
        to_dt = parse_datetime(to_param) if to_param else None

        if from_dt and timezone.is_naive(from_dt):
            from_dt = timezone.make_aware(from_dt, timezone.get_current_timezone())
        if to_dt and timezone.is_naive(to_dt):
            to_dt = timezone.make_aware(to_dt, timezone.get_current_timezone())

        return from_dt, to_dt

    @extend_schema(responses=DashboardPayloadSerializer, tags=["Dashboard"])
    def get(self, request):
        if not has_capability(request.user, CAP_VIEW):
            raise PermissionDenied("Permessi insufficienti")
        window_start, window_end = self._parse_window(request)
        payload = build_dashboard_payload(
            request.user,
            customer_id=self._parse_customer_id(request),
            allowed_customer_ids=get_accessible_customer_ids(request.user),
            window_start=window_start,
            window_end=window_end,
        )
        return Response(payload, status=status.HTTP_200_OK)

    @extend_schema(
        request=inline_serializer(
            name="DashboardWidgetsUpdateRequest",
            fields={"widgets_layout": serializers.ListField(child=serializers.JSONField())},
        ),
        responses=DashboardPayloadSerializer,
        tags=["Dashboard"],
    )
    def put(self, request):
        if not has_capability(request.user, CAP_VIEW):
            raise PermissionDenied("Permessi insufficienti")
        widgets_layout = request.data.get("widgets_layout", [])
        if not isinstance(widgets_layout, list):
            return Response({"detail": "widgets_layout deve essere una lista"}, status=status.HTTP_400_BAD_REQUEST)
        update_widget_layout(request.user, widgets_layout)
        window_start, window_end = self._parse_window(request)
        payload = build_dashboard_payload(
            request.user,
            customer_id=self._parse_customer_id(request),
            allowed_customer_ids=get_accessible_customer_ids(request.user),
            window_start=window_start,
            window_end=window_end,
        )
        return Response(payload, status=status.HTTP_200_OK)


class DashboardTenantsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=DashboardTenantSerializer, tags=["Dashboard"])
    def get(self, request):
        if not has_capability(request.user, CAP_VIEW):
            raise PermissionDenied("Permessi insufficienti")
        payload = get_tenant_summaries_for_user(request.user, request_tenant=getattr(request, "tenant", None))
        return Response(payload, status=status.HTTP_200_OK)


class DashboardTenantsReorderView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(
        request=inline_serializer(
            name="DashboardTenantOrderRequest",
            fields={"schema_order": serializers.ListField(child=serializers.CharField())},
        ),
        responses=inline_serializer(
            name="DashboardTenantOrderResponse",
            fields={"schema_order": serializers.ListField(child=serializers.CharField())},
        ),
        tags=["Dashboard"],
    )
    def post(self, request):
        if not has_capability(request.user, CAP_VIEW):
            raise PermissionDenied("Permessi insufficienti")
        schema_order = request.data.get("schema_order", [])
        if not isinstance(schema_order, list):
            return Response({"detail": "schema_order deve essere una lista"}, status=status.HTTP_400_BAD_REQUEST)
        updated = update_tenant_order_for_user(
            request.user,
            schema_order,
            request_tenant=getattr(request, "tenant", None),
        )
        return Response({"schema_order": updated}, status=status.HTTP_200_OK)


def _require_super_admin(request):
    tenant = getattr(request, "tenant", None)
    is_public_schema = getattr(tenant, "schema_name", "public") == "public"
    is_super_admin = request.user.is_superuser or getattr(request.user, "role", None) == "SUPER_ADMIN"
    if not is_public_schema or not is_super_admin:
        raise PermissionDenied("Operazione disponibile solo su schema public con ruolo admin")


class TenantsAdminView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(tags=["Core"])
    def get(self, request):
        _require_super_admin(request)
        TenantModel = get_tenant_model()
        DomainModel = get_tenant_domain_model()

        domains_map = {
            domain.tenant_id: domain.domain for domain in DomainModel.objects.filter(is_primary=True).only("tenant_id", "domain")
        }
        tenants_payload = []
        for tenant in TenantModel.objects.all().order_by("schema_name"):
            alert_count = 0
            try:
                from tenant_data.models import Alert

                with schema_context(tenant.schema_name):
                    alert_count = Alert.objects.count()
            except Exception:
                alert_count = 0
            paid_until = getattr(tenant, "paid_until", None)
            is_active = paid_until is None or paid_until >= timezone.now().date()
            tenants_payload.append(
                {
                    "id": tenant.id,
                    "schema_name": tenant.schema_name,
                    "name": tenant.name,
                    "domain": domains_map.get(tenant.id, ""),
                    "on_trial": tenant.on_trial,
                    "status": "active" if is_active else "expired",
                    "alert_count": alert_count,
                }
            )
        return Response(tenants_payload, status=status.HTTP_200_OK)

    @extend_schema(
        request=inline_serializer(
            name="CreateTenantRequest",
            fields={
                "name": serializers.CharField(),
                "domain": serializers.CharField(),
                "schema_name": serializers.CharField(),
            },
        ),
        responses=inline_serializer(
            name="CreateTenantResponse",
            fields={"task_id": serializers.CharField()},
        ),
        tags=["Core"],
    )
    def post(self, request):
        _require_super_admin(request)
        name = str(request.data.get("name", "")).strip()
        domain = str(request.data.get("domain", "")).strip().lower()
        schema_name = str(request.data.get("schema_name", "")).strip().lower()
        if not name or not domain or not schema_name:
            return Response(
                {"detail": "name, domain e schema_name sono obbligatori"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        task = create_tenant_task.delay(
            name=name,
            domain=domain,
            schema_name=schema_name,
            actor_id=request.user.id,
        )
        create_security_audit_event(
            request,
            action="tenant.create.requested",
            object_type="Tenant",
            object_id=schema_name,
            metadata={"name": name, "domain": domain, "task_id": task.id},
        )
        return Response({"task_id": task.id}, status=status.HTTP_202_ACCEPTED)


class CheckTenantDomainView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(tags=["Core"])
    def get(self, request):
        _require_super_admin(request)
        domain = str(request.query_params.get("domain", "")).strip().lower()
        if not domain:
            return Response({"available": False, "detail": "domain obbligatorio"}, status=status.HTTP_400_BAD_REQUEST)
        DomainModel = get_tenant_domain_model()
        available = not DomainModel.objects.filter(domain=domain).exists()
        return Response({"available": available}, status=status.HTTP_200_OK)


class TaskStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(tags=["Core"])
    def get(self, request, task_id):
        _require_super_admin(request)
        task = AsyncResult(task_id)
        payload = {"task_id": task_id, "status": task.status}
        if task.status == "SUCCESS":
            payload["result"] = task.result
        if task.status == "FAILURE":
            payload["error"] = str(task.result)
        return Response(payload, status=status.HTTP_200_OK)


class OnboardingPreferenceView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(tags=["Core"])
    def get(self, request, tenant_key):
        key = f"onboarding_{tenant_key}"
        preference = UserPreference.objects.filter(user=request.user, key=key).first()
        return Response({"key": key, "value": preference.value if preference else {}}, status=status.HTTP_200_OK)

    @extend_schema(
        request=inline_serializer(
            name="OnboardingPreferenceRequest",
            fields={"value": serializers.JSONField()},
        ),
        tags=["Core"],
    )
    def patch(self, request, tenant_key):
        key = f"onboarding_{tenant_key}"
        value = request.data.get("value", {})
        preference, _ = UserPreference.objects.update_or_create(
            user=request.user,
            key=key,
            defaults={"value": value},
        )
        return Response({"key": key, "value": preference.value}, status=status.HTTP_200_OK)
