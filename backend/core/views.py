from django.core.cache import cache
from django.db import connection
from rest_framework import permissions, status
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema, inline_serializer

from core.dashboard import (
    build_dashboard_payload,
    get_tenant_summaries_for_user,
    update_tenant_order_for_user,
    update_widget_layout,
)

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
    checks = {"database": False, "cache": False}

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

    if all(checks.values()):
        return Response({"status": "ready", "checks": checks}, status=status.HTTP_200_OK)

    return Response({"status": "not_ready", "checks": checks}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class CurrentContextView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=CurrentContextSerializer, tags=["System"])
    def get(self, request):
        tenant = getattr(request, "tenant", None)
        return Response(
            {
                "user": request.user.username,
                "role": request.user.role,
                "tenant": getattr(tenant, "schema_name", "public"),
            },
            status=status.HTTP_200_OK,
        )


class DashboardWidgetsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=DashboardPayloadSerializer, tags=["Dashboard"])
    def get(self, request):
        payload = build_dashboard_payload(request.user)
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
        widgets_layout = request.data.get("widgets_layout", [])
        if not isinstance(widgets_layout, list):
            return Response({"detail": "widgets_layout deve essere una lista"}, status=status.HTTP_400_BAD_REQUEST)
        update_widget_layout(request.user, widgets_layout)
        payload = build_dashboard_payload(request.user)
        return Response(payload, status=status.HTTP_200_OK)


class DashboardTenantsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=DashboardTenantSerializer, tags=["Dashboard"])
    def get(self, request):
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
        schema_order = request.data.get("schema_order", [])
        if not isinstance(schema_order, list):
            return Response({"detail": "schema_order deve essere una lista"}, status=status.HTTP_400_BAD_REQUEST)
        updated = update_tenant_order_for_user(
            request.user,
            schema_order,
            request_tenant=getattr(request, "tenant", None),
        )
        return Response({"schema_order": updated}, status=status.HTTP_200_OK)
