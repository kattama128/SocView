from typing import Any

from tenant_data.models import Alert
from tenant_data.search.backends import (
    ElasticSearchBackend,
    PostgresSearchBackend,
    SearchRequest,
    SearchResult,
    extract_path,
    resolve_search_backend,
)


def search_alerts(request_data: SearchRequest) -> SearchResult:
    backend = resolve_search_backend()
    try:
        return backend.search(request_data)
    except Exception:
        if backend.name == "postgres":
            raise
        fallback = PostgresSearchBackend()
        return fallback.search(request_data)


def sync_alert_index(alert_id: int):
    alert = Alert.objects.select_related("current_state").filter(id=alert_id).first()
    if not alert:
        return {"ok": False, "detail": "Alert non trovato"}

    backend = resolve_search_backend()
    try:
        backend.sync_alert(alert)
        return {"ok": True, "backend": backend.name, "alert_id": alert_id}
    except Exception:
        if isinstance(backend, ElasticSearchBackend):
            return {"ok": True, "backend": "postgres", "alert_id": alert_id, "fallback": True}
        return {"ok": False, "backend": backend.name, "alert_id": alert_id}


def delete_alert_index(alert_id: int):
    backend = resolve_search_backend()
    try:
        backend.remove_alert(alert_id)
        return {"ok": True, "backend": backend.name, "alert_id": alert_id}
    except Exception:
        if isinstance(backend, ElasticSearchBackend):
            return {"ok": True, "backend": "postgres", "alert_id": alert_id, "fallback": True}
        return {"ok": False, "backend": backend.name, "alert_id": alert_id}


def rebuild_alert_index():
    backend = resolve_search_backend()
    try:
        backend.rebuild()
        return {"ok": True, "backend": backend.name}
    except Exception:
        if isinstance(backend, ElasticSearchBackend):
            fallback = PostgresSearchBackend()
            fallback.rebuild()
            return {"ok": True, "backend": "postgres", "fallback": True}
        return {"ok": False, "backend": backend.name}


def _schema_type_to_filter_type(schema_type: str, field_name: str, sample_value: Any):
    normalized = (schema_type or "").lower()
    if normalized in {"bool", "boolean"}:
        return "boolean"
    if normalized in {"int", "float", "number"}:
        return "number"

    if isinstance(sample_value, bool):
        return "boolean"
    if isinstance(sample_value, (int, float)):
        return "number"

    lowered = field_name.lower()
    if "timestamp" in lowered or lowered.endswith("_at") or lowered.startswith("@"):
        return "date"

    from django.utils.dateparse import parse_datetime

    if isinstance(sample_value, str) and parse_datetime(sample_value):
        return "date"

    return "keyword"


def build_source_field_schema(source_name: str) -> list[dict[str, str]]:
    queryset = Alert.objects.filter(source_name=source_name).exclude(parsed_field_schema=[]).order_by("-event_timestamp", "-id")

    if not queryset.exists():
        return []

    fields: dict[str, str] = {}

    for alert in queryset[:200]:
        schema_entries = alert.parsed_field_schema or []
        for item in schema_entries:
            field_name = item.get("field") if isinstance(item, dict) else None
            schema_type = item.get("type") if isinstance(item, dict) else ""
            if not field_name:
                continue

            sample = extract_path(alert.parsed_payload, field_name)
            inferred_type = _schema_type_to_filter_type(schema_type, field_name, sample)
            existing = fields.get(field_name)
            if not existing:
                fields[field_name] = inferred_type
            elif existing != inferred_type:
                priority = {"keyword": 1, "date": 2, "number": 3, "boolean": 4}
                if priority[inferred_type] > priority[existing]:
                    fields[field_name] = inferred_type

    return [{"field": key, "type": value} for key, value in sorted(fields.items())]


def build_all_source_field_schemas() -> list[dict[str, Any]]:
    source_names = (
        Alert.objects.exclude(source_name="").values_list("source_name", flat=True).distinct().order_by("source_name")
    )
    data = []
    for source_name in source_names:
        data.append({"source_name": source_name, "fields": build_source_field_schema(source_name)})
    return data
