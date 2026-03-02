import time

from django.core.cache import cache
from django.utils import timezone
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from tenant_data.audit import create_audit_log
from tenant_data.ingestion.service import run_ingestion_for_source, test_source_connection
from tenant_data.ingestion_serializers import IngestionRunSerializer, SourceSerializer
from tenant_data.models import IngestionRun, Source, SourceConfig
from tenant_data.permissions import RoleBasedWritePermission
from tenant_data.tasks import ingest_source_task


class SourceViewSet(viewsets.ModelViewSet):
    queryset = Source.objects.select_related("config", "dedup_policy", "parser_definition").all()
    serializer_class = SourceSerializer
    permission_classes = [RoleBasedWritePermission]
    write_roles = (User.Role.SUPER_ADMIN, User.Role.SOC_MANAGER)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["request"] = self.request
        return context

    def perform_create(self, serializer):
        source = serializer.save()
        create_audit_log(
            self.request,
            action="source.created",
            obj=source,
            diff={
                "name": source.name,
                "type": source.type,
                "is_enabled": source.is_enabled,
            },
        )

    def perform_update(self, serializer):
        old = {
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
                    "name": source.name,
                    "type": source.type,
                    "is_enabled": source.is_enabled,
                    "severity_map": source.severity_map,
                },
            },
        )

    def perform_destroy(self, instance):
        payload = {"name": instance.name, "type": instance.type}
        super().perform_destroy(instance)
        create_audit_log(self.request, action="source.deleted", obj=instance, diff=payload)

    @extend_schema(request=None, responses=inline_serializer(name="TestConnectionResponse", fields={"ok": serializers.BooleanField(), "detail": serializers.CharField()}), tags=["Ingestion Sources"])
    @action(detail=True, methods=["post"], url_path="test-connection")
    def test_connection(self, request, pk=None):
        source = self.get_object()
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
        if source.type == Source.Type.WEBHOOK:
            return Response(
                {"detail": "Run now non disponibile per fonti webhook push"},
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


class IngestionRunViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = IngestionRun.objects.select_related("source").prefetch_related("events").all()
    serializer_class = IngestionRunSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()

        source_id = self.request.query_params.get("source_id")
        status_filter = self.request.query_params.get("status")
        trigger = self.request.query_params.get("trigger")

        if source_id:
            queryset = queryset.filter(source_id=source_id)

        if status_filter:
            queryset = queryset.filter(status=status_filter)

        if trigger:
            queryset = queryset.filter(trigger=trigger)

        return queryset


class WebhookIngestionView(APIView):
    permission_classes = [permissions.AllowAny]

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


class MockRestEventsView(APIView):
    permission_classes = [permissions.AllowAny]

    @extend_schema(
        responses=inline_serializer(
            name="MockRestEventsResponse",
            many=True,
            fields={
                "event_id": serializers.CharField(),
                "title": serializers.CharField(),
                "severity": serializers.CharField(),
                "timestamp": serializers.CharField(),
                "message": serializers.CharField(),
            },
        ),
        tags=["Ingestion Mock"],
    )
    def get(self, request):
        now = timezone.now().isoformat()
        return Response(
            [
                {
                    "event_id": "rest-demo-1",
                    "title": "REST suspicious activity",
                    "severity": "high",
                    "timestamp": now,
                    "message": "Evento REST demo ripetibile per dedup",
                },
                {
                    "event_id": "rest-demo-2",
                    "title": "REST parser failure demo",
                    "severity": "medium",
                    "timestamp": now,
                    "message": "Evento con parse error controllato",
                    "force_parse_error": True,
                    "parse_error_message": "Errore parser simulato da REST mock",
                },
            ]
        )
