from dataclasses import dataclass
import re

from django.core.exceptions import ObjectDoesNotExist
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
    SourceAlertTypeRule,
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


def _find_alert_type_rule(source, title):
    if not title:
        return None
    rules = list(source.alert_type_rules.filter(is_enabled=True))
    exact_rules = [rule for rule in rules if rule.match_mode == SourceAlertTypeRule.MatchMode.EXACT]
    contains_rules = [rule for rule in rules if rule.match_mode == SourceAlertTypeRule.MatchMode.CONTAINS]
    regex_rules = [rule for rule in rules if rule.match_mode == SourceAlertTypeRule.MatchMode.REGEX]

    lowered = title.lower()
    for rule in exact_rules:
        if lowered == rule.alert_name.lower():
            return rule
    for rule in contains_rules:
        if rule.alert_name and rule.alert_name.lower() in lowered:
            return rule
    for rule in regex_rules:
        if not rule.alert_name:
            continue
        try:
            if re.search(rule.alert_name, title, flags=re.IGNORECASE):
                return rule
        except re.error:
            # Ignore invalid custom regex and continue.
            continue
    return None


def _resolve_alert_severity(source, title, fallback_severity, event_timestamp):
    rule = _find_alert_type_rule(source, title)
    if rule is None:
        rule, _ = SourceAlertTypeRule.objects.get_or_create(
            source=source,
            alert_name=title,
            match_mode=SourceAlertTypeRule.MatchMode.EXACT,
            defaults={
                "severity": fallback_severity,
                "is_enabled": True,
            },
        )

    rule.received_count += 1
    if rule.last_seen_at is None or event_timestamp > rule.last_seen_at:
        rule.last_seen_at = event_timestamp
    rule.save(update_fields=["received_count", "last_seen_at", "updated_at"])

    if rule.is_enabled:
        return rule.severity
    return fallback_severity


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


def _get_source_parser_config(source):
    try:
        parser_definition = source.parser_definition
    except ObjectDoesNotExist:
        return None
    if not parser_definition or not parser_definition.is_enabled:
        return None
    if not parser_definition.active_revision:
        return None
    return parser_definition.active_revision.config_data


def test_source_connection(source):
    if source.type == Source.Type.IMAP:
        return test_imap_connection(source)
    if source.type == Source.Type.REST:
        return test_rest_connection(source)
    if source.type == Source.Type.WEBHOOK:
        return {"ok": True, "detail": "Webhook pronto"}
    return {"ok": False, "detail": f"Test connessione non supportato per tipo {source.type}"}


def run_ingestion_for_source(source, trigger=IngestionRun.Trigger.SCHEDULED, pushed_events=None):
    source_config, _ = SourceConfig.objects.get_or_create(source=source)
    source_customer = getattr(source, "customer", None)
    summary = IngestionSummary()
    run = IngestionRun.objects.create(
        customer=source_customer,
        source=source,
        trigger=trigger,
        status=IngestionRun.Status.RUNNING,
        metadata={"source_type": source.type},
    )

    policy = getattr(source, "dedup_policy", None)
    if policy is None:
        policy = DedupPolicy.objects.create(source=source)
    parser_config = _get_source_parser_config(source)

    try:
        events = pushed_events if pushed_events is not None else _fetch_events(source)
        if not isinstance(events, list):
            events = [events]

        default_state = _default_alert_state()

        for raw_event in events:
            summary.processed += 1
            parse_error = ""
            field_schema = []

            try:
                parsed_result = parse_event(raw_event, parser_config=parser_config)
                parsed_event = parsed_result.parsed_payload
                field_schema = parsed_result.field_schema
            except Exception as exc:  # parser failure should still create alert
                parse_error = str(exc)
                parsed_event = None

            try:
                fingerprint = compute_fingerprint(source, policy, raw_event, parsed_event)
                mapped_severity = map_severity(source, raw_event, parsed_event)
                event_timestamp = parse_event_timestamp(raw_event, parsed_event)
                title = _determine_title(raw_event, source)
                severity = _resolve_alert_severity(source, title, mapped_severity, event_timestamp)
                source_id = _determine_source_id(raw_event, source)

                with transaction.atomic():
                    alert, created = Alert.objects.get_or_create(
                        customer=source_customer,
                        dedup_fingerprint=fingerprint,
                        source_name=source.name,
                        defaults={
                            "title": title,
                            "customer": source_customer,
                            "severity": severity,
                            "event_timestamp": event_timestamp,
                            "source_name": source.name,
                            "source_id": source_id,
                            "raw_payload": raw_event if isinstance(raw_event, dict) else {"value": str(raw_event)},
                            "parsed_payload": parsed_event if isinstance(parsed_event, dict) else None,
                            "parsed_field_schema": field_schema,
                            "parse_error_detail": parse_error,
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
                        alert.title = title
                        alert.raw_payload = raw_event if isinstance(raw_event, dict) else {"value": str(raw_event)}
                        alert.parsed_payload = parsed_event if isinstance(parsed_event, dict) else None
                        alert.parsed_field_schema = field_schema
                        alert.parse_error_detail = parse_error
                        alert.severity = severity
                        alert.event_timestamp = event_timestamp
                        alert.save(
                            update_fields=[
                                "source_id",
                                "title",
                                "raw_payload",
                                "parsed_payload",
                                "parsed_field_schema",
                                "parse_error_detail",
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
