import time
from datetime import timedelta

from django.core.cache import cache
from django.db.models import Avg, Count, DurationField, ExpressionWrapper, F, Q, Sum
from django.utils import timezone
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.rbac import CAP_MANAGE_SOURCES, CAP_VIEW, has_capability
from core.throttling import WebhookRateThrottle
from tenant_data.audit import create_audit_log
from tenant_data.ingestion.parser import parse_parser_config_text
from tenant_data.ingestion.service import run_ingestion_for_source, test_source_connection
from tenant_data.ingestion_serializers import (
    IngestionRunSerializer,
    SourceErrorLogSerializer,
    SourceSerializer,
    SourceStatsSerializer,
)
from tenant_data.models import IngestionRun, ParserDefinition, ParserRevision, Source, SourceConfig
from tenant_data.permissions import RoleBasedWritePermission, TenantSchemaAccessPermission
from tenant_data.rbac import (
    ensure_customer_capability,
    filter_queryset_by_customer_access,
    parse_and_validate_customer_id,
    resolve_customer_for_user,
)
from tenant_data.source_capabilities import (
    get_source_preset,
    list_source_presets,
    list_source_type_capabilities,
)
from tenant_data.tasks import ingest_source_task


class SourceCreateFromPresetSerializer(serializers.Serializer):
    preset_key = serializers.CharField()
    name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    description = serializers.CharField(required=False, allow_blank=True)
    customer_id = serializers.IntegerField(required=False, allow_null=True)


