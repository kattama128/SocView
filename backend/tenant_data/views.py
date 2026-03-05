import csv
from datetime import timedelta
import re

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ObjectDoesNotExist
from django.db.models import Avg, Count, DurationField, ExpressionWrapper, F, Q
from django.http import FileResponse, Http404, HttpResponse
from django.utils.text import get_valid_filename
from django.utils.dateparse import parse_date, parse_datetime
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.audit import create_security_audit_event
from accounts.rbac import (
    CAP_EXPORT,
    CAP_MANAGE_CUSTOMERS,
    CAP_TRIAGE,
    CAP_VIEW,
    has_capability,
)
from tenant_data.audit import create_audit_log
from tenant_data.customer_scoping import get_enabled_source_names_for_customer
from tenant_data.filters import AbstractBaseFilter
from tenant_data.models import (
    Alert,
    AlertDetailFieldConfig,
    AlertOccurrence,
    AlertState,
    AlertTag,
    Assignment,
    Attachment,
    AuditLog,
    Comment,
    Customer,
    CustomerMembership,
    CustomerSettings,
    CustomerSourcePreference,
    NotificationEvent,
    NotificationPreferences,
    NotificationRead,
    PushSubscription,
    SLAConfig,
    SavedSearch,
    Source,
    Tag,
)
from tenant_data.permissions import RoleBasedWritePermission, TenantSchemaAccessPermission
from tenant_data.notifications import create_notifications, get_or_create_preferences
from tenant_data.rbac import (
    ensure_customer_capability,
    filter_queryset_by_customer_access,
    get_accessible_customer_ids,
    parse_and_validate_customer_id,
    resolve_customer_for_user,
)
from tenant_data.search import SearchRequest, build_all_source_field_schemas, build_source_field_schema, search_alerts
from tenant_data.search.backends import extract_path
from tenant_data.security import scan_attachment, validate_attachment_upload
from tenant_data.serializers import (
    AlertDetailFieldConfigSerializer,
    AlertSearchRequestSerializer,
    AlertDetailSerializer,
    AlertListSerializer,
    AlertTimelineEventSerializer,
    AlertStateSerializer,
    AssignSerializer,
    AttachmentSerializer,
    AttachmentUploadSerializer,
    AuditLogSerializer,
    BulkActionRequestSerializer,
    BulkActionResultSerializer,
    CommentCreateSerializer,
    CommentSerializer,
    CustomerSettingsResponseSerializer,
    CustomerSettingsSerializer,
    CustomerSettingsUpsertSerializer,
    CustomerSourceCatalogSerializer,
    CustomerSerializer,
    CustomerOverviewSerializer,
    CustomerMembershipSerializer,
    CustomerMembershipUpsertSerializer,
    ExportConfigurableRequestSerializer,
    ExportPreviewResponseSerializer,
    NotificationAckSerializer,
    NotificationEventSerializer,
    NotificationPreferencesSerializer,
    NotificationSnoozeSerializer,
    PushSubscriptionSerializer,
    PushSubscriptionUpsertSerializer,
    RelatedAlertSerializer,
    SLAConfigSerializer,
    SavedSearchSerializer,
    StateChangeSerializer,
    TagMutationSerializer,
    TagSerializer,
)

User = get_user_model()
MENTION_PATTERN = re.compile(r"@([A-Za-z0-9_.-]{1,150})")

def _parse_customer_id(raw_value, field_name="customer_id"):
    return parse_and_validate_customer_id(raw_value, field_name=field_name)


def _resolve_customer_by_id(customer_id, field_name="customer_id", user=None, capability=CAP_VIEW):
    return resolve_customer_for_user(
        customer_id,
        user=user,
        capability=capability,
        field_name=field_name,
    )


class AlertPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 500


