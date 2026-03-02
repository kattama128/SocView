from django.db.models import Count
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
}


DEFAULT_WIDGET_LAYOUT = [
    {"key": "alert_trend", "enabled": True, "order": 0},
    {"key": "top_sources", "enabled": True, "order": 1},
    {"key": "state_distribution", "enabled": True, "order": 2},
]


def get_dashboard_preference(user):
    preference, _ = UserDashboardPreference.objects.get_or_create(user=user)
    if not preference.widgets_layout:
        preference.widgets_layout = list(DEFAULT_WIDGET_LAYOUT)
        preference.save(update_fields=["widgets_layout", "updated_at"])
    return preference


def _load_alert_model():
    from tenant_data.models import Alert

    return Alert


def _widget_alert_trend():
    Alert = _load_alert_model()
    end_date = timezone.now().date()
    start_date = end_date - timezone.timedelta(days=6)

    rows = (
        Alert.objects.filter(event_timestamp__date__gte=start_date, event_timestamp__date__lte=end_date)
        .annotate(day=TruncDate("event_timestamp"))
        .values("day")
        .annotate(count=Count("id"))
        .order_by("day")
    )
    points_map = {item["day"].isoformat(): item["count"] for item in rows}

    points = []
    for index in range(7):
        day = (start_date + timezone.timedelta(days=index)).isoformat()
        points.append({"day": day, "count": points_map.get(day, 0)})

    return {"points": points}


def _widget_top_sources(limit=5):
    Alert = _load_alert_model()
    rows = (
        Alert.objects.values("source_name")
        .annotate(count=Count("id"))
        .order_by("-count", "source_name")[:limit]
    )
    return {"items": [{"source_name": item["source_name"], "count": item["count"]} for item in rows]}


def _widget_state_distribution():
    Alert = _load_alert_model()
    rows = (
        Alert.objects.select_related("current_state")
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


def build_widget_data(widget_key):
    try:
        if widget_key == "alert_trend":
            return _widget_alert_trend()
        if widget_key == "top_sources":
            return _widget_top_sources()
        if widget_key == "state_distribution":
            return _widget_state_distribution()
    except (ProgrammingError, OperationalError):
        return {"items": [], "points": []}
    return {}


def build_dashboard_payload(user):
    preference = get_dashboard_preference(user)
    layout = preference.widgets_layout or list(DEFAULT_WIDGET_LAYOUT)

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
                "data": build_widget_data(key),
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
    sanitized = []
    for index, widget in enumerate(widgets_layout or []):
        if not isinstance(widget, dict):
            continue
        key = widget.get("key")
        if key not in WIDGET_REGISTRY:
            continue
        sanitized.append(
            {
                "key": key,
                "enabled": bool(widget.get("enabled", True)),
                "order": int(widget.get("order", index)),
            }
        )
    preference.widgets_layout = sanitized or list(DEFAULT_WIDGET_LAYOUT)
    preference.save(update_fields=["widgets_layout", "updated_at"])
    return preference.widgets_layout


def _active_alerts_for_schema(schema_name):
    from tenant_data.models import Alert

    with schema_context(schema_name):
        return Alert.objects.filter(current_state__is_final=False).count()


def get_tenant_summaries_for_user(user, request_tenant=None):
    if user.is_superuser or user.role == user.Role.SUPER_ADMIN:
        tenant_queryset = Client.objects.exclude(schema_name="public").order_by("schema_name")
    else:
        schema_name = getattr(request_tenant, "schema_name", None)
        if schema_name and schema_name != "public":
            tenant_queryset = Client.objects.filter(schema_name=schema_name)
        else:
            tenant_queryset = Client.objects.exclude(schema_name="public").order_by("schema_name")[:1]

    preference = get_dashboard_preference(user)
    ordering = preference.tenant_order or []
    order_map = {item: index for index, item in enumerate(ordering)}

    tenants = []
    for tenant in tenant_queryset:
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
            }
        )

    tenants.sort(key=lambda item: (order_map.get(item["schema_name"], 10_000), item["name"].lower()))
    return tenants


def update_tenant_order_for_user(user, schema_order, request_tenant=None):
    preference = get_dashboard_preference(user)
    if user.is_superuser or user.role == user.Role.SUPER_ADMIN:
        allowed = set(Client.objects.exclude(schema_name="public").values_list("schema_name", flat=True))
    else:
        current_schema = getattr(request_tenant, "schema_name", None)
        allowed = {current_schema} if current_schema and current_schema != "public" else set()
    clean_order = [schema for schema in schema_order if schema in allowed]
    preference.tenant_order = clean_order
    preference.save(update_fields=["tenant_order", "updated_at"])
    return preference.tenant_order
