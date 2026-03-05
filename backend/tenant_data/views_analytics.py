from datetime import timedelta

from django.core.cache import cache
from django.db.models import Avg, Count, DurationField, ExpressionWrapper, F, Min, Q, Sum
from django.db.models.functions import ExtractHour, ExtractWeekDay, TruncDay
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.rbac import CAP_MANAGE_CUSTOMERS, CAP_VIEW, has_capability
from tenant_data.models import Alert, IngestionRun, SLAConfig
from tenant_data.permissions import TenantSchemaAccessPermission
from tenant_data.rbac import filter_queryset_by_customer_access
from tenant_data.serializers_analytics import (
    AnalyticsByCustomerItemSerializer,
    AnalyticsBySourceItemSerializer,
    AnalyticsHeatmapResponseSerializer,
    AnalyticsOverviewResponseSerializer,
)


def _parse_range(request):
    now = timezone.now()
    to_raw = request.query_params.get("to")
    from_raw = request.query_params.get("from")

    to_dt = parse_datetime(to_raw) if to_raw else now
    from_dt = parse_datetime(from_raw) if from_raw else to_dt - timedelta(days=30)

    if from_dt is None or to_dt is None:
        raise PermissionDenied("Parametri from/to non validi")

    if timezone.is_naive(from_dt):
        from_dt = timezone.make_aware(from_dt, timezone.get_current_timezone())
    if timezone.is_naive(to_dt):
        to_dt = timezone.make_aware(to_dt, timezone.get_current_timezone())

    if from_dt > to_dt:
        from_dt, to_dt = to_dt, from_dt

    return from_dt, to_dt


def _cache_key(request, scope, from_dt, to_dt):
    tenant = getattr(request, "tenant", None)
    tenant_key = getattr(tenant, "schema_name", "public")
    return f"analytics:{scope}:{tenant_key}:{request.user.id}:{from_dt.isoformat()}:{to_dt.isoformat()}"


def _alert_queryset_for_user(request, from_dt, to_dt):
    queryset = Alert.objects.select_related("current_state", "customer", "assignment")
    queryset = filter_queryset_by_customer_access(queryset, request.user, customer_field="customer_id")
    return queryset.filter(event_timestamp__gte=from_dt, event_timestamp__lte=to_dt)


def _duration_to_hours(value):
    if value is None:
        return None
    seconds = value.total_seconds()
    return round(seconds / 3600, 2)


class AnalyticsOverviewView(APIView):
    permission_classes = [permissions.IsAuthenticated, TenantSchemaAccessPermission]

    @extend_schema(responses=AnalyticsOverviewResponseSerializer, tags=["Analytics"])
    def get(self, request):
        if not has_capability(request.user, CAP_VIEW):
            raise PermissionDenied("Permessi insufficienti")

        from_dt, to_dt = _parse_range(request)
        cache_key = _cache_key(request, "overview", from_dt, to_dt)
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached, status=status.HTTP_200_OK)

        queryset = _alert_queryset_for_user(request, from_dt, to_dt)
        total = queryset.count()
        closed_count = queryset.filter(current_state__is_final=True).count()
        critical_count = queryset.filter(severity=Alert.Severity.CRITICAL).count()

        closed = queryset.filter(current_state__is_final=True).annotate(
            duration=ExpressionWrapper(F("updated_at") - F("created_at"), output_field=DurationField())
        )
        mttr = closed.aggregate(avg=Avg("duration")).get("avg")

        by_day_rows = (
            queryset.annotate(day=TruncDay("event_timestamp"))
            .values("day", "severity")
            .annotate(count=Count("id"))
            .order_by("day")
        )
        day_map = {}
        for row in by_day_rows:
            day_key = row["day"].date().isoformat()
            if day_key not in day_map:
                day_map[day_key] = {
                    "day": day_key,
                    "critical": 0,
                    "high": 0,
                    "medium": 0,
                    "low": 0,
                }
            day_map[day_key][row["severity"]] = int(row["count"])

        state_distribution = list(
            queryset.values("current_state__name").annotate(count=Count("id")).order_by("current_state__name")
        )

        mttr_daily_rows = (
            closed.annotate(day=TruncDay("updated_at"))
            .values("day")
            .annotate(avg_duration=Avg("duration"))
            .order_by("day")
        )
        mttr_daily = [
            {
                "day": row["day"].date().isoformat(),
                "mttr_hours": _duration_to_hours(row["avg_duration"]),
            }
            for row in mttr_daily_rows
        ]

        payload = {
            "kpis": {
                "total_alerts": total,
                "closure_rate": round((closed_count / total * 100.0), 2) if total else 0.0,
                "mttr_hours": _duration_to_hours(mttr),
                "critical_alerts": critical_count,
            },
            "alerts_by_day": list(day_map.values()),
            "state_distribution": [
                {"state": item["current_state__name"] or "-", "count": int(item["count"])} for item in state_distribution
            ],
            "mttr_daily": mttr_daily,
        }

        cache.set(cache_key, payload, timeout=300)
        return Response(payload, status=status.HTTP_200_OK)


