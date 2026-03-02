import hashlib
import json
from datetime import datetime

from django.utils import timezone
from django.utils.dateparse import parse_datetime


def extract_value(payload, path):
    current = payload
    for token in path.split("."):
        if isinstance(current, dict) and token in current:
            current = current[token]
        else:
            return None
    return current


def parse_event_timestamp(raw_event, parsed_event):
    candidates = []
    for source in (parsed_event or {}, raw_event or {}):
        for key in ("event_timestamp", "timestamp", "date", "received_at", "created_at"):
            value = source.get(key)
            if value:
                candidates.append(value)

    for value in candidates:
        if isinstance(value, datetime):
            return value
        if isinstance(value, str):
            parsed = parse_datetime(value)
            if parsed:
                if timezone.is_naive(parsed):
                    return timezone.make_aware(parsed, timezone.get_current_timezone())
                return parsed

    return timezone.now()


def map_severity(source, raw_event, parsed_event):
    mapping = source.severity_map or {}
    default = mapping.get("default", "medium")

    field = mapping.get("field", "severity")
    map_dict = mapping.get("map", {})

    value = parsed_event.get(field) if isinstance(parsed_event, dict) else None
    if value is None and isinstance(raw_event, dict):
        value = raw_event.get(field)

    if isinstance(value, str):
        normalized = value.lower().strip()
        if normalized in {"low", "medium", "high", "critical"}:
            return normalized
        if normalized in map_dict:
            mapped = str(map_dict[normalized]).lower().strip()
            if mapped in {"low", "medium", "high", "critical"}:
                return mapped

    return default if default in {"low", "medium", "high", "critical"} else "medium"


def compute_fingerprint(source, policy, raw_event, parsed_event):
    fields = []
    if policy and isinstance(policy.fingerprint_fields, list):
        fields = [str(item).strip() for item in policy.fingerprint_fields if str(item).strip()]

    payload = {
        "raw": raw_event if isinstance(raw_event, dict) else {"value": str(raw_event)},
        "parsed": parsed_event if isinstance(parsed_event, dict) else {},
        "source": {"id": source.id, "name": source.name, "type": source.type},
    }

    values = []
    for field in fields:
        search_field = field
        if "." not in field:
            search_field = f"raw.{field}"
        values.append({"field": field, "value": extract_value(payload, search_field)})

    if not fields:
        for fallback in ["raw.event_id", "raw.message_id", "raw.id", "raw.subject", "raw.title"]:
            values.append({"field": fallback, "value": extract_value(payload, fallback)})

    compact_values = [item for item in values if item.get("value") not in (None, "")]
    if not compact_values:
        compact_values = [{"raw": payload["raw"]}]

    digest = hashlib.sha256(json.dumps(compact_values, sort_keys=True, default=str).encode("utf-8")).hexdigest()
    return digest
