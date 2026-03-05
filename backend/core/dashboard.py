from datetime import datetime, time

from django.db.models import Avg, Count, DurationField, ExpressionWrapper, F
from django.db.utils import ProgrammingError, OperationalError
from django.db.models.functions import TruncDate
from django.utils import timezone
from django_tenants.utils import schema_context

from accounts.models import UserDashboardPreference
from customers.models import Client


WIDGET_REGISTRY = {
    "alert_trend": {
        "title": "Trend alert nel tempo",
        "description": "Numero alert giornalieri (ultimi 7 giorni)",
    },
    "top_sources": {
        "title": "Top fonti",
        "description": "Fonti con piu alert",
    },
    "state_distribution": {
        "title": "Distribuzione stati workflow",
        "description": "Distribuzione alert per stato corrente",
    },
    "kpi_alert_aperti": {
        "title": "Alert Aperti Oggi",
        "description": "Alert aperti creati oggi e delta rispetto a ieri",
    },
    "kpi_mttr": {
        "title": "MTTR Medio (ultimi 7gg)",
        "description": "Tempo medio di risoluzione alert chiusi",
    },
    "kpi_severity_trend": {
        "title": "Trend per Severita",
        "description": "Distribuzione alert per severita",
    },
}


DEFAULT_WIDGET_LAYOUT = [
    {"key": "alert_trend", "enabled": True, "order": 0},
    {"key": "top_sources", "enabled": True, "order": 1},
    {"key": "state_distribution", "enabled": True, "order": 2},
    {"key": "kpi_alert_aperti", "enabled": True, "order": 3},
    {"key": "kpi_mttr", "enabled": True, "order": 4},
    {"key": "kpi_severity_trend", "enabled": True, "order": 5},
]


def _normalize_widget_layout(layout):
    if not isinstance(layout, list):
        layout = []

    seen_keys = set()
    normalized = []
    for index, item in enumerate(layout):
        if not isinstance(item, dict):
            continue
        key = item.get("key")
        if key not in WIDGET_REGISTRY or key in seen_keys:
            continue
        seen_keys.add(key)
        normalized.append(
            {
                "key": key,
                "enabled": bool(item.get("enabled", True)),
                "order": int(item.get("order", index)),
            }
        )

    for item in DEFAULT_WIDGET_LAYOUT:
        key = item["key"]
        if key in seen_keys:
            continue
        normalized.append(
            {
                "key": key,
                "enabled": bool(item.get("enabled", True)),
                "order": int(item.get("order", len(normalized))),
            }
        )

    normalized.sort(key=lambda entry: entry["order"])
    for order, item in enumerate(normalized):
        item["order"] = order
    return normalized


def get_dashboard_preference(user):
    preference, _ = UserDashboardPreference.objects.get_or_create(user=user)
    normalized_layout = _normalize_widget_layout(preference.widgets_layout)
    if preference.widgets_layout != normalized_layout:
        preference.widgets_layout = normalized_layout
        preference.save(update_fields=["widgets_layout", "updated_at"])
    return preference


def _load_alert_model():
    from tenant_data.models import Alert

    return Alert


def _alerts_queryset(customer_id=None, allowed_customer_ids=None, window_start=None, window_end=None, timestamp_field="event_timestamp"):
    Alert = _load_alert_model()
    queryset = Alert.objects.all()
    if allowed_customer_ids is not None:
        if not allowed_customer_ids:
            return queryset.none()
        queryset = queryset.filter(customer_id__in=allowed_customer_ids)
    if customer_id is not None:
        from tenant_data.customer_scoping import get_enabled_source_names_for_customer

        queryset = queryset.filter(customer_id=customer_id)
        enabled_source_names = get_enabled_source_names_for_customer(customer_id)
        if enabled_source_names is not None:
            if enabled_source_names:
                queryset = queryset.filter(source_name__in=enabled_source_names)
            else:
                queryset = queryset.none()
    if window_start is not None:
        queryset = queryset.filter(**{f"{timestamp_field}__gte": window_start})
    if window_end is not None:
        queryset = queryset.filter(**{f"{timestamp_field}__lte": window_end})
    return queryset


def _window_start_end(window_start=None, window_end=None, default_days=7):
    end = window_end or timezone.now()
    start = window_start or (end - timezone.timedelta(days=default_days - 1))
    return start, end


