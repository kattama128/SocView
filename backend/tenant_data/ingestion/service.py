from dataclasses import dataclass

from django.db import transaction
from django.utils import timezone

from tenant_data.ingestion.connectors.imap_connector import fetch_imap_events, test_imap_connection
from tenant_data.ingestion.connectors.rest_connector import fetch_rest_events, test_rest_connection
from tenant_data.ingestion.parser import parse_event
from tenant_data.ingestion.utils import compute_fingerprint, map_severity, parse_event_timestamp
from tenant_data.models import (
    Alert,
    AlertOccurrence,
    AlertState,
    AlertTag,
    DedupPolicy,
    IngestionEventLog,
    IngestionRun,
    SourceConfig,
    Source,
    Tag,
)


@dataclass
class IngestionSummary:
    processed: int = 0
    created: int = 0
    updated: int = 0
    errors: int = 0


def _default_alert_state():
    state = AlertState.objects.filter(is_enabled=True, is_final=False).order_by("order", "id").first()
    if state:
        return state

    state = AlertState.objects.filter(is_enabled=True).order_by("order", "id").first()
    if state:
        return state

    return AlertState.objects.create(name="Nuovo", order=0, is_final=False, is_enabled=True)


def _determine_title(raw_event, source):
    if isinstance(raw_event, dict):
        for key in ("title", "subject", "name", "message"):
            value = raw_event.get(key)
            if value:
                return str(value)[:255]
    return f"Event from {source.name}"[:255]


def _determine_source_id(raw_event, source):
    if isinstance(raw_event, dict):
        for key in ("source_id", "event_id", "message_id", "id"):
            value = raw_event.get(key)
            if value:
                return str(value)[:120]
    return str(source.id)


def _ensure_unparsed_tag(alert):
    tag, _ = Tag.objects.get_or_create(
        name="#unparsed",
        scope=Tag.Scope.ALERT,
        defaults={"color": "#b71c1c", "metadata": {"auto": True}},
    )
    AlertTag.objects.get_or_create(alert=alert, tag=tag)


def _fetch_events(source):
    if source.type == Source.Type.IMAP:
        return fetch_imap_events(source)
    if source.type == Source.Type.REST:
        return fetch_rest_events(source)
    raise ValueError(f"Tipo fonte non supportato per polling: {source.type}")


def test_source_connection(source):
    if source.type == Source.Type.IMAP:
        return test_imap_connection(source)
    if source.type == Source.Type.REST:
        return test_rest_connection(source)
    if source.type == Source.Type.WEBHOOK:
        return {"ok": True, "detail": "Webhook pronto"}
    return {"ok": False, "detail": "Tipo fonte sconosciuto"}


