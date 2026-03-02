from celery import shared_task
from django.utils import timezone
from django_tenants.utils import schema_context

from customers.models import Client
from tenant_data.ingestion.service import run_ingestion_for_source
from tenant_data.models import IngestionRun, Source, SourceConfig
from tenant_data.search import delete_alert_index, rebuild_alert_index, sync_alert_index


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
    now = timezone.now()
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
                try:
                    config = source.config
                except SourceConfig.DoesNotExist:
                    config = SourceConfig.objects.create(source=source)
                interval = max(int(config.poll_interval_seconds or 300), 15)

                due = config.last_polled_at is None or (now - config.last_polled_at).total_seconds() >= interval
                if not due:
                    continue

                task_result = ingest_source_task.delay(tenant.schema_name, source.id, IngestionRun.Trigger.SCHEDULED)
                results.append({"tenant": tenant.schema_name, "source": source.id, "task_id": task_result.id})

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