def _widget_alert_trend(customer_id=None, allowed_customer_ids=None, window_start=None, window_end=None):
    start, end = _window_start_end(window_start=window_start, window_end=window_end, default_days=7)
    start_date = timezone.localtime(start).date()
    end_date = timezone.localtime(end).date()

    rows = (
        _alerts_queryset(
            customer_id=customer_id,
            allowed_customer_ids=allowed_customer_ids,
            window_start=start,
            window_end=end,
            timestamp_field="event_timestamp",
        )
        .filter(event_timestamp__date__gte=start_date, event_timestamp__date__lte=end_date)
        .annotate(day=TruncDate("event_timestamp"))
        .values("day")
        .annotate(count=Count("id"))
        .order_by("day")
    )
    points_map = {item["day"].isoformat(): item["count"] for item in rows}

    points = []
    day_span = max(1, (end_date - start_date).days + 1)
    for index in range(day_span):
        day = (start_date + timezone.timedelta(days=index)).isoformat()
        points.append({"day": day, "count": points_map.get(day, 0)})

    return {"points": points}


def _widget_top_sources(limit=5, customer_id=None, allowed_customer_ids=None, window_start=None, window_end=None):
    rows = (
        _alerts_queryset(
            customer_id=customer_id,
            allowed_customer_ids=allowed_customer_ids,
            window_start=window_start,
            window_end=window_end,
            timestamp_field="event_timestamp",
        )
        .values("source_name")
        .annotate(count=Count("id"))
        .order_by("-count", "source_name")[:limit]
    )
    return {"items": [{"source_name": item["source_name"], "count": item["count"]} for item in rows]}


def _widget_state_distribution(customer_id=None, allowed_customer_ids=None, window_start=None, window_end=None):
    rows = (
        _alerts_queryset(
            customer_id=customer_id,
            allowed_customer_ids=allowed_customer_ids,
            window_start=window_start,
            window_end=window_end,
            timestamp_field="event_timestamp",
        )
        .select_related("current_state")
        .values("current_state__name")
        .annotate(count=Count("id"))
        .order_by("-count", "current_state__name")
    )
    return {
        "items": [
            {"state": item["current_state__name"], "count": item["count"]}
            for item in rows
        ]
    }


def _widget_kpi_open_alerts(customer_id=None, allowed_customer_ids=None):
    now = timezone.now()
    tz = timezone.get_current_timezone()
    today_start = timezone.make_aware(datetime.combine(timezone.localdate(now), time.min), tz)
    tomorrow_start = today_start + timezone.timedelta(days=1)
    yesterday_start = today_start - timezone.timedelta(days=1)

    queryset = _alerts_queryset(customer_id=customer_id, allowed_customer_ids=allowed_customer_ids)
    today_count = queryset.filter(
        current_state__is_final=False,
        created_at__gte=today_start,
        created_at__lt=tomorrow_start,
    ).count()
    yesterday_count = queryset.filter(
        current_state__is_final=False,
        created_at__gte=yesterday_start,
        created_at__lt=today_start,
    ).count()
    return {
        "count": today_count,
        "delta": today_count - yesterday_count,
        "yesterday_count": yesterday_count,
    }