class SourceViewSet(viewsets.ModelViewSet):
    queryset = (
        Source.objects.select_related("config", "dedup_policy", "parser_definition", "customer")
        .prefetch_related("alert_type_rules")
        .all()
    )
    serializer_class = SourceSerializer
    permission_classes = [TenantSchemaAccessPermission, RoleBasedWritePermission]
    read_capability = CAP_MANAGE_SOURCES
    write_capability = CAP_MANAGE_SOURCES

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["request"] = self.request
        return context

    def _parse_customer_id(self, raw_value):
        return parse_and_validate_customer_id(
            raw_value,
            user=self.request.user,
            capability=CAP_MANAGE_SOURCES,
        )

    def _resolve_customer(self, customer_id):
        return resolve_customer_for_user(
            customer_id,
            user=self.request.user,
            capability=CAP_MANAGE_SOURCES,
        )

    def get_queryset(self):
        queryset = super().get_queryset()
        customer_id = self._parse_customer_id(self.request.query_params.get("customer_id"))
        scope = self.request.query_params.get("scope")
        status_filter = (self.request.query_params.get("status") or "").strip().lower()
        if customer_id is not None:
            queryset = queryset.filter(customer_id=customer_id)
        elif getattr(self, "action", None) == "list" and scope != "all":
            queryset = queryset.filter(customer__isnull=True)
        queryset = filter_queryset_by_customer_access(queryset, self.request.user, include_null=True)
        if status_filter == "active":
            queryset = queryset.filter(is_enabled=True)
        elif status_filter in {"inactive", "disabled"}:
            queryset = queryset.filter(is_enabled=False)
        return queryset

    def perform_create(self, serializer):
        customer = serializer.validated_data.get("customer")
        if customer is None and (
            self.request.data.get("customer") is not None
            or self.request.data.get("customer_id") is not None
            or self.request.query_params.get("customer_id") is not None
        ):
            customer_id = self._parse_customer_id(
                self.request.data.get("customer_id", self.request.query_params.get("customer_id"))
            )
            customer = self._resolve_customer(customer_id)
        elif customer is not None:
            ensure_customer_capability(self.request.user, customer.id, CAP_MANAGE_SOURCES)
        source = serializer.save(customer=customer)
        create_audit_log(
            self.request,
            action="source.created",
            obj=source,
            diff={
                "customer_id": source.customer_id,
                "name": source.name,
                "type": source.type,
                "is_enabled": source.is_enabled,
            },
        )

    def perform_update(self, serializer):
        next_customer = serializer.validated_data.get("customer", serializer.instance.customer)
        ensure_customer_capability(self.request.user, getattr(next_customer, "id", None), CAP_MANAGE_SOURCES)
        old = {
            "customer_id": serializer.instance.customer_id,
            "name": serializer.instance.name,
            "type": serializer.instance.type,
            "is_enabled": serializer.instance.is_enabled,
            "severity_map": serializer.instance.severity_map,
        }
        source = serializer.save()
        create_audit_log(
            self.request,
            action="source.updated",
            obj=source,
            diff={
                "old": old,
                "new": {
                    "customer_id": source.customer_id,
                    "name": source.name,
                    "type": source.type,
                    "is_enabled": source.is_enabled,
                    "severity_map": source.severity_map,
                },
            },
        )

    def perform_destroy(self, instance):
        ensure_customer_capability(self.request.user, instance.customer_id, CAP_MANAGE_SOURCES)
        payload = {"name": instance.name, "type": instance.type}
        super().perform_destroy(instance)
        create_audit_log(self.request, action="source.deleted", obj=instance, diff=payload)

    @extend_schema(
        request=None,
        responses=inline_serializer(
            name="SourceCapabilitiesResponse",
            fields={
                "types": inline_serializer(
                    name="SourceTypeCapability",
                    many=True,
                    fields={
                        "type": serializers.CharField(),
                        "label": serializers.CharField(),
                        "status": serializers.CharField(),
                        "is_operational": serializers.BooleanField(),
                        "create_enabled": serializers.BooleanField(),
                        "supports_test_connection": serializers.BooleanField(),
                        "supports_run_now": serializers.BooleanField(),
                        "supports_polling": serializers.BooleanField(),
                        "supports_push": serializers.BooleanField(),
                        "notes": serializers.CharField(),
                    },
                ),
                "presets": inline_serializer(
                    name="SourcePresetCapability",
                    many=True,
                    fields={
                        "key": serializers.CharField(),
                        "label": serializers.CharField(),
                        "description": serializers.CharField(),
                        "source_type": serializers.CharField(),
                        "status": serializers.CharField(),
                        "auto_parser": serializers.BooleanField(),
                    },
                ),
            },
        ),
        tags=["Ingestion Sources"],
    )
    @action(detail=False, methods=["get"], url_path="capabilities")
    def capabilities(self, request):
        return Response(
            {
                "types": list_source_type_capabilities(),
                "presets": list_source_presets(),
            },
            status=status.HTTP_200_OK,
        )

    @extend_schema(
        request=SourceCreateFromPresetSerializer,
        responses=SourceSerializer,
        tags=["Ingestion Sources"],
    )
    @action(detail=False, methods=["post"], url_path="create-from-preset")
    def create_from_preset(self, request):
        serializer = SourceCreateFromPresetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data
        preset_key = payload["preset_key"]
        preset = get_source_preset(preset_key)
        if not preset:
            return Response({"detail": "Preset non trovato"}, status=status.HTTP_404_NOT_FOUND)

        customer_id = payload.get("customer_id")
        customer = None
        if customer_id is not None:
            customer = resolve_customer_for_user(
                customer_id,
                user=request.user,
                capability=CAP_MANAGE_SOURCES,
            )

        source_payload = preset["source_payload"]
        if payload.get("name"):
            source_payload["name"] = payload.get("name").strip()
        if payload.get("description") is not None:
            source_payload["description"] = payload.get("description", "").strip()
        if customer is not None:
            source_payload["customer"] = customer.id

        source_serializer = SourceSerializer(data=source_payload, context=self.get_serializer_context())
        source_serializer.is_valid(raise_exception=True)
        source = source_serializer.save(customer=customer)

        parser_payload = preset.get("parser")
        if parser_payload:
            parser_definition = ParserDefinition.objects.create(
                source=source,
                name=parser_payload.get("name", f"{source.name} Parser"),
                description=parser_payload.get("description", ""),
                is_enabled=True,
            )
            config_text = parser_payload.get("config_text", "")
            config_data = parse_parser_config_text(config_text)
            parser_revision = ParserRevision.objects.create(
                parser_definition=parser_definition,
                version=1,
                config_text=config_text,
                config_data=config_data,
                created_by=request.user if request.user.is_authenticated else None,
            )
            parser_definition.active_revision = parser_revision
            parser_definition.save(update_fields=["active_revision", "updated_at"])

        create_audit_log(
            request,
            action="source.created_from_preset",
            obj=source,
            diff={
                "preset_key": preset_key,
                "name": source.name,
                "type": source.type,
                "customer_id": source.customer_id,
            },
        )

        response_payload = SourceSerializer(source, context=self.get_serializer_context()).data
        return Response(response_payload, status=status.HTTP_201_CREATED)

    @extend_schema(request=None, responses=inline_serializer(name="TestConnectionResponse", fields={"ok": serializers.BooleanField(), "detail": serializers.CharField()}), tags=["Ingestion Sources"])
    @action(detail=True, methods=["post"], url_path="test-connection")
    def test_connection(self, request, pk=None):
        source = self.get_object()
        ensure_customer_capability(request.user, source.customer_id, CAP_MANAGE_SOURCES)
        result = test_source_connection(source)
        config, _ = SourceConfig.objects.get_or_create(source=source)

        config.last_polled_at = timezone.now()
        config.status = config.Status.HEALTHY if result["ok"] else config.Status.ERROR
        config.last_error = "" if result["ok"] else result.get("detail", "")
        config.health_details = {"connection_test": result}
        config.save(update_fields=["last_polled_at", "status", "last_error", "health_details", "updated_at"])

        create_audit_log(
            request,
            action="source.test_connection",
            obj=source,
            diff=result,
        )

        return Response(result, status=status.HTTP_200_OK)

    @extend_schema(request=None, responses=inline_serializer(name="RunNowResponse", fields={"task_id": serializers.CharField(), "detail": serializers.CharField()}), tags=["Ingestion Sources"])
    @action(detail=True, methods=["post"], url_path="run-now")
    def run_now(self, request, pk=None):
        source = self.get_object()
        ensure_customer_capability(request.user, source.customer_id, CAP_MANAGE_SOURCES)
        if source.type == Source.Type.WEBHOOK:
            return Response(
                {"detail": "Run now non disponibile per fonti webhook push"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if source.type not in {Source.Type.IMAP, Source.Type.REST}:
            return Response(
                {"detail": f"Run now non disponibile per fonti di tipo {source.type}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        schema_name = getattr(request.tenant, "schema_name", "public")
        task = ingest_source_task.delay(schema_name, source.id, IngestionRun.Trigger.MANUAL)

        create_audit_log(
            request,
            action="source.run_now",
            obj=source,
            diff={"task_id": task.id, "schema_name": schema_name},
        )

        return Response({"task_id": task.id, "detail": "Ingestion avviata"}, status=status.HTTP_202_ACCEPTED)

    @extend_schema(
        request=None,
        responses=SourceStatsSerializer,
        tags=["Ingestion Sources"],
    )
    @action(detail=True, methods=["get"], url_path="stats")
    def stats(self, request, pk=None):
        source = self.get_object()
        ensure_customer_capability(request.user, source.customer_id, CAP_MANAGE_SOURCES)

        now = timezone.now()
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = now - timedelta(days=7)

        base_queryset = IngestionRun.objects.filter(source=source)
        last_run = base_queryset.order_by("-started_at", "-id").first()

        today_aggregates = base_queryset.filter(started_at__gte=day_start).aggregate(
            runs_today=Count("id"),
            records_today=Sum("processed_count"),
        )
        week_aggregates = base_queryset.filter(started_at__gte=week_start).aggregate(
            total_runs_7d=Count("id"),
            error_runs_7d=Count("id", filter=Q(status=IngestionRun.Status.ERROR)),
        )
        duration_aggregates = base_queryset.filter(started_at__gte=day_start).aggregate(
            avg_duration_today=Avg(
                ExpressionWrapper(
                    F("finished_at") - F("started_at"),
                    output_field=DurationField(),
                ),
                filter=Q(finished_at__isnull=False),
            ),
        )

        total_runs_7d = int(week_aggregates.get("total_runs_7d") or 0)
        error_runs_7d = int(week_aggregates.get("error_runs_7d") or 0)
        error_rate_7d = float(error_runs_7d / total_runs_7d) if total_runs_7d else 0.0
        avg_duration = duration_aggregates.get("avg_duration_today")
        avg_duration_seconds = float(avg_duration.total_seconds()) if avg_duration is not None else None
        last_run_status = getattr(last_run, "status", None)
        if last_run_status not in {IngestionRun.Status.SUCCESS, IngestionRun.Status.ERROR, IngestionRun.Status.PARTIAL}:
            last_run_status = None

        payload = {
            "last_run_at": getattr(last_run, "started_at", None),
            "last_run_status": last_run_status,
            "runs_today": int(today_aggregates.get("runs_today") or 0),
            "records_today": int(today_aggregates.get("records_today") or 0),
            "error_rate_7d": round(error_rate_7d, 4),
            "avg_duration_seconds": round(avg_duration_seconds, 2) if avg_duration_seconds is not None else None,
        }
        serializer = SourceStatsSerializer(payload)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        request=None,
        responses=SourceErrorLogSerializer(many=True),
        tags=["Ingestion Sources"],
    )
    @action(detail=True, methods=["get"], url_path="error-log")
    def error_log(self, request, pk=None):
        source = self.get_object()
        ensure_customer_capability(request.user, source.customer_id, CAP_MANAGE_SOURCES)

        runs = (
            IngestionRun.objects.filter(source=source, status=IngestionRun.Status.ERROR)
            .order_by("-started_at", "-id")[:20]
        )

        response_payload = []
        for run in runs:
            duration_seconds = None
            if run.finished_at:
                duration_seconds = max((run.finished_at - run.started_at).total_seconds(), 0.0)
            response_payload.append(
                {
                    "id": run.id,
                    "status": run.status,
                    "started_at": run.started_at,
                    "finished_at": run.finished_at,
                    "duration_seconds": round(duration_seconds, 2) if duration_seconds is not None else None,
                    "error_message": run.error_message or "",
                    "error_detail": run.error_detail,
                }
            )

        serializer = SourceErrorLogSerializer(response_payload, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class IngestionRunViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = IngestionRun.objects.select_related("source", "customer").prefetch_related("events").all()
    serializer_class = IngestionRunSerializer
    permission_classes = [TenantSchemaAccessPermission, permissions.IsAuthenticated]

    def get_queryset(self):
        if not has_capability(self.request.user, CAP_VIEW):
            return IngestionRun.objects.none()
        queryset = super().get_queryset()

        customer_id = self.request.query_params.get("customer_id")
        source_id = self.request.query_params.get("source_id")
        status_filter = self.request.query_params.get("status")
        trigger = self.request.query_params.get("trigger")

        if customer_id:
            parsed_customer_id = parse_and_validate_customer_id(
                customer_id,
                user=self.request.user,
                capability=CAP_VIEW,
            )
            queryset = queryset.filter(customer_id=parsed_customer_id)
        else:
            queryset = filter_queryset_by_customer_access(queryset, self.request.user, include_null=True)

        if source_id:
            queryset = queryset.filter(source_id=source_id)

        if status_filter:
            queryset = queryset.filter(status=status_filter)

        if trigger:
            queryset = queryset.filter(trigger=trigger)

        return queryset


class WebhookIngestionView(APIView):
    permission_classes = [TenantSchemaAccessPermission]
    throttle_classes = [WebhookRateThrottle]

    def _check_rate_limit(self, source_id, config):
        limit = int(config.rate_limit_per_minute or 60)
        minute_bucket = int(time.time() // 60)
        key = f"webhook-rate:{source_id}:{minute_bucket}"

        current = cache.get(key, 0)
        if current >= limit:
            return False

        cache.set(key, current + 1, timeout=120)
        return True

    def post(self, request, source_id):
        source = Source.objects.select_related(
            "config",
            "dedup_policy",
            "parser_definition",
            "parser_definition__active_revision",
        ).filter(id=source_id).first()
        if not source:
            return Response({"detail": "Source non trovata"}, status=status.HTTP_404_NOT_FOUND)

        if source.type != Source.Type.WEBHOOK:
            return Response({"detail": "Source non webhook"}, status=status.HTTP_400_BAD_REQUEST)

        if not source.is_enabled:
            return Response({"detail": "Source disabilitata"}, status=status.HTTP_400_BAD_REQUEST)
        config, _ = SourceConfig.objects.get_or_create(source=source)

        api_key = request.headers.get("X-API-Key") or request.query_params.get("api_key")
        if not api_key or api_key != config.webhook_api_key:
            return Response({"detail": "API key non valida"}, status=status.HTTP_403_FORBIDDEN)

        if not self._check_rate_limit(source.id, config):
            return Response({"detail": "Rate limit superato"}, status=status.HTTP_429_TOO_MANY_REQUESTS)

        payload = request.data
        if isinstance(payload, list):
            pushed_events = payload
        else:
            pushed_events = [payload]

        run = run_ingestion_for_source(source, trigger=IngestionRun.Trigger.WEBHOOK, pushed_events=pushed_events)

        return Response(
            {
                "run_id": run.id,
                "status": run.status,
                "processed": run.processed_count,
                "created": run.created_count,
                "updated": run.updated_count,
                "errors": run.error_count,
            },
            status=status.HTTP_202_ACCEPTED,
        )