class AlertStateViewSet(viewsets.ModelViewSet):
    queryset = AlertState.objects.all().order_by("order", "id")
    serializer_class = AlertStateSerializer
    permission_classes = [TenantSchemaAccessPermission, RoleBasedWritePermission]
    read_capability = CAP_VIEW
    write_capability = CAP_MANAGE_CUSTOMERS

    def perform_create(self, serializer):
        state = serializer.save()
        create_audit_log(
            self.request,
            action="alert_state.created",
            obj=state,
            diff={
                "name": state.name,
                "order": state.order,
                "is_final": state.is_final,
                "is_enabled": state.is_enabled,
            },
        )

    def perform_update(self, serializer):
        old = {
            "name": serializer.instance.name,
            "order": serializer.instance.order,
            "is_final": serializer.instance.is_final,
            "is_enabled": serializer.instance.is_enabled,
        }
        state = serializer.save()
        create_audit_log(
            self.request,
            action="alert_state.updated",
            obj=state,
            diff={
                "old": old,
                "new": {
                    "name": state.name,
                    "order": state.order,
                    "is_final": state.is_final,
                    "is_enabled": state.is_enabled,
                },
            },
        )

    def perform_destroy(self, instance):
        payload = {"name": instance.name, "order": instance.order}
        super().perform_destroy(instance)
        create_audit_log(
            self.request,
            action="alert_state.deleted",
            obj=instance,
            diff=payload,
        )

    @extend_schema(request=None, responses=AlertStateSerializer(many=True), tags=["Alert States"])
    @action(detail=False, methods=["post"], url_path="reorder")
    def reorder(self, request):
        state_ids = request.data.get("state_ids", [])
        if not isinstance(state_ids, list) or not state_ids:
            return Response({"detail": "state_ids deve essere una lista non vuota"}, status=status.HTTP_400_BAD_REQUEST)

        states_map = {str(item.id): item for item in AlertState.objects.all()}
        if any(str(item_id) not in states_map for item_id in state_ids):
            return Response({"detail": "Uno o piu state_ids non esistono"}, status=status.HTTP_400_BAD_REQUEST)

        for index, item_id in enumerate(state_ids):
            state = states_map[str(item_id)]
            state.order = index
            state.save(update_fields=["order", "updated_at"])

        first_state = AlertState.objects.order_by("order", "id").first()
        create_audit_log(
            request,
            action="alert_state.reordered",
            obj=first_state or AlertState(name="reordered"),
            diff={"state_ids": state_ids},
        )

        serializer = self.get_serializer(AlertState.objects.all().order_by("order", "id"), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class TagViewSet(viewsets.ModelViewSet):
    queryset = Tag.objects.all().order_by("name")
    serializer_class = TagSerializer
    permission_classes = [TenantSchemaAccessPermission, RoleBasedWritePermission]
    read_capability = CAP_VIEW
    write_capability = CAP_TRIAGE

    def perform_create(self, serializer):
        tag = serializer.save()
        create_audit_log(
            self.request,
            action="tag.created",
            obj=tag,
            diff={"name": tag.name, "scope": tag.scope, "color": tag.color},
        )

    def perform_update(self, serializer):
        old = {
            "name": serializer.instance.name,
            "scope": serializer.instance.scope,
            "color": serializer.instance.color,
            "metadata": serializer.instance.metadata,
        }
        tag = serializer.save()
        create_audit_log(
            self.request,
            action="tag.updated",
            obj=tag,
            diff={
                "old": old,
                "new": {
                    "name": tag.name,
                    "scope": tag.scope,
                    "color": tag.color,
                    "metadata": tag.metadata,
                },
            },
        )

    def perform_destroy(self, instance):
        payload = {"name": instance.name, "scope": instance.scope}
        super().perform_destroy(instance)
        create_audit_log(self.request, action="tag.deleted", obj=instance, diff=payload)


class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.all().order_by("name", "id")
    serializer_class = CustomerSerializer
    permission_classes = [TenantSchemaAccessPermission, RoleBasedWritePermission]
    read_capability = CAP_VIEW
    write_capability = CAP_MANAGE_CUSTOMERS

    overview_ordering_map = {
        "name": "name",
        "-name": "-name",
        "code": "code",
        "-code": "-code",
        "created_at": "created_at",
        "-created_at": "-created_at",
        "active_alerts_total": "active_alerts_total",
        "-active_alerts_total": "-active_alerts_total",
        "active_alerts_critical": "active_alerts_critical",
        "-active_alerts_critical": "-active_alerts_critical",
        "active_alerts_high": "active_alerts_high",
        "-active_alerts_high": "-active_alerts_high",
        "active_alerts_medium": "active_alerts_medium",
        "-active_alerts_medium": "-active_alerts_medium",
        "active_alerts_low": "active_alerts_low",
        "-active_alerts_low": "-active_alerts_low",
    }

    def get_queryset(self):
        queryset = super().get_queryset()
        queryset = filter_queryset_by_customer_access(queryset, self.request.user, customer_field="id")
        is_enabled = self.request.query_params.get("is_enabled")
        if is_enabled in {"true", "false"}:
            queryset = queryset.filter(is_enabled=(is_enabled == "true"))
        return queryset

    def perform_create(self, serializer):
        customer = serializer.save()
        create_audit_log(
            self.request,
            action="customer.created",
            obj=customer,
            diff={"name": customer.name, "code": customer.code, "is_enabled": customer.is_enabled},
        )

    def perform_update(self, serializer):
        old = {
            "name": serializer.instance.name,
            "code": serializer.instance.code,
            "is_enabled": serializer.instance.is_enabled,
        }
        customer = serializer.save()
        create_audit_log(
            self.request,
            action="customer.updated",
            obj=customer,
            diff={
                "old": old,
                "new": {"name": customer.name, "code": customer.code, "is_enabled": customer.is_enabled},
            },
        )

    def perform_destroy(self, instance):
        payload = {"name": instance.name, "code": instance.code}
        super().perform_destroy(instance)
        create_audit_log(self.request, action="customer.deleted", obj=instance, diff=payload)

    @action(detail=False, methods=["get"], url_path="overview")
    def overview(self, request):
        ordering = request.query_params.get("ordering", "name")
        order_field = self.overview_ordering_map.get(ordering, "name")
        queryset = self.get_queryset().annotate(
            active_alerts_total=Count("alerts", filter=Q(alerts__current_state__is_final=False), distinct=True),
            active_alerts_critical=Count(
                "alerts",
                filter=Q(alerts__current_state__is_final=False, alerts__severity=Alert.Severity.CRITICAL),
                distinct=True,
            ),
            active_alerts_high=Count(
                "alerts",
                filter=Q(alerts__current_state__is_final=False, alerts__severity=Alert.Severity.HIGH),
                distinct=True,
            ),
            active_alerts_medium=Count(
                "alerts",
                filter=Q(alerts__current_state__is_final=False, alerts__severity=Alert.Severity.MEDIUM),
                distinct=True,
            ),
            active_alerts_low=Count(
                "alerts",
                filter=Q(alerts__current_state__is_final=False, alerts__severity=Alert.Severity.LOW),
                distinct=True,
            ),
        )
        if order_field.lstrip("-") == "name":
            queryset = queryset.order_by(order_field, "id")
        else:
            queryset = queryset.order_by(order_field, "name", "id")
        serializer = CustomerOverviewSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def _get_or_create_settings(self, customer):
        defaults = {}
        if customer.code:
            defaults["contact_email"] = f"{customer.code.lower()}@example.com"
        settings_obj, _ = CustomerSettings.objects.get_or_create(customer=customer, defaults=defaults)
        return settings_obj

    def _build_source_catalog(self, customer):
        global_sources = (
            Source.objects.filter(customer__isnull=True)
            .select_related("parser_definition")
            .prefetch_related("alert_type_rules")
            .order_by("name", "id")
        )
        overrides = {
            source_id: is_enabled
            for source_id, is_enabled in CustomerSourcePreference.objects.filter(
                customer=customer,
                source__customer__isnull=True,
            ).values_list("source_id", "is_enabled")
        }

        payload = []
        for source in global_sources:
            requested_enabled = bool(overrides.get(source.id, True))
            try:
                parser_name = source.parser_definition.name
            except ObjectDoesNotExist:
                parser_name = None
            payload.append(
                {
                    "source_id": source.id,
                    "name": source.name,
                    "type": source.type,
                    "description": source.description or "",
                    "globally_enabled": source.is_enabled,
                    "customer_enabled": requested_enabled and source.is_enabled,
                    "parser_definition_name": parser_name,
                    "alert_type_rules_count": source.alert_type_rules.count(),
                }
            )
        serializer = CustomerSourceCatalogSerializer(payload, many=True)
        return serializer.data

    @extend_schema(
        request=CustomerSettingsUpsertSerializer,
        responses=CustomerSettingsResponseSerializer,
        tags=["Customers"],
    )
    @action(detail=True, methods=["get", "put", "patch"], url_path="settings")
    def customer_settings(self, request, pk=None):
        customer = self.get_object()
        ensure_customer_capability(
            request.user,
            customer.id,
            CAP_VIEW if request.method.lower() == "get" else CAP_MANAGE_CUSTOMERS,
        )
        settings_obj = self._get_or_create_settings(customer)

        if request.method.lower() in {"put", "patch"}:
            is_partial = request.method.lower() == "patch"
            update_serializer = CustomerSettingsUpsertSerializer(data=request.data, partial=is_partial)
            update_serializer.is_valid(raise_exception=True)

            settings_payload = update_serializer.validated_data.get("settings")
            if settings_payload is not None:
                settings_serializer = CustomerSettingsSerializer(settings_obj, data=settings_payload, partial=is_partial)
                settings_serializer.is_valid(raise_exception=True)
                settings_obj = settings_serializer.save()

            source_overrides = update_serializer.validated_data.get("source_overrides") or []
            for item in source_overrides:
                CustomerSourcePreference.objects.update_or_create(
                    customer=customer,
                    source=item["source"],
                    defaults={"is_enabled": item["is_enabled"]},
                )

            create_audit_log(
                request,
                action="customer.settings.updated",
                obj=customer,
                diff={
                    "customer_id": customer.id,
                    "settings_updated": settings_payload is not None,
                    "source_overrides_count": len(source_overrides),
                },
            )

            settings_obj.refresh_from_db()

        payload = {
            "customer": CustomerSerializer(customer).data,
            "settings": CustomerSettingsSerializer(settings_obj).data,
            "sources": self._build_source_catalog(customer),
            "updated_at": settings_obj.updated_at,
        }
        return Response(payload, status=status.HTTP_200_OK)

    @extend_schema(
        request=CustomerMembershipUpsertSerializer,
        responses=CustomerMembershipSerializer(many=True),
        tags=["Customers"],
    )
    @action(detail=True, methods=["get", "post", "delete"], url_path="memberships")
    def memberships(self, request, pk=None):
        customer = self.get_object()
        ensure_customer_capability(request.user, customer.id, CAP_MANAGE_CUSTOMERS)

        if request.method.lower() == "get":
            queryset = customer.memberships.select_related("user").order_by("user__username", "id")
            serializer = CustomerMembershipSerializer(queryset, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)

        if request.method.lower() == "post":
            serializer = CustomerMembershipUpsertSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            payload = serializer.validated_data
            membership, _ = CustomerMembership.objects.update_or_create(
                customer=customer,
                user=payload["user"],
                defaults={
                    "scope": payload["scope"],
                    "is_active": payload.get("is_active", True),
                    "notes": payload.get("notes", ""),
                },
            )
            create_audit_log(
                request,
                action="customer.membership.upsert",
                obj=customer,
                diff={
                    "customer_id": customer.id,
                    "user_id": membership.user_id,
                    "scope": membership.scope,
                    "is_active": membership.is_active,
                },
            )
            create_security_audit_event(
                request,
                action="customer.membership.upsert",
                object_type="CustomerMembership",
                object_id=str(membership.id),
                metadata={
                    "customer_id": customer.id,
                    "user_id": membership.user_id,
                    "scope": membership.scope,
                    "is_active": membership.is_active,
                },
            )
            queryset = customer.memberships.select_related("user").order_by("user__username", "id")
            return Response(CustomerMembershipSerializer(queryset, many=True).data, status=status.HTTP_200_OK)

        user_id = request.data.get("user_id") or request.query_params.get("user_id")
        if not user_id:
            return Response({"detail": "user_id obbligatorio"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            parsed_user_id = int(user_id)
        except (TypeError, ValueError):
            return Response({"detail": "user_id non valido"}, status=status.HTTP_400_BAD_REQUEST)
        membership = customer.memberships.filter(user_id=parsed_user_id).first()
        if not membership:
            return Response({"detail": "Membership non trovata"}, status=status.HTTP_404_NOT_FOUND)
        membership_id = membership.id
        membership.delete()
        create_audit_log(
            request,
            action="customer.membership.deleted",
            obj=customer,
            diff={"customer_id": customer.id, "user_id": parsed_user_id},
        )
        create_security_audit_event(
            request,
            action="customer.membership.deleted",
            object_type="CustomerMembership",
            object_id=str(membership_id),
            metadata={"customer_id": customer.id, "user_id": parsed_user_id},
        )
        queryset = customer.memberships.select_related("user").order_by("user__username", "id")
        return Response(CustomerMembershipSerializer(queryset, many=True).data, status=status.HTTP_200_OK)


class AlertViewSet(viewsets.ModelViewSet):
    pagination_class = AlertPagination
    queryset = (
        Alert.objects.select_related("current_state", "customer")
        .prefetch_related("alert_tags__tag", "comments__author", "attachments", "audit_logs", "assignment")
        .all()
    )
    permission_classes = [TenantSchemaAccessPermission, RoleBasedWritePermission]
    read_capability = CAP_VIEW
    write_capability = CAP_TRIAGE

    def get_serializer_class(self):
        if self.action == "list":
            return AlertListSerializer
        return AlertDetailSerializer

    @staticmethod
    def _parse_dt_param(raw_value):
        if not raw_value:
            return None
        parsed_dt = parse_datetime(raw_value)
        if parsed_dt is not None:
            if timezone.is_naive(parsed_dt):
                parsed_dt = timezone.make_aware(parsed_dt, timezone.get_current_timezone())
            return parsed_dt
        parsed_date = parse_date(raw_value)
        if parsed_date is not None:
            return timezone.make_aware(
                timezone.datetime.combine(parsed_date, timezone.datetime.min.time()),
                timezone.get_current_timezone(),
            )
        return None

    def get_queryset(self):
        queryset = super().get_queryset()
        customer_id = parse_and_validate_customer_id(
            self.request.query_params.get("customer_id"),
            user=self.request.user,
            capability=CAP_VIEW,
        )
        state_id = self.request.query_params.get("state")
        severity = self.request.query_params.get("severity")
        text = self.request.query_params.get("text")
        is_active = self.request.query_params.get("is_active")
        state_category = self.request.query_params.get("state__category")
        created_after = self._parse_dt_param(self.request.query_params.get("created_after"))
        created_before = self._parse_dt_param(self.request.query_params.get("created_before"))
        from_dt = self._parse_dt_param(self.request.query_params.get("from"))
        to_dt = self._parse_dt_param(self.request.query_params.get("to"))
        assignee = self.request.query_params.get("assignee")
        in_state_since = self.request.query_params.get("in_state_since")

        if customer_id is not None:
            queryset = queryset.filter(customer_id=customer_id)
            enabled_source_names = get_enabled_source_names_for_customer(customer_id)
            if enabled_source_names is not None:
                if enabled_source_names:
                    queryset = queryset.filter(source_name__in=enabled_source_names)
                else:
                    queryset = queryset.none()
        else:
            queryset = filter_queryset_by_customer_access(queryset, self.request.user)

        if state_id:
            queryset = queryset.filter(current_state_id=state_id)

        if severity:
            queryset = queryset.filter(severity=severity)

        if text:
            queryset = queryset.filter(
                Q(title__icontains=text)
                | Q(source_name__icontains=text)
                | Q(source_id__icontains=text)
                | Q(dedup_fingerprint__icontains=text)
            )

        if is_active in {"true", "false"}:
            queryset = queryset.filter(current_state__is_final=(is_active == "false"))

        if state_category == "open":
            queryset = queryset.filter(current_state__is_final=False)
        elif state_category == "closed":
            queryset = queryset.filter(current_state__is_final=True)

        if created_after is not None:
            queryset = queryset.filter(created_at__gte=created_after)
        if created_before is not None:
            queryset = queryset.filter(created_at__lte=created_before)
        if from_dt is not None:
            queryset = queryset.filter(created_at__gte=from_dt)
        if to_dt is not None:
            queryset = queryset.filter(created_at__lte=to_dt)

        filter_helper = AbstractBaseFilter(self.request.user)
        queryset = filter_helper.apply_assignment_and_state_filters(
            queryset,
            assignee=assignee,
            in_state_since=in_state_since,
        )

        return queryset

    def list(self, request, *args, **kwargs):
        summary = request.query_params.get("summary")
        if summary == "severity":
            queryset = self.filter_queryset(self.get_queryset())
            rows = queryset.values("severity").annotate(count=Count("id"))
            counts = {item["severity"]: int(item["count"]) for item in rows}
            severities = [Alert.Severity.CRITICAL, Alert.Severity.HIGH, Alert.Severity.MEDIUM, Alert.Severity.LOW]
            return Response(
                {
                    "summary": "severity",
                    "items": [{"severity": severity, "count": counts.get(severity, 0)} for severity in severities],
                },
                status=status.HTTP_200_OK,
            )

        if summary == "mttr":
            queryset = self.filter_queryset(self.get_queryset()).filter(current_state__is_final=True)
            duration_expr = ExpressionWrapper(F("updated_at") - F("created_at"), output_field=DurationField())
            aggregate = queryset.aggregate(avg_duration=Avg(duration_expr))
            avg_duration = aggregate.get("avg_duration")
            avg_minutes = int(round(avg_duration.total_seconds() / 60.0)) if avg_duration else None
            return Response(
                {"summary": "mttr", "avg_minutes": avg_minutes, "sample_size": queryset.count()},
                status=status.HTTP_200_OK,
            )

        return super().list(request, *args, **kwargs)

    def _parse_search_payload_for_export(self, payload, capability=CAP_EXPORT):
        serializer = AlertSearchRequestSerializer(data=payload or {})
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        filter_helper = AbstractBaseFilter(self.request.user)
        customer_id = validated.get("customer_id")
        if customer_id is not None:
            ensure_customer_capability(self.request.user, customer_id, capability)
        assignee_id = filter_helper.resolve_assignee(validated.get("assignee"))
        return SearchRequest(
            customer_id=customer_id,
            text=validated.get("text", ""),
            source_name=validated.get("source_name", ""),
            source_names=validated.get("source_names", []),
            state_id=validated.get("state_id"),
            state_ids=validated.get("state_ids", []),
            severity=validated.get("severity", ""),
            severities=validated.get("severities", []),
            alert_types=validated.get("alert_types", []),
            tag_ids=validated.get("tag_ids", []),
            event_timestamp_from=validated.get("event_timestamp_from"),
            event_timestamp_to=validated.get("event_timestamp_to"),
            is_active=validated.get("is_active"),
            assigned_to_id=assignee_id,
            in_state_since=validated.get("in_state_since"),
            dynamic_filters=validated.get("dynamic_filters", []),
            ordering=validated.get("ordering", "-event_timestamp"),
            page=validated.get("page", 1),
            page_size=validated.get("page_size", 100),
            allowed_customer_ids=get_accessible_customer_ids(self.request.user),
        )

    def _collect_alert_ids_for_export(self, search_request, all_results=True):
        if not all_results:
            return search_alerts(search_request).alert_ids

        collected = []
        page = 1
        max_pages = 50
        while page <= max_pages:
            search_request.page = page
            result = search_alerts(search_request)
            if not result.alert_ids:
                break
            collected.extend(result.alert_ids)
            if len(collected) >= result.total:
                break
            page += 1
        return collected

    @staticmethod
    def _extract_nested_value(payload, *keys):
        current = payload
        for key in keys:
            if not isinstance(current, dict):
                return None
            current = current.get(key)
        return current

    @staticmethod
    def _extract_rule_id(alert):
        return AlertViewSet._extract_nested_value(alert.raw_payload or {}, "rule_id")

    @staticmethod
    def _extract_src_ip(alert):
        payload = alert.raw_payload or {}
        src_ip = payload.get("src_ip")
        if src_ip:
            return src_ip
        source_block_ip = AlertViewSet._extract_nested_value(payload, "source", "ip")
        if source_block_ip:
            return source_block_ip
        return payload.get("ip")

    @staticmethod
    def _resolve_mentioned_users(body, *, alert=None):
        usernames = sorted(set(MENTION_PATTERN.findall(body or "")))
        if not usernames:
            return []

        candidates = list(User.objects.filter(username__in=usernames, is_active=True))
        if alert is None or alert.customer_id is None:
            return candidates

        allowed_users = []
        for candidate in candidates:
            try:
                ensure_customer_capability(candidate, alert.customer_id, CAP_VIEW)
                allowed_users.append(candidate)
            except PermissionDenied:
                continue
        return allowed_users

    def _create_mention_notifications(self, request, alert, body):
        mentioned_users = self._resolve_mentioned_users(body, alert=alert)
        recipients = [item for item in mentioned_users if item.id != request.user.id]
        if not recipients:
            return
        create_notifications(
            alert=alert,
            title=f"Menzione su alert #{alert.id}",
            message=f"{request.user.username} ti ha menzionato in un commento: {alert.title}",
            severity=NotificationEvent.Severity.MEDIUM,
            metadata={
                "mention": True,
                "comment_author_id": request.user.id,
                "comment_author_username": request.user.username,
            },
            recipients=recipients,
            dedupe_key=f"mention:{alert.id}",
        )

    def perform_create(self, serializer):
        current_state = serializer.validated_data.get("current_state")
        if current_state is None:
            current_state = AlertState.objects.filter(is_enabled=True).order_by("order", "id").first()
            if current_state is None:
                raise ValidationError({"current_state": "Nessuno stato disponibile"})

        customer = serializer.validated_data.get("customer")
        if customer is None:
            customer_id = _parse_customer_id(
                self.request.data.get("customer_id", self.request.query_params.get("customer_id"))
            )
            customer = _resolve_customer_by_id(customer_id, user=self.request.user, capability=CAP_TRIAGE)
        elif customer is not None:
            ensure_customer_capability(self.request.user, customer.id, CAP_TRIAGE)

        alert = serializer.save(current_state=current_state, customer=customer)
        AlertOccurrence.objects.get_or_create(
            alert=alert,
            defaults={
                "count": 1,
                "first_seen": alert.event_timestamp,
                "last_seen": alert.event_timestamp,
            },
        )

        create_audit_log(
            self.request,
            action="alert.created",
            obj=alert,
            alert=alert,
            diff={"title": alert.title, "state": alert.current_state.name, "severity": alert.severity},
        )

    def perform_update(self, serializer):
        old = {
            "title": serializer.instance.title,
            "severity": serializer.instance.severity,
            "event_timestamp": serializer.instance.event_timestamp.isoformat(),
            "source_name": serializer.instance.source_name,
            "source_id": serializer.instance.source_id,
            "customer_id": serializer.instance.customer_id,
            "current_state_id": serializer.instance.current_state_id,
            "dedup_fingerprint": serializer.instance.dedup_fingerprint,
        }
        new_customer = serializer.validated_data.get("customer", serializer.instance.customer)
        ensure_customer_capability(self.request.user, getattr(new_customer, "id", None), CAP_TRIAGE)
        alert = serializer.save()
        create_audit_log(
            self.request,
            action="alert.updated",
            obj=alert,
            alert=alert,
            diff={
                "old": old,
                "new": {
                    "title": alert.title,
                    "severity": alert.severity,
                    "event_timestamp": alert.event_timestamp.isoformat(),
                    "source_name": alert.source_name,
                    "source_id": alert.source_id,
                    "customer_id": alert.customer_id,
                    "current_state_id": alert.current_state_id,
                    "dedup_fingerprint": alert.dedup_fingerprint,
                },
            },
        )

    def perform_destroy(self, instance):
        ensure_customer_capability(self.request.user, instance.customer_id, CAP_TRIAGE)
        payload = {
            "title": instance.title,
            "severity": instance.severity,
            "current_state": instance.current_state.name,
        }
        super().perform_destroy(instance)
        create_audit_log(
            self.request,
            action="alert.deleted",
            obj=instance,
            diff=payload,
        )

    @extend_schema(request=StateChangeSerializer, responses=AlertDetailSerializer, tags=["Alerts"])
    @action(detail=True, methods=["post", "patch"], url_path="change-state")
    def change_state(self, request, pk=None):
        alert = self.get_object()
        serializer = StateChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_state = serializer.validated_data["state_id"]
        old_state = alert.current_state

        alert.current_state = new_state
        alert.save(update_fields=["current_state", "updated_at"])

        create_audit_log(
            request,
            action="alert.state_changed",
            obj=alert,
            alert=alert,
            diff={"old_state": old_state.name, "new_state": new_state.name},
        )
        return Response(AlertDetailSerializer(alert, context={"request": request}).data)

    @extend_schema(request=TagMutationSerializer, responses=AlertDetailSerializer, tags=["Alerts"])
    @action(detail=True, methods=["post"], url_path="add-tag")
    def add_tag(self, request, pk=None):
        alert = self.get_object()
        serializer = TagMutationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tag = serializer.validated_data["tag_id"]

        AlertTag.objects.get_or_create(alert=alert, tag=tag)

        create_audit_log(
            request,
            action="alert.tag_added",
            obj=alert,
            alert=alert,
            diff={"tag_id": tag.id, "tag_name": tag.name},
        )
        return Response(AlertDetailSerializer(alert, context={"request": request}).data)

    @extend_schema(request=TagMutationSerializer, responses=AlertDetailSerializer, tags=["Alerts"])
    @action(detail=True, methods=["post"], url_path="remove-tag")
    def remove_tag(self, request, pk=None):
        alert = self.get_object()
        serializer = TagMutationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tag = serializer.validated_data["tag_id"]

        AlertTag.objects.filter(alert=alert, tag=tag).delete()

        create_audit_log(
            request,
            action="alert.tag_removed",
            obj=alert,
            alert=alert,
            diff={"tag_id": tag.id, "tag_name": tag.name},
        )
        return Response(AlertDetailSerializer(alert, context={"request": request}).data)

    @extend_schema(request=AssignSerializer, responses=AlertDetailSerializer, tags=["Alerts"])
    @action(detail=True, methods=["post"], url_path="assign")
    def assign(self, request, pk=None):
        alert = self.get_object()
        serializer = AssignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        assignee = serializer.validated_data["assigned_to_id"]

        if assignee is not None:
            if not has_capability(assignee, CAP_TRIAGE):
                raise ValidationError({"assigned_to_id": "Utente non abilitato al triage"})
            if alert.customer_id is not None:
                ensure_customer_capability(assignee, alert.customer_id, CAP_VIEW, field_name="assigned_to_id")

        assignment, _ = Assignment.objects.get_or_create(alert=alert)
        old_assignee = assignment.assigned_to
        assignment.assigned_to = assignee
        assignment.assigned_by = request.user
        assignment.save()

        create_audit_log(
            request,
            action="alert.assigned",
            obj=assignment,
            alert=alert,
            diff={
                "old_assigned_to": old_assignee.username if old_assignee else None,
                "new_assigned_to": assignee.username if assignee else None,
            },
        )
        refreshed_alert = self.get_queryset().get(pk=alert.pk)
        return Response(AlertDetailSerializer(refreshed_alert, context={"request": request}).data)

    @extend_schema(request=BulkActionRequestSerializer, responses=BulkActionResultSerializer, tags=["Alerts"])
    @action(detail=False, methods=["post"], url_path="bulk-action")
    def bulk_action(self, request):
        if not has_capability(request.user, CAP_TRIAGE):
            return Response({"detail": "Permessi insufficienti"}, status=status.HTTP_403_FORBIDDEN)

        serializer = BulkActionRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data
        action_name = payload["action"]
        select_all = payload.get("select_all", False)

        if select_all:
            filters_payload = payload.get("filters") or {}
            search_request = self._parse_search_payload_for_export(filters_payload, capability=CAP_TRIAGE)
            target_ids = self._collect_alert_ids_for_export(search_request, all_results=True)
        else:
            target_ids = payload.get("ids", [])

        if not target_ids:
            return Response({"updated": 0, "errors": 0}, status=status.HTTP_200_OK)

        queryset = self.get_queryset().filter(id__in=target_ids).select_related("current_state", "customer")
        alerts = list(queryset)
        updated = 0
        errors = 0

        if action_name == "change_state":
            state = payload["state_id"]
            for alert in alerts:
                try:
                    old_state = alert.current_state
                    alert.current_state = state
                    alert.save(update_fields=["current_state", "updated_at"])
                    create_audit_log(
                        request,
                        action="alert.state_changed",
                        obj=alert,
                        alert=alert,
                        diff={"old_state": old_state.name, "new_state": state.name},
                    )
                    updated += 1
                except Exception:
                    errors += 1

        if action_name == "assign":
            assignee = payload.get("assigned_to_id")
            for alert in alerts:
                try:
                    if assignee is not None:
                        if not has_capability(assignee, CAP_TRIAGE):
                            raise ValidationError({"assigned_to_id": "Utente non abilitato al triage"})
                        if alert.customer_id is not None:
                            ensure_customer_capability(
                                assignee,
                                alert.customer_id,
                                CAP_VIEW,
                                field_name="assigned_to_id",
                            )
                    assignment, _ = Assignment.objects.get_or_create(alert=alert)
                    old_assignee = assignment.assigned_to
                    assignment.assigned_to = assignee
                    assignment.assigned_by = request.user
                    assignment.save()
                    create_audit_log(
                        request,
                        action="alert.assigned",
                        obj=assignment,
                        alert=alert,
                        diff={
                            "old_assigned_to": old_assignee.username if old_assignee else None,
                            "new_assigned_to": assignee.username if assignee else None,
                        },
                    )
                    updated += 1
                except Exception:
                    errors += 1

        if action_name == "add_tag":
            tag_ids = payload.get("tag_ids", [])
            tags = list(Tag.objects.filter(id__in=tag_ids))
            tag_names = [tag.name for tag in tags]
            for alert in alerts:
                try:
                    for tag in tags:
                        AlertTag.objects.get_or_create(alert=alert, tag=tag)
                    create_audit_log(
                        request,
                        action="alert.tag_added",
                        obj=alert,
                        alert=alert,
                        diff={"tag_ids": [tag.id for tag in tags], "tag_names": tag_names},
                    )
                    updated += 1
                except Exception:
                    errors += 1

        return Response({"updated": updated, "errors": errors}, status=status.HTTP_200_OK)

    @extend_schema(
        request=CommentCreateSerializer,
        responses={200: CommentSerializer(many=True), 201: CommentSerializer},
        tags=["Alerts"],
    )
    @action(detail=True, methods=["get", "post"], url_path="comments")
    def comments(self, request, pk=None):
        alert = self.get_object()

        if request.method.lower() == "get":
            payload = CommentSerializer(alert.comments.select_related("author").all(), many=True).data
            return Response(payload)

        serializer = CommentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        comment = Comment.objects.create(
            alert=alert,
            author=request.user,
            body=serializer.validated_data["body"],
        )
        self._create_mention_notifications(request, alert, comment.body)
        create_audit_log(
            request,
            action="alert.comment_added",
            obj=comment,
            alert=alert,
            diff={"body": comment.body},
        )
        payload = CommentSerializer(comment).data
        return Response(payload, status=status.HTTP_201_CREATED)

    @extend_schema(request=AttachmentUploadSerializer, responses=AttachmentSerializer(many=True), tags=["Alerts"])
    @action(detail=True, methods=["get", "post"], url_path="attachments", parser_classes=[MultiPartParser, FormParser])
    def attachments(self, request, pk=None):
        alert = self.get_object()

        if request.method.lower() == "get":
            payload = AttachmentSerializer(
                alert.attachments.all(),
                many=True,
                context={"request": request},
            ).data
            return Response(payload)

        serializer = AttachmentUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        uploaded_file = serializer.validated_data["file"]
        max_mb = int(getattr(settings, "MAX_ATTACHMENT_SIZE_MB", 25) or 25)
        try:
            validation = validate_attachment_upload(uploaded_file, max_size_mb=max_mb)
        except ValueError as exc:
            create_audit_log(
                request,
                action="alert.attachment_upload_rejected",
                obj=alert,
                alert=alert,
                diff={
                    "filename": getattr(uploaded_file, "name", ""),
                    "reason": str(exc),
                },
            )
            create_security_audit_event(
                request,
                action="attachment.upload_rejected",
                object_type="Alert",
                object_id=alert.id,
                metadata={
                    "alert_id": alert.id,
                    "customer_id": alert.customer_id,
                    "filename": getattr(uploaded_file, "name", ""),
                    "reason": str(exc),
                },
            )
            raise ValidationError({"file": str(exc)}) from exc

        scan_result = scan_attachment(uploaded_file)
        block_unscanned = bool(getattr(settings, "BLOCK_UNSCANNED_ATTACHMENTS", False))
        if scan_result.status == Attachment.ScanStatus.SUSPICIOUS or (
            scan_result.status == Attachment.ScanStatus.FAILED and block_unscanned
        ):
            reason = (
                scan_result.detail
                or "Allegato bloccato: scansione non valida"
            )
            create_audit_log(
                request,
                action="alert.attachment_upload_rejected",
                obj=alert,
                alert=alert,
                diff={
                    "filename": validation.filename,
                    "reason": reason,
                    "scan_status": scan_result.status,
                },
            )
            create_security_audit_event(
                request,
                action="attachment.upload_rejected",
                object_type="Alert",
                object_id=alert.id,
                metadata={
                    "alert_id": alert.id,
                    "customer_id": alert.customer_id,
                    "filename": validation.filename,
                    "reason": reason,
                    "scan_status": scan_result.status,
                },
            )
            raise ValidationError({"file": reason})

        uploaded_file.name = validation.filename
        attachment = Attachment.objects.create(
            alert=alert,
            filename=validation.filename,
            file=uploaded_file,
            content_type=validation.content_type or "application/octet-stream",
            size=validation.size,
            scan_status=scan_result.status,
            scan_detail=scan_result.detail,
            uploaded_by=request.user,
        )

        create_audit_log(
            request,
            action="alert.attachment_uploaded",
            obj=attachment,
            alert=alert,
            diff={
                "filename": attachment.filename,
                "content_type": attachment.content_type,
                "size": attachment.size,
                "scan_status": attachment.scan_status,
                "scan_detail": attachment.scan_detail,
            },
        )
        create_security_audit_event(
            request,
            action="attachment.uploaded",
            object_type="Attachment",
            object_id=attachment.id,
            metadata={
                "alert_id": alert.id,
                "customer_id": alert.customer_id,
                "filename": attachment.filename,
                "size": attachment.size,
                "scan_status": attachment.scan_status,
            },
        )

        payload = AttachmentSerializer(attachment, context={"request": request}).data
        return Response(payload, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="audit")
    def alert_audit(self, request, pk=None):
        alert = self.get_object()
        queryset = AuditLog.objects.filter(alert=alert).select_related("actor")
        serializer = AuditLogSerializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="export")
    def export(self, request):
        if not has_capability(request.user, CAP_EXPORT):
            return Response({"detail": "Permessi insufficienti per export"}, status=status.HTTP_403_FORBIDDEN)
        queryset = self.filter_queryset(self.get_queryset())

        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="alerts.csv"'

        writer = csv.writer(response)
        writer.writerow(["id", "title", "severity", "state", "is_active", "source_name", "event_timestamp"])

        for alert in queryset:
            writer.writerow(
                [
                    alert.id,
                    alert.title,
                    alert.severity,
                    alert.current_state.name,
                    alert.is_active,
                    alert.source_name,
                    alert.event_timestamp.isoformat(),
                ]
            )

        return response

    @extend_schema(request=None, responses=AlertTimelineEventSerializer(many=True), tags=["Alerts"])
    @action(detail=True, methods=["get"], url_path="timeline")
    def timeline(self, request, pk=None):
        alert = self.get_object()
        events = []

        occurrence = getattr(alert, "occurrence", None)
        if occurrence:
            events.append(
                {
                    "timestamp": occurrence.last_seen,
                    "type": "occurrence",
                    "title": "Occorrenze aggiornate",
                    "detail": {
                        "count": occurrence.count,
                        "first_seen": occurrence.first_seen,
                        "last_seen": occurrence.last_seen,
                    },
                }
            )

        for comment in alert.comments.select_related("author").all():
            events.append(
                {
                    "timestamp": comment.created_at,
                    "type": "comment",
                    "title": f"Nota di {comment.author.username if comment.author else 'utente'}",
                    "detail": {"body": comment.body},
                }
            )

        for audit_entry in alert.audit_logs.select_related("actor").all():
            if audit_entry.action == "alert.state_changed":
                detail = audit_entry.diff or {}
                title = "Cambio stato"
            elif audit_entry.action == "alert.updated":
                detail = audit_entry.diff or {}
                title = "Alert modificato"
            elif audit_entry.action == "alert.assigned":
                detail = audit_entry.diff or {}
                title = "Assegnazione aggiornata"
            else:
                continue

            events.append(
                {
                    "timestamp": audit_entry.timestamp,
                    "type": audit_entry.action,
                    "title": title,
                    "detail": detail,
                }
            )

        events = sorted(events, key=lambda item: item["timestamp"], reverse=True)
        serializer = AlertTimelineEventSerializer(events, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(request=None, responses=RelatedAlertSerializer(many=True), tags=["Alerts"])
    @action(detail=True, methods=["get"], url_path="related")
    def related(self, request, pk=None):
        alert = self.get_object()
        cutoff = timezone.now() - timedelta(days=30)
        src_ip = self._extract_src_ip(alert)
        rule_id = self._extract_rule_id(alert)

        correlation_filter = Q()
        if src_ip:
            correlation_filter |= Q(raw_payload__src_ip=src_ip) | Q(raw_payload__ip=src_ip)
        if rule_id:
            correlation_filter |= Q(raw_payload__rule_id=rule_id)

        if not correlation_filter.children:
            return Response([], status=status.HTTP_200_OK)

        queryset = (
            self.get_queryset()
            .filter(customer_id=alert.customer_id, created_at__gte=cutoff)
            .filter(correlation_filter)
            .exclude(pk=alert.pk)
            .order_by("-created_at", "-id")[:5]
        )
        serializer = RelatedAlertSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        request=ExportConfigurableRequestSerializer,
        responses={200: ExportPreviewResponseSerializer},
        tags=["Alerts"],
    )
    @action(detail=False, methods=["post"], url_path="export-configurable")
    def export_configurable(self, request):
        if not has_capability(request.user, CAP_EXPORT):
            return Response({"detail": "Permessi insufficienti per export"}, status=status.HTTP_403_FORBIDDEN)
        serializer = ExportConfigurableRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = dict(serializer.validated_data)
        if "customer_id" not in payload:
            query_customer_id = parse_and_validate_customer_id(
                request.query_params.get("customer_id"),
                user=request.user,
                capability=CAP_EXPORT,
            )
            if query_customer_id is not None:
                payload["customer_id"] = query_customer_id

        columns = payload.get("columns") or [
            "id",
            "title",
            "severity",
            "state",
            "is_active",
            "source_name",
            "event_timestamp",
        ]
        all_results = payload.get("all_results", True)
        preview = payload.get("preview", False)
        preview_limit = payload.get("limit", 5)
        search_request = self._parse_search_payload_for_export(payload)
        alert_ids = self._collect_alert_ids_for_export(search_request, all_results=all_results)

        alerts_map = {
            item.id: item
            for item in Alert.objects.select_related("current_state", "customer")
            .prefetch_related("alert_tags__tag", "assignment", "occurrence")
            .filter(id__in=alert_ids)
        }
        ordered_alerts = [alerts_map[item_id] for item_id in alert_ids if item_id in alerts_map]

        def _build_export_row(alert):
            tags_value = ",".join([tag.name for tag in [item.tag for item in alert.alert_tags.select_related("tag")]])
            occurrence = getattr(alert, "occurrence", None)
            row = []
            row_map = {}
            for column in columns:
                if column.startswith("dyn:"):
                    dynamic_path = column[4:]
                    dynamic_value = extract_path(alert.parsed_payload, dynamic_path)
                    if dynamic_value is None:
                        dynamic_value = extract_path(alert.raw_payload, dynamic_path)
                    row.append(dynamic_value)
                    row_map[column] = dynamic_value
                    continue

                value_map = {
                    "id": alert.id,
                    "title": alert.title,
                    "severity": alert.severity,
                    "state": alert.current_state.name,
                    "is_active": alert.is_active,
                    "source_name": alert.source_name,
                    "source_id": alert.source_id,
                    "event_timestamp": alert.event_timestamp.isoformat(),
                    "created_at": alert.created_at.isoformat(),
                    "updated_at": alert.updated_at.isoformat(),
                    "dedup_fingerprint": alert.dedup_fingerprint,
                    "assignment": (
                        alert.assignment.assigned_to.username
                        if getattr(alert, "assignment", None) and alert.assignment.assigned_to
                        else ""
                    ),
                    "tags": tags_value,
                    "occurrence_count": occurrence.count if occurrence else 1,
                    "parse_error_detail": alert.parse_error_detail,
                }
                value = value_map.get(column, "")
                row.append(value)
                row_map[column] = value
            return row, row_map

        if preview:
            rows = []
            for alert in ordered_alerts[:preview_limit]:
                _, row_map = _build_export_row(alert)
                rows.append(row_map)
            return Response(
                {
                    "count": len(alert_ids),
                    "rows": rows,
                    "columns": columns,
                },
                status=status.HTTP_200_OK,
            )

        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="alerts-configurable.csv"'

        writer = csv.writer(response)
        writer.writerow(columns)

        for alert in ordered_alerts:
            row, _ = _build_export_row(alert)
            writer.writerow(row)

        return response


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.select_related("actor").all()
    serializer_class = AuditLogSerializer
    permission_classes = [TenantSchemaAccessPermission, RoleBasedWritePermission]
    read_capability = CAP_MANAGE_CUSTOMERS

    def get_queryset(self):
        queryset = super().get_queryset()
        customer_id = parse_and_validate_customer_id(
            self.request.query_params.get("customer_id"),
            user=self.request.user,
            capability=CAP_MANAGE_CUSTOMERS,
        )

        action = self.request.query_params.get("action")
        object_type = self.request.query_params.get("object_type")
        object_id = self.request.query_params.get("object_id")
        alert_id = self.request.query_params.get("alert_id")
        actor_id = self.request.query_params.get("actor_id")
        from_dt = self.request.query_params.get("from")
        to_dt = self.request.query_params.get("to")

        if action:
            queryset = queryset.filter(action=action)

        if object_type:
            queryset = queryset.filter(object_type__iexact=object_type)

        if object_id:
            queryset = queryset.filter(object_id=str(object_id))

        if alert_id:
            queryset = queryset.filter(alert_id=alert_id)

        if actor_id:
            queryset = queryset.filter(actor_id=actor_id)

        if customer_id is not None:
            queryset = queryset.filter(alert__customer_id=customer_id)
        else:
            queryset = filter_queryset_by_customer_access(
                queryset,
                self.request.user,
                customer_field="alert__customer_id",
            )

        if from_dt:
            from_parsed = parse_datetime(from_dt)
            if from_parsed:
                queryset = queryset.filter(timestamp__gte=from_parsed)

        if to_dt:
            to_parsed = parse_datetime(to_dt)
            if to_parsed:
                queryset = queryset.filter(timestamp__lte=to_parsed)

        return queryset


class SLAConfigView(APIView):
    permission_classes = [TenantSchemaAccessPermission, permissions.IsAuthenticated]

    @extend_schema(request=None, responses=SLAConfigSerializer(many=True), tags=["Alerts"])
    def get(self, request):
        if not has_capability(request.user, CAP_VIEW):
            return Response({"detail": "Permessi insufficienti"}, status=status.HTTP_403_FORBIDDEN)
        serializer = SLAConfigSerializer(SLAConfig.objects.all().order_by("severity", "id"), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(request=SLAConfigSerializer, responses=SLAConfigSerializer, tags=["Alerts"])
    def post(self, request):
        if not has_capability(request.user, CAP_MANAGE_CUSTOMERS):
            return Response({"detail": "Permessi insufficienti"}, status=status.HTTP_403_FORBIDDEN)

        serializer = SLAConfigSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data
        config, _ = SLAConfig.objects.update_or_create(
            severity=payload["severity"],
            defaults={
                "response_minutes": payload["response_minutes"],
                "resolution_minutes": payload["resolution_minutes"],
            },
        )
        create_audit_log(
            request,
            action="sla_config.updated",
            obj=config,
            diff={
                "severity": config.severity,
                "response_minutes": config.response_minutes,
                "resolution_minutes": config.resolution_minutes,
            },
        )
        return Response(SLAConfigSerializer(config).data, status=status.HTTP_200_OK)


class SavedSearchViewSet(viewsets.ModelViewSet):
    serializer_class = SavedSearchSerializer
    permission_classes = [TenantSchemaAccessPermission, permissions.IsAuthenticated]

    def get_queryset(self):
        if not has_capability(self.request.user, CAP_VIEW):
            return SavedSearch.objects.none()
        queryset = SavedSearch.objects.filter(user=self.request.user).order_by("name", "id")
        customer_id = parse_and_validate_customer_id(
            self.request.query_params.get("customer_id"),
            user=self.request.user,
            capability=CAP_VIEW,
        )
        if customer_id is not None:
            queryset = queryset.filter(customer_id=customer_id)
        else:
            allowed_customer_ids = get_accessible_customer_ids(self.request.user)
            if allowed_customer_ids is not None:
                queryset = queryset.filter(Q(customer_id__in=allowed_customer_ids) | Q(customer__isnull=True))
        return queryset

    def perform_create(self, serializer):
        if not has_capability(self.request.user, CAP_VIEW):
            raise ValidationError({"detail": "Permessi insufficienti"})
        customer = serializer.validated_data.get("customer")
        if customer is None:
            customer_id = parse_and_validate_customer_id(
                self.request.data.get("customer_id", self.request.query_params.get("customer_id"))
            )
            customer = _resolve_customer_by_id(customer_id, user=self.request.user, capability=CAP_VIEW)
        elif customer is not None:
            ensure_customer_capability(self.request.user, customer.id, CAP_VIEW)
        saved_search = serializer.save(user=self.request.user, customer=customer)
        create_audit_log(
            self.request,
            action="saved_search.created",
            obj=saved_search,
            diff={"name": saved_search.name, "customer_id": saved_search.customer_id},
        )

    def perform_update(self, serializer):
        next_customer = serializer.validated_data.get("customer", serializer.instance.customer)
        ensure_customer_capability(self.request.user, getattr(next_customer, "id", None), CAP_VIEW)
        old_name = serializer.instance.name
        saved_search = serializer.save()
        create_audit_log(
            self.request,
            action="saved_search.updated",
            obj=saved_search,
            diff={"old_name": old_name, "new_name": saved_search.name, "customer_id": saved_search.customer_id},
        )

    def perform_destroy(self, instance):
        ensure_customer_capability(self.request.user, instance.customer_id, CAP_VIEW)
        payload = {"name": instance.name}
        super().perform_destroy(instance)
        create_audit_log(
            self.request,
            action="saved_search.deleted",
            obj=instance,
            diff=payload,
        )


class AlertDetailFieldConfigViewSet(viewsets.ModelViewSet):
    serializer_class = AlertDetailFieldConfigSerializer
    permission_classes = [TenantSchemaAccessPermission, permissions.IsAuthenticated]

    def get_queryset(self):
        if not has_capability(self.request.user, CAP_VIEW):
            return AlertDetailFieldConfig.objects.none()
        queryset = AlertDetailFieldConfig.objects.filter(user=self.request.user).order_by(
            "source_name",
            "alert_type",
            "id",
        )
        customer_id = parse_and_validate_customer_id(
            self.request.query_params.get("customer_id"),
            user=self.request.user,
            capability=CAP_VIEW,
        )
        if customer_id is not None:
            queryset = queryset.filter(customer_id=customer_id)
        else:
            allowed_customer_ids = get_accessible_customer_ids(self.request.user)
            if allowed_customer_ids is None:
                queryset = queryset.filter(customer__isnull=True)
            else:
                queryset = queryset.filter(Q(customer_id__in=allowed_customer_ids) | Q(customer__isnull=True))

        source_name = (self.request.query_params.get("source_name") or "").strip()
        alert_type = (self.request.query_params.get("alert_type") or "").strip()
        if source_name:
            queryset = queryset.filter(source_name=source_name)
        if alert_type:
            queryset = queryset.filter(alert_type=alert_type)
        return queryset

    def perform_create(self, serializer):
        if not has_capability(self.request.user, CAP_VIEW):
            raise ValidationError({"detail": "Permessi insufficienti"})
        customer = serializer.validated_data.get("customer")
        if customer is None:
            customer_id = parse_and_validate_customer_id(
                self.request.data.get("customer_id", self.request.query_params.get("customer_id"))
            )
            customer = _resolve_customer_by_id(customer_id, user=self.request.user, capability=CAP_VIEW)
        elif customer is not None:
            ensure_customer_capability(self.request.user, customer.id, CAP_VIEW)
        config = serializer.save(user=self.request.user, customer=customer)
        create_audit_log(
            self.request,
            action="alert_detail_config.created",
            obj=config,
            diff={
                "customer_id": config.customer_id,
                "source_name": config.source_name,
                "alert_type": config.alert_type,
                "visible_fields": config.visible_fields,
            },
        )

    def perform_update(self, serializer):
        next_customer = serializer.validated_data.get("customer", serializer.instance.customer)
        ensure_customer_capability(self.request.user, getattr(next_customer, "id", None), CAP_VIEW)
        old = {
            "customer_id": serializer.instance.customer_id,
            "source_name": serializer.instance.source_name,
            "alert_type": serializer.instance.alert_type,
            "visible_fields": serializer.instance.visible_fields,
        }
        config = serializer.save()
        create_audit_log(
            self.request,
            action="alert_detail_config.updated",
            obj=config,
            diff={
                "old": old,
                "new": {
                    "customer_id": config.customer_id,
                    "source_name": config.source_name,
                    "alert_type": config.alert_type,
                    "visible_fields": config.visible_fields,
                },
            },
        )

    def perform_destroy(self, instance):
        ensure_customer_capability(self.request.user, instance.customer_id, CAP_VIEW)
        payload = {
            "customer_id": instance.customer_id,
            "source_name": instance.source_name,
            "alert_type": instance.alert_type,
        }
        super().perform_destroy(instance)
        create_audit_log(
            self.request,
            action="alert_detail_config.deleted",
            obj=instance,
            diff=payload,
        )

    @action(detail=False, methods=["put"], url_path="set")
    def set_config(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        customer = serializer.validated_data.get("customer")
        if customer is None:
            customer_id = parse_and_validate_customer_id(
                request.data.get("customer_id", request.query_params.get("customer_id")),
                user=request.user,
                capability=CAP_VIEW,
            )
            customer = _resolve_customer_by_id(customer_id, user=request.user, capability=CAP_VIEW)
        elif customer is not None:
            ensure_customer_capability(request.user, customer.id, CAP_VIEW)

        source_name = serializer.validated_data["source_name"]
        alert_type = serializer.validated_data["alert_type"]
        visible_fields = serializer.validated_data.get("visible_fields", [])

        config, _ = AlertDetailFieldConfig.objects.update_or_create(
            user=request.user,
            customer=customer,
            source_name=source_name,
            alert_type=alert_type,
            defaults={"visible_fields": visible_fields},
        )

        create_audit_log(
            request,
            action="alert_detail_config.set",
            obj=config,
            diff={
                "customer_id": config.customer_id,
                "source_name": config.source_name,
                "alert_type": config.alert_type,
                "visible_fields": config.visible_fields,
            },
        )
        response_serializer = self.get_serializer(config)
        return Response(response_serializer.data, status=status.HTTP_200_OK)


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = NotificationEventSerializer
    permission_classes = [TenantSchemaAccessPermission, permissions.IsAuthenticated]

    @staticmethod
    def _apply_target_user_filter(queryset, user):
        return queryset.filter(Q(metadata__target_user_id__isnull=True) | Q(metadata__target_user_id=user.id))

    def get_queryset(self):
        if not has_capability(self.request.user, CAP_VIEW):
            return NotificationEvent.objects.none()
        now = timezone.now()
        queryset = NotificationEvent.objects.select_related("alert", "customer").filter(
            is_active=True,
        ).filter(Q(snoozed_until__isnull=True) | Q(snoozed_until__lte=now))
        queryset = self._apply_target_user_filter(queryset, self.request.user)
        customer_id = parse_and_validate_customer_id(
            self.request.query_params.get("customer_id"),
            user=self.request.user,
            capability=CAP_VIEW,
        )
        if customer_id is not None:
            queryset = queryset.filter(customer_id=customer_id)
        else:
            queryset = filter_queryset_by_customer_access(queryset, self.request.user, include_null=True)
        status_filter = (self.request.query_params.get("status") or "all").strip().lower()
        if status_filter == "unread":
            read_ids = NotificationRead.objects.filter(user=self.request.user).values_list("notification_id", flat=True)
            queryset = queryset.exclude(id__in=read_ids)
        return queryset

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        customer_id = parse_and_validate_customer_id(
            request.query_params.get("customer_id"),
            user=request.user,
            capability=CAP_VIEW,
        )
        limit = min(max(int(request.query_params.get("limit", 30)), 1), 100)
        notifications = list(queryset[:limit])
        user_read_ids = set(
            NotificationRead.objects.filter(user=request.user).values_list("notification_id", flat=True)
        )
        reads_map = {
            item.notification_id: item.read_at
            for item in NotificationRead.objects.filter(
                user=request.user,
                notification_id__in=[item.id for item in notifications],
            )
        }
        serializer = self.get_serializer(
            notifications,
            many=True,
            context={"request": request, "reads_map": reads_map},
        )
        unread_queryset = NotificationEvent.objects.filter(is_active=True)
        unread_queryset = unread_queryset.filter(Q(snoozed_until__isnull=True) | Q(snoozed_until__lte=timezone.now()))
        unread_queryset = self._apply_target_user_filter(unread_queryset, request.user)
        if customer_id is not None:
            unread_queryset = unread_queryset.filter(customer_id=customer_id)
        else:
            unread_queryset = filter_queryset_by_customer_access(unread_queryset, request.user, include_null=True)
        unread_count = unread_queryset.exclude(id__in=user_read_ids).count()
        return Response({"unread_count": unread_count, "results": serializer.data}, status=status.HTTP_200_OK)

    @extend_schema(request=NotificationAckSerializer, responses=inline_serializer(name="NotificationAckResponse", fields={"acknowledged": serializers.IntegerField()}), tags=["Notifications"])
    @action(detail=False, methods=["post"], url_path="ack-all")
    def ack_all(self, request):
        customer_id = parse_and_validate_customer_id(
            request.query_params.get("customer_id"),
            user=request.user,
            capability=CAP_VIEW,
        )
        unread = NotificationEvent.objects.filter(is_active=True).exclude(
            id__in=NotificationRead.objects.filter(user=request.user).values_list("notification_id", flat=True)
        )
        unread = unread.filter(Q(snoozed_until__isnull=True) | Q(snoozed_until__lte=timezone.now()))
        unread = self._apply_target_user_filter(unread, request.user)
        if customer_id is not None:
            unread = unread.filter(customer_id=customer_id)
        else:
            unread = filter_queryset_by_customer_access(unread, request.user, include_null=True)
        created = 0
        for notification in unread:
            _, was_created = NotificationRead.objects.get_or_create(notification=notification, user=request.user)
            if was_created:
                created += 1
        return Response({"acknowledged": created}, status=status.HTTP_200_OK)

    @extend_schema(request=NotificationAckSerializer, responses=inline_serializer(name="NotificationAckSingleResponse", fields={"acknowledged": serializers.BooleanField()}), tags=["Notifications"])
    @action(detail=True, methods=["post"], url_path="ack")
    def ack(self, request, pk=None):
        notification = self.get_object()
        NotificationRead.objects.get_or_create(notification=notification, user=request.user)
        return Response({"acknowledged": True}, status=status.HTTP_200_OK)

    @extend_schema(request=NotificationSnoozeSerializer, responses=NotificationEventSerializer, tags=["Notifications"])
    @action(detail=True, methods=["post"], url_path="snooze")
    def snooze(self, request, pk=None):
        notification = self.get_object()
        serializer = NotificationSnoozeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        snooze_until = payload.get("snooze_until")
        if snooze_until is None:
            snooze_until = timezone.now() + timedelta(minutes=payload["minutes"])
        notification.snoozed_until = snooze_until
        notification.save(update_fields=["snoozed_until", "updated_at"])
        return Response(
            NotificationEventSerializer(notification, context={"request": request, "reads_map": {}}).data,
            status=status.HTTP_200_OK,
        )


class NotificationPreferencesView(APIView):
    permission_classes = [TenantSchemaAccessPermission, permissions.IsAuthenticated]

    @extend_schema(request=None, responses=NotificationPreferencesSerializer, tags=["Notifications"])
    def get(self, request):
        if not has_capability(request.user, CAP_VIEW):
            return Response({"detail": "Permessi insufficienti"}, status=status.HTTP_403_FORBIDDEN)
        prefs = get_or_create_preferences(request.user)
        serializer = NotificationPreferencesSerializer(prefs)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(request=NotificationPreferencesSerializer, responses=NotificationPreferencesSerializer, tags=["Notifications"])
    def patch(self, request):
        if not has_capability(request.user, CAP_VIEW):
            return Response({"detail": "Permessi insufficienti"}, status=status.HTTP_403_FORBIDDEN)

        prefs = get_or_create_preferences(request.user)
        serializer = NotificationPreferencesSerializer(prefs, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        customer_filter = serializer.validated_data.pop("customer_filter", None)
        prefs = serializer.save()
        if customer_filter is not None:
            allowed_customer_ids = get_accessible_customer_ids(request.user)
            if allowed_customer_ids is not None:
                customer_filter = [customer for customer in customer_filter if customer.id in allowed_customer_ids]
            prefs.customer_filter.set(customer_filter)
        return Response(NotificationPreferencesSerializer(prefs).data, status=status.HTTP_200_OK)


class PushSubscriptionView(APIView):
    permission_classes = [TenantSchemaAccessPermission, permissions.IsAuthenticated]

    @extend_schema(request=PushSubscriptionUpsertSerializer, responses=PushSubscriptionSerializer, tags=["Notifications"])
    def post(self, request):
        if not bool(getattr(settings, "ENABLE_BROWSER_PUSH", False)):
            return Response({"detail": "Browser push disabilitato"}, status=status.HTTP_404_NOT_FOUND)

        serializer = PushSubscriptionUpsertSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data
        keys = payload["keys"]

        subscription, _ = PushSubscription.objects.update_or_create(
            user=request.user,
            endpoint=payload["endpoint"],
            defaults={
                "p256dh": keys["p256dh"],
                "auth": keys["auth"],
                "is_active": True,
                "user_agent": request.META.get("HTTP_USER_AGENT", "")[:255],
            },
        )
        return Response(PushSubscriptionSerializer(subscription).data, status=status.HTTP_200_OK)


class AttachmentDownloadView(APIView):
    permission_classes = [TenantSchemaAccessPermission, permissions.IsAuthenticated]

    @extend_schema(
        request=None,
        responses={200: OpenApiTypes.BINARY},
        tags=["Alerts"],
    )
    def get(self, request, pk: int):
        if not has_capability(request.user, CAP_VIEW):
            raise PermissionDenied({"detail": "Permessi insufficienti"})

        attachment = Attachment.objects.select_related("alert", "alert__customer").filter(pk=pk).first()
        if not attachment:
            raise Http404

        customer_id = attachment.alert.customer_id
        if customer_id is not None:
            try:
                ensure_customer_capability(request.user, customer_id, CAP_VIEW)
            except PermissionDenied as exc:
                create_security_audit_event(
                    request,
                    action="attachment.download_denied",
                    object_type="Attachment",
                    object_id=attachment.id,
                    metadata={
                        "alert_id": attachment.alert_id,
                        "customer_id": customer_id,
                        "reason": "customer_scope_denied",
                    },
                )
                raise exc

        if customer_id is not None:
            enabled_source_names = get_enabled_source_names_for_customer(customer_id)
            if enabled_source_names is not None and attachment.alert.source_name not in enabled_source_names:
                create_security_audit_event(
                    request,
                    action="attachment.download_denied",
                    object_type="Attachment",
                    object_id=attachment.id,
                    metadata={
                        "alert_id": attachment.alert_id,
                        "customer_id": customer_id,
                        "reason": "source_disabled_for_customer",
                    },
                )
                raise PermissionDenied({"detail": "Fonte non abilitata per il cliente selezionato"})

        if not attachment.file:
            raise Http404
        try:
            file_handle = attachment.file.open("rb")
        except FileNotFoundError as exc:
            raise Http404 from exc

        create_audit_log(
            request,
            action="alert.attachment_downloaded",
            obj=attachment,
            alert=attachment.alert,
            diff={
                "filename": attachment.filename,
                "size": attachment.size,
                "content_type": attachment.content_type,
            },
        )
        create_security_audit_event(
            request,
            action="attachment.downloaded",
            object_type="Attachment",
            object_id=attachment.id,
            metadata={
                "alert_id": attachment.alert_id,
                "customer_id": customer_id,
                "filename": attachment.filename,
                "size": attachment.size,
            },
        )

        safe_filename = get_valid_filename(attachment.filename or f"attachment-{attachment.id}.bin")
        response = FileResponse(
            file_handle,
            as_attachment=True,
            filename=safe_filename,
            content_type=attachment.content_type or "application/octet-stream",
        )
        response["X-Content-Type-Options"] = "nosniff"
        return response


class AlertSearchView(APIView):
    permission_classes = [TenantSchemaAccessPermission, permissions.IsAuthenticated]

    @extend_schema(
        request=AlertSearchRequestSerializer,
        responses=inline_serializer(
            name="AlertSearchResponse",
            fields={
                "backend": serializers.CharField(),
                "count": serializers.IntegerField(),
                "page": serializers.IntegerField(),
                "page_size": serializers.IntegerField(),
                "results": AlertListSerializer(many=True),
            },
        ),
        tags=["Alerts Search"],
    )
    def post(self, request):
        if not has_capability(request.user, CAP_VIEW):
            return Response({"detail": "Permessi insufficienti"}, status=status.HTTP_403_FORBIDDEN)
        serializer = AlertSearchRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = dict(serializer.validated_data)
        filter_helper = AbstractBaseFilter(request.user)
        if "customer_id" not in payload:
            query_customer_id = parse_and_validate_customer_id(
                request.query_params.get("customer_id"),
                user=request.user,
                capability=CAP_VIEW,
            )
            if query_customer_id is not None:
                payload["customer_id"] = query_customer_id
        elif payload.get("customer_id") is not None:
            ensure_customer_capability(request.user, payload.get("customer_id"), CAP_VIEW)

        assignee_id = filter_helper.resolve_assignee(payload.get("assignee"))

        search_request = SearchRequest(
            customer_id=payload.get("customer_id"),
            text=payload.get("text", ""),
            source_name=payload.get("source_name", ""),
            source_names=payload.get("source_names", []),
            state_id=payload.get("state_id"),
            state_ids=payload.get("state_ids", []),
            severity=payload.get("severity", ""),
            severities=payload.get("severities", []),
            alert_types=payload.get("alert_types", []),
            tag_ids=payload.get("tag_ids", []),
            event_timestamp_from=payload.get("event_timestamp_from"),
            event_timestamp_to=payload.get("event_timestamp_to"),
            is_active=payload.get("is_active"),
            assigned_to_id=assignee_id,
            in_state_since=payload.get("in_state_since"),
            dynamic_filters=payload.get("dynamic_filters", []),
            ordering=payload.get("ordering", "-event_timestamp"),
            page=payload.get("page", 1),
            page_size=payload.get("page_size", 25),
            allowed_customer_ids=get_accessible_customer_ids(request.user),
        )
        result = search_alerts(search_request)

        alerts_map = {
            item.id: item
            for item in Alert.objects.select_related("current_state", "customer")
            .prefetch_related("alert_tags__tag", "assignment")
            .filter(id__in=result.alert_ids)
        }
        ordered_alerts = [alerts_map[item_id] for item_id in result.alert_ids if item_id in alerts_map]

        data = AlertListSerializer(ordered_alerts, many=True, context={"request": request}).data
        return Response(
            {
                "backend": result.backend,
                "count": result.total,
                "page": search_request.page,
                "page_size": search_request.page_size,
                "results": data,
            },
            status=status.HTTP_200_OK,
        )


class SourceFieldSchemaView(APIView):
    permission_classes = [TenantSchemaAccessPermission, permissions.IsAuthenticated]

    @extend_schema(
        responses=inline_serializer(
            name="SourceFieldSchemaResponse",
            many=True,
            fields={
                "source_name": serializers.CharField(),
                "fields": inline_serializer(
                    name="SourceFieldSchemaField",
                    many=True,
                    fields={
                        "field": serializers.CharField(),
                        "type": serializers.CharField(),
                    },
                ),
            },
        ),
        tags=["Alerts Search"],
    )
    def get(self, request):
        if not has_capability(request.user, CAP_VIEW):
            return Response({"detail": "Permessi insufficienti"}, status=status.HTTP_403_FORBIDDEN)
        source_name = (request.query_params.get("source_name") or "").strip()
        customer_id = parse_and_validate_customer_id(
            request.query_params.get("customer_id"),
            user=request.user,
            capability=CAP_VIEW,
        )
        if source_name:
            return Response(
                [{"source_name": source_name, "fields": build_source_field_schema(source_name, customer_id=customer_id)}],
                status=status.HTTP_200_OK,
            )
        if customer_id is None:
            allowed_customer_ids = get_accessible_customer_ids(request.user)
            if allowed_customer_ids is None:
                return Response(build_all_source_field_schemas(customer_id=None), status=status.HTTP_200_OK)
            merged: dict[str, list[dict]] = {}
            for scoped_customer_id in sorted(allowed_customer_ids):
                for item in build_all_source_field_schemas(customer_id=scoped_customer_id):
                    source_name_key = item.get("source_name")
                    if not source_name_key:
                        continue
                    existing = merged.get(source_name_key, [])
                    known_fields = {entry.get("field") for entry in existing}
                    for field_item in item.get("fields", []):
                        if field_item.get("field") in known_fields:
                            continue
                        existing.append(field_item)
                    merged[source_name_key] = existing
            payload = [{"source_name": key, "fields": value} for key, value in sorted(merged.items())]
            return Response(payload, status=status.HTTP_200_OK)
        return Response(build_all_source_field_schemas(customer_id=customer_id), status=status.HTTP_200_OK)
