from datetime import timedelta
import ipaddress
import json
import re

from django.conf import settings
from celery import shared_task
from django.utils import timezone
from django_tenants.utils import schema_context

from customers.models import Client
from tenant_data.ingestion.service import run_ingestion_for_source
from tenant_data.models import Alert, AuditLog, IngestionRun, NotificationEvent, Source
from tenant_data.search import delete_alert_index, rebuild_alert_index, sync_alert_index

IOC_IP_REGEX = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
IOC_HASH_REGEX = re.compile(r"\b[a-fA-F0-9]{32}\b|\b[a-fA-F0-9]{40}\b|\b[a-fA-F0-9]{64}\b")
IOC_URL_REGEX = re.compile(r"\b(?:https?://)?(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:/[^\s\"'<>]*)?\b")
IOC_EMAIL_REGEX = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")


@shared_task
def ingest_source_task(schema_name, source_id, trigger=IngestionRun.Trigger.SCHEDULED):
    with schema_context(schema_name):
        source = (
            Source.objects.select_related(
                "config",
                "dedup_policy",
                "parser_definition",
                "parser_definition__active_revision",
            )
            .filter(id=source_id, is_enabled=True)
            .first()
        )
        if not source:
            return {"ok": False, "detail": "Source non trovata o disabilitata"}

        run = run_ingestion_for_source(source, trigger=trigger)
        return {
            "ok": run.status in {IngestionRun.Status.SUCCESS, IngestionRun.Status.PARTIAL},
            "run_id": run.id,
            "status": run.status,
            "processed": run.processed_count,
            "created": run.created_count,
            "updated": run.updated_count,
            "errors": run.error_count,
        }


@shared_task
def run_ingestion_scheduler():
    results = []

    tenants = Client.objects.exclude(schema_name="public")
    for tenant in tenants:
        with schema_context(tenant.schema_name):
            sources = Source.objects.select_related(
                "config",
                "parser_definition",
                "parser_definition__active_revision",
            ).filter(
                is_enabled=True,
                type__in=[Source.Type.IMAP, Source.Type.REST],
            )
            for source in sources:
                if source.schedule_cron or source.schedule_interval_minutes is not None:
                    continue

                # Manual mode: no automatic scheduling when no cron/interval is configured.
                continue

    return {"scheduled": len(results), "items": results}


@shared_task
def sync_alert_index_task(schema_name, alert_id):
    with schema_context(schema_name):
        return sync_alert_index(alert_id)


@shared_task
def delete_alert_index_task(schema_name, alert_id):
    with schema_context(schema_name):
        return delete_alert_index(alert_id)


@shared_task
def rebuild_alert_index_task(schema_name):
    with schema_context(schema_name):
        return rebuild_alert_index()


@shared_task
def cleanup_audit_logs_task():
    retention_days = max(int(getattr(settings, "AUDIT_RETENTION_DAYS", 90) or 90), 1)
    cutoff = timezone.now() - timedelta(days=retention_days)

    deleted_total = 0
    tenants = Client.objects.exclude(schema_name="public")
    for tenant in tenants:
        with schema_context(tenant.schema_name):
            deleted, _ = AuditLog.objects.filter(timestamp__lt=cutoff).delete()
            deleted_total += deleted

    return {"retention_days": retention_days, "deleted": deleted_total}


@shared_task
def unsnooze_notifications_task():
    now = timezone.now()
    updated_total = 0
    tenants = Client.objects.exclude(schema_name="public").values_list("schema_name", flat=True)
    tenant_count = 0

    for schema_name in tenants:
        tenant_count += 1
        with schema_context(schema_name):
            updated_total += int(
                NotificationEvent.objects.filter(
                    is_active=True,
                    snoozed_until__isnull=False,
                    snoozed_until__lte=now,
                ).update(snoozed_until=None)
            )

    return {"updated": updated_total, "tenants": tenant_count}


def _is_valid_public_ipv4(value: str) -> bool:
    try:
        ip_obj = ipaddress.ip_address(value)
    except ValueError:
        return False
    if ip_obj.version != 4:
        return False
    if ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_link_local:
        return False
    if ip_obj.is_multicast or ip_obj.is_reserved or ip_obj.is_unspecified:
        return False
    return True


def _extract_iocs_from_text(raw_text: str) -> dict:
    ips = sorted({ip for ip in IOC_IP_REGEX.findall(raw_text) if _is_valid_public_ipv4(ip)})
    hashes = sorted({item.lower() for item in IOC_HASH_REGEX.findall(raw_text)})
    emails = sorted({item.lower() for item in IOC_EMAIL_REGEX.findall(raw_text)})

    urls = []
    for candidate in IOC_URL_REGEX.findall(raw_text):
        value = candidate.strip().rstrip(".,;)")
        if "@" in value:
            continue
        urls.append(value.lower())
    unique_urls = sorted(set(urls))

    return {
        "ips": ips,
        "hashes": hashes,
        "urls": unique_urls,
        "emails": emails,
    }


@shared_task
def extract_iocs_task(schema_name, alert_id):
    with schema_context(schema_name):
        alert = Alert.objects.filter(id=alert_id).first()
        if alert is None:
            return {"ok": False, "detail": "Alert non trovato"}

        payload_text = json.dumps(alert.raw_payload or {}, ensure_ascii=False, sort_keys=True, default=str)
        iocs = _extract_iocs_from_text(payload_text)
        alert.iocs = iocs
        alert.save(update_fields=["iocs", "updated_at"])
        return {
            "ok": True,
            "alert_id": alert.id,
            "ips": len(iocs["ips"]),
            "hashes": len(iocs["hashes"]),
            "urls": len(iocs["urls"]),
            "emails": len(iocs["emails"]),
        }