def _widget_kpi_mttr(customer_id=None, allowed_customer_ids=None, window_start=None, window_end=None):
    start, end = _window_start_end(window_start=window_start, window_end=window_end, default_days=7)
    duration_expr = ExpressionWrapper(F("updated_at") - F("created_at"), output_field=DurationField())
    queryset = _alerts_queryset(
        customer_id=customer_id,
        allowed_customer_ids=allowed_customer_ids,
        window_start=start,
        window_end=end,
        timestamp_field="updated_at",
    ).filter(current_state__is_final=True)
    aggregate = queryset.aggregate(avg_duration=Avg(duration_expr))
    avg_duration = aggregate.get("avg_duration")
    avg_minutes = int(avg_duration.total_seconds() // 60) if avg_duration else None
    return {
        "avg_minutes": avg_minutes,
        "sample_size": queryset.count(),
    }


def _widget_kpi_severity_trend(customer_id=None, allowed_customer_ids=None, window_start=None, window_end=None):
    Alert = _load_alert_model()
    start, end = _window_start_end(window_start=window_start, window_end=window_end, default_days=7)
    rows = (
        _alerts_queryset(
            customer_id=customer_id,
            allowed_customer_ids=allowed_customer_ids,
            window_start=start,
            window_end=end,
            timestamp_field="event_timestamp",
        )
        .values("severity")
        .annotate(count=Count("id"))
    )
    row_map = {item["severity"]: int(item["count"]) for item in rows}
    ordered = [
        Alert.Severity.CRITICAL,
        Alert.Severity.HIGH,
        Alert.Severity.MEDIUM,
        Alert.Severity.LOW,
    ]
    return {
        "items": [{"severity": severity, "count": row_map.get(severity, 0)} for severity in ordered]
    }


def build_widget_data(widget_key, customer_id=None, allowed_customer_ids=None, window_start=None, window_end=None):
    try:
        if widget_key == "alert_trend":
            return _widget_alert_trend(
                customer_id=customer_id,
                allowed_customer_ids=allowed_customer_ids,
                window_start=window_start,
                window_end=window_end,
            )
        if widget_key == "top_sources":
            return _widget_top_sources(
                customer_id=customer_id,
                allowed_customer_ids=allowed_customer_ids,
                window_start=window_start,
                window_end=window_end,
            )
        if widget_key == "state_distribution":
            return _widget_state_distribution(
                customer_id=customer_id,
                allowed_customer_ids=allowed_customer_ids,
                window_start=window_start,
                window_end=window_end,
            )
        if widget_key == "kpi_alert_aperti":
            return _widget_kpi_open_alerts(customer_id=customer_id, allowed_customer_ids=allowed_customer_ids)
        if widget_key == "kpi_mttr":
            return _widget_kpi_mttr(
                customer_id=customer_id,
                allowed_customer_ids=allowed_customer_ids,
                window_start=window_start,
                window_end=window_end,
            )
        if widget_key == "kpi_severity_trend":
            return _widget_kpi_severity_trend(
                customer_id=customer_id,
                allowed_customer_ids=allowed_customer_ids,
                window_start=window_start,
                window_end=window_end,
            )
    except (ProgrammingError, OperationalError):
        return {"items": [], "points": []}
    return {}


def build_dashboard_payload(user, customer_id=None, allowed_customer_ids=None, window_start=None, window_end=None):
    preference = get_dashboard_preference(user)
    layout = _normalize_widget_layout(preference.widgets_layout)
    if preference.widgets_layout != layout:
        preference.widgets_layout = layout
        preference.save(update_fields=["widgets_layout", "updated_at"])

    widgets = []
    for widget in sorted(layout, key=lambda item: item.get("order", 0)):
        key = widget.get("key")
        if key not in WIDGET_REGISTRY:
            continue
        metadata = WIDGET_REGISTRY[key]
        widgets.append(
            {
                "key": key,
                "title": metadata["title"],
                "description": metadata["description"],
                "enabled": bool(widget.get("enabled", True)),
                "order": int(widget.get("order", 0)),
                "data": build_widget_data(
                    key,
                    customer_id=customer_id,
                    allowed_customer_ids=allowed_customer_ids,
                    window_start=window_start,
                    window_end=window_end,
                ),
            }
        )

    return {
        "available_widgets": [
            {
                "key": key,
                "title": value["title"],
                "description": value["description"],
            }
            for key, value in WIDGET_REGISTRY.items()
        ],
        "widgets_layout": layout,
        "widgets": widgets,
    }


def update_widget_layout(user, widgets_layout):
    preference = get_dashboard_preference(user)
    preference.widgets_layout = _normalize_widget_layout(widgets_layout)
    preference.save(update_fields=["widgets_layout", "updated_at"])
    return preference.widgets_layout


def _active_alerts_for_schema(schema_name):
    from tenant_data.models import Alert

    with schema_context(schema_name):
        return Alert.objects.filter(current_state__is_final=False).count()


def get_tenant_summaries_for_user(user, request_tenant=None):
    tenant_queryset = Client.objects.exclude(schema_name="public").order_by("schema_name")
    tenant_queryset = tenant_queryset.prefetch_related("domains")

    preference = get_dashboard_preference(user)
    ordering = preference.tenant_order or []
    order_map = {item: index for index, item in enumerate(ordering)}

    tenants = []
    for tenant in tenant_queryset:
        domains = list(tenant.domains.all())
        primary_domain = next((item.domain for item in domains if item.is_primary), None)
        domain = primary_domain or (domains[0].domain if domains else f"{tenant.schema_name}.localhost")

        try:
            active_alerts = _active_alerts_for_schema(tenant.schema_name)
        except (ProgrammingError, OperationalError):
            active_alerts = 0
        tenants.append(
            {
                "schema_name": tenant.schema_name,
                "name": tenant.name,
                "on_trial": tenant.on_trial,
                "active_alerts": active_alerts,
                "domain": domain,
                "entry_url": f"http://{domain}/tenant",
            }
        )

    tenants.sort(key=lambda item: (order_map.get(item["schema_name"], 10_000), item["name"].lower()))
    return tenants


def update_tenant_order_for_user(user, schema_order, request_tenant=None):
    preference = get_dashboard_preference(user)
    allowed = set(Client.objects.exclude(schema_name="public").values_list("schema_name", flat=True))
    clean_order = [schema for schema in schema_order if schema in allowed]
    preference.tenant_order = clean_order
    preference.save(update_fields=["tenant_order", "updated_at"])
    return preference.tenant_order