class AnalyticsBySourceView(APIView):
    permission_classes = [permissions.IsAuthenticated, TenantSchemaAccessPermission]

    @extend_schema(responses=AnalyticsBySourceItemSerializer(many=True), tags=["Analytics"])
    def get(self, request):
        if not has_capability(request.user, CAP_VIEW):
            raise PermissionDenied("Permessi insufficienti")

        from_dt, to_dt = _parse_range(request)
        cache_key = _cache_key(request, "by_source", from_dt, to_dt)
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached, status=status.HTTP_200_OK)

        queryset = _alert_queryset_for_user(request, from_dt, to_dt)

        grouped = list(
            queryset.values("source_name")
            .annotate(
                alert_total=Count("id"),
                critical_count=Count("id", filter=Q(severity=Alert.Severity.CRITICAL)),
            )
            .order_by("-alert_total", "source_name")
        )

        closed_by_source = {
            item["source_name"]: item["avg_duration"]
            for item in (
                queryset.filter(current_state__is_final=True)
                .annotate(duration=ExpressionWrapper(F("updated_at") - F("created_at"), output_field=DurationField()))
                .values("source_name")
                .annotate(avg_duration=Avg("duration"))
            )
        }

        ingestion_totals = {}
        source_id_map = {}
        for item in IngestionRun.objects.values("source__name").annotate(
            records_ingested_total=Sum("processed_count"),
            source_id=Min("source_id"),
        ):
            source_name = item["source__name"]
            ingestion_totals[source_name] = int(item["records_ingested_total"] or 0)
            source_id_map[source_name] = int(item["source_id"]) if item["source_id"] is not None else None

        payload = []
        for item in grouped:
            total = int(item["alert_total"])
            critical = int(item["critical_count"])
            source_name = item["source_name"] or "-"
            payload.append(
                {
                    "source_name": source_name,
                    "source_id": source_id_map.get(source_name),
                    "alert_total": total,
                    "critical_percentage": round((critical / total * 100.0), 2) if total else 0.0,
                    "mttr_hours": _duration_to_hours(closed_by_source.get(source_name)),
                    "records_ingested_total": ingestion_totals.get(source_name, 0),
                }
            )

        cache.set(cache_key, payload, timeout=300)
        return Response(payload, status=status.HTTP_200_OK)


class AnalyticsByCustomerView(APIView):
    permission_classes = [permissions.IsAuthenticated, TenantSchemaAccessPermission]

    @extend_schema(responses=AnalyticsByCustomerItemSerializer(many=True), tags=["Analytics"])
    def get(self, request):
        if not has_capability(request.user, CAP_MANAGE_CUSTOMERS):
            raise PermissionDenied("Permessi insufficienti")

        from_dt, to_dt = _parse_range(request)
        cache_key = _cache_key(request, "by_customer", from_dt, to_dt)
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached, status=status.HTTP_200_OK)

        queryset = _alert_queryset_for_user(request, from_dt, to_dt)
        grouped = list(
            queryset.values("customer_id", "customer__name")
            .annotate(
                open_alerts=Count("id", filter=Q(current_state__is_final=False)),
                assigned_analysts=Count("assignment__assigned_to", distinct=True),
            )
            .order_by("customer__name")
        )

        resolution_map = {
            item["severity"]: int(item["resolution_minutes"]) for item in SLAConfig.objects.values("severity", "resolution_minutes")
        }

        compliance_map = {}
        closed_rows = queryset.filter(current_state__is_final=True).values(
            "customer_id", "severity", "created_at", "updated_at"
        )
        for row in closed_rows:
            customer_id = row["customer_id"]
            if customer_id is None:
                continue
            duration_min = (row["updated_at"] - row["created_at"]).total_seconds() / 60.0
            threshold = resolution_map.get(row["severity"])
            is_compliant = True if threshold is None else duration_min <= threshold
            current = compliance_map.setdefault(customer_id, {"ok": 0, "total": 0})
            current["total"] += 1
            if is_compliant:
                current["ok"] += 1

        payload = []
        for item in grouped:
            customer_id = item["customer_id"]
            compliance = compliance_map.get(customer_id, {"ok": 0, "total": 0})
            total = compliance["total"]
            sla_compliance = 100.0 if total == 0 else round((compliance["ok"] / total) * 100.0, 2)
            payload.append(
                {
                    "customer_id": customer_id,
                    "customer_name": item["customer__name"] or "-",
                    "open_alerts": int(item["open_alerts"]),
                    "sla_compliance": sla_compliance,
                    "assigned_analysts": int(item["assigned_analysts"]),
                }
            )

        cache.set(cache_key, payload, timeout=300)
        return Response(payload, status=status.HTTP_200_OK)


class AnalyticsHeatmapView(APIView):
    permission_classes = [permissions.IsAuthenticated, TenantSchemaAccessPermission]

    @extend_schema(responses=AnalyticsHeatmapResponseSerializer, tags=["Analytics"])
    def get(self, request):
        if not has_capability(request.user, CAP_MANAGE_CUSTOMERS):
            raise PermissionDenied("Permessi insufficienti")

        from_dt, to_dt = _parse_range(request)
        cache_key = _cache_key(request, "heatmap", from_dt, to_dt)
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached, status=status.HTTP_200_OK)

        queryset = _alert_queryset_for_user(request, from_dt, to_dt)
        grouped = (
            queryset.annotate(weekday=ExtractWeekDay("event_timestamp"), hour=ExtractHour("event_timestamp"))
            .values("weekday", "hour")
            .annotate(count=Count("id"))
        )

        matrix = [[0 for _ in range(24)] for _ in range(7)]
        for item in grouped:
            weekday = int(item["weekday"])
            hour = int(item["hour"])
            day_index = (weekday + 5) % 7
            if 0 <= day_index < 7 and 0 <= hour < 24:
                matrix[day_index][hour] = int(item["count"])

        payload = {"matrix": matrix}
        cache.set(cache_key, payload, timeout=300)
        return Response(payload, status=status.HTTP_200_OK)