def run_ingestion_for_source(source, trigger=IngestionRun.Trigger.SCHEDULED, pushed_events=None):
    source_config, _ = SourceConfig.objects.get_or_create(source=source)
    summary = IngestionSummary()
    run = IngestionRun.objects.create(
        source=source,
        trigger=trigger,
        status=IngestionRun.Status.RUNNING,
        metadata={"source_type": source.type},
    )

    policy = getattr(source, "dedup_policy", None)
    if policy is None:
        policy = DedupPolicy.objects.create(source=source)

    try:
        events = pushed_events if pushed_events is not None else _fetch_events(source)
        if not isinstance(events, list):
            events = [events]

        default_state = _default_alert_state()

        for raw_event in events:
            summary.processed += 1
            parse_error = ""

            try:
                parsed_event = parse_event(raw_event)
            except Exception as exc:  # parser failure should still create alert
                parse_error = str(exc)
                parsed_event = {"_parse_error": parse_error}

            try:
                fingerprint = compute_fingerprint(source, policy, raw_event, parsed_event)
                severity = map_severity(source, raw_event, parsed_event)
                event_timestamp = parse_event_timestamp(raw_event, parsed_event)
                source_id = _determine_source_id(raw_event, source)

                with transaction.atomic():
                    alert, created = Alert.objects.get_or_create(
                        dedup_fingerprint=fingerprint,
                        source_name=source.name,
                        defaults={
                            "title": _determine_title(raw_event, source),
                            "severity": severity,
                            "event_timestamp": event_timestamp,
                            "source_name": source.name,
                            "source_id": source_id,
                            "raw_payload": raw_event if isinstance(raw_event, dict) else {"value": str(raw_event)},
                            "parsed_payload": parsed_event if isinstance(parsed_event, dict) else {},
                            "current_state": default_state,
                        },
                    )

                    if created:
                        AlertOccurrence.objects.create(
                            alert=alert,
                            count=1,
                            first_seen=event_timestamp,
                            last_seen=event_timestamp,
                        )
                        summary.created += 1
                        action = IngestionEventLog.Action.CREATED
                    else:
                        occurrence, _ = AlertOccurrence.objects.get_or_create(
                            alert=alert,
                            defaults={
                                "count": 1,
                                "first_seen": event_timestamp,
                                "last_seen": event_timestamp,
                            },
                        )
                        if policy.strategy == DedupPolicy.Strategy.INCREMENT_OCCURRENCE:
                            occurrence.count += 1
                            occurrence.last_seen = max(occurrence.last_seen, event_timestamp)
                            if event_timestamp < occurrence.first_seen:
                                occurrence.first_seen = event_timestamp
                            occurrence.save(update_fields=["count", "first_seen", "last_seen", "updated_at"])

                        alert.source_id = source_id
                        alert.raw_payload = raw_event if isinstance(raw_event, dict) else {"value": str(raw_event)}
                        alert.parsed_payload = parsed_event if isinstance(parsed_event, dict) else {}
                        alert.severity = severity
                        alert.event_timestamp = event_timestamp
                        alert.save(
                            update_fields=[
                                "source_id",
                                "raw_payload",
                                "parsed_payload",
                                "severity",
                                "event_timestamp",
                                "updated_at",
                            ]
                        )

                        summary.updated += 1
                        action = IngestionEventLog.Action.UPDATED

                    if parse_error:
                        _ensure_unparsed_tag(alert)

                    IngestionEventLog.objects.create(
                        run=run,
                        source=source,
                        alert=alert,
                        fingerprint=fingerprint,
                        action=action,
                        parse_error=parse_error,
                        raw_preview=raw_event if isinstance(raw_event, dict) else {"value": str(raw_event)},
                    )
            except Exception as exc:
                summary.errors += 1
                IngestionEventLog.objects.create(
                    run=run,
                    source=source,
                    action=IngestionEventLog.Action.ERROR,
                    error_detail=str(exc),
                    parse_error=parse_error,
                    raw_preview=raw_event if isinstance(raw_event, dict) else {"value": str(raw_event)},
                )

        run.processed_count = summary.processed
        run.created_count = summary.created
        run.updated_count = summary.updated
        run.error_count = summary.errors
        run.finished_at = timezone.now()
        run.status = IngestionRun.Status.SUCCESS if summary.errors == 0 else IngestionRun.Status.PARTIAL
        run.save(
            update_fields=[
                "processed_count",
                "created_count",
                "updated_count",
                "error_count",
                "finished_at",
                "status",
            ]
        )

        source_config.last_polled_at = timezone.now()
        source_config.last_success = timezone.now()
        source_config.last_error = ""
        source_config.status = source_config.Status.HEALTHY
        source_config.health_details = {
            "processed": summary.processed,
            "created": summary.created,
            "updated": summary.updated,
            "errors": summary.errors,
        }
        source_config.save(
            update_fields=[
                "last_polled_at",
                "last_success",
                "last_error",
                "status",
                "health_details",
                "updated_at",
            ]
        )
    except Exception as exc:
        run.finished_at = timezone.now()
        run.status = IngestionRun.Status.ERROR
        run.error_detail = str(exc)
        run.error_count = max(run.error_count, 1)
        run.save(update_fields=["finished_at", "status", "error_detail", "error_count"])

        source_config.last_polled_at = timezone.now()
        source_config.last_error = str(exc)
        source_config.status = source_config.Status.ERROR
        source_config.health_details = {"error": str(exc)}
        source_config.save(
            update_fields=[
                "last_polled_at",
                "last_error",
                "status",
                "health_details",
                "updated_at",
            ]
        )

    return run
