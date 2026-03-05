import json

from django.conf import settings
from django.db import connection
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from tenant_data.models import Alert, IngestionRun, NotificationEvent, Source
from tenant_data.notifications import create_notifications, dispatch_notification


def _should_sync_index() -> bool:
    return bool(getattr(settings, "SEARCH_INDEX_SYNC_ENABLED", True))


def _enqueue_sync(alert_id: int):
    if not _should_sync_index():
        return

    schema_name = connection.schema_name or "public"
    use_async = bool(getattr(settings, "SEARCH_INDEX_SYNC_ASYNC", True))

    from tenant_data.tasks import sync_alert_index_task

    if use_async:
        try:
            sync_alert_index_task.delay(schema_name, alert_id)
            return
        except Exception:
            pass

    sync_alert_index_task(schema_name, alert_id)


def _enqueue_delete(alert_id: int):
    if not _should_sync_index():
        return

    schema_name = connection.schema_name or "public"
    use_async = bool(getattr(settings, "SEARCH_INDEX_SYNC_ASYNC", True))

    from tenant_data.tasks import delete_alert_index_task

    if use_async:
        try:
            delete_alert_index_task.delay(schema_name, alert_id)
            return
        except Exception:
            pass

    delete_alert_index_task(schema_name, alert_id)


def _enqueue_ioc_extraction(alert_id: int):
    schema_name = connection.schema_name or "public"
    use_async = bool(getattr(settings, "SEARCH_INDEX_SYNC_ASYNC", True))

    from tenant_data.tasks import extract_iocs_task

    if use_async:
        try:
            extract_iocs_task.delay(schema_name, alert_id)
            return
        except Exception:
            pass

    extract_iocs_task(schema_name, alert_id)


def _source_periodic_task_name(schema_name: str, source_id: int) -> str:
    return f"tenant-source-ingest:{schema_name}:{source_id}"


def _sync_source_schedule(source: Source):
    try:
        from django_celery_beat.models import CrontabSchedule, IntervalSchedule, PeriodicTask
    except Exception:
        return

    schema_name = connection.schema_name or "public"
    task_name = _source_periodic_task_name(schema_name, source.id)
    is_polling_type = source.type in {Source.Type.IMAP, Source.Type.REST}
    has_schedule = bool(source.schedule_cron) or source.schedule_interval_minutes is not None

    if not source.is_enabled or not is_polling_type or not has_schedule:
        PeriodicTask.objects.filter(name=task_name).delete()
        return

    kwargs = json.dumps(
        {
            "schema_name": schema_name,
            "source_id": source.id,
            "trigger": IngestionRun.Trigger.SCHEDULED,
        }
    )
    defaults = {
        "task": "tenant_data.tasks.ingest_source_task",
        "kwargs": kwargs,
        "enabled": True,
        "one_off": False,
        "description": f"Auto ingestion for source {source.id} ({schema_name})",
    }

    if source.schedule_cron:
        minute, hour, day_of_month, month_of_year, day_of_week = [
            item for item in str(source.schedule_cron).strip().split(" ") if item
        ]
        crontab, _ = CrontabSchedule.objects.get_or_create(
            minute=minute,
            hour=hour,
            day_of_month=day_of_month,
            month_of_year=month_of_year,
            day_of_week=day_of_week,
            timezone=getattr(settings, "TIME_ZONE", "UTC"),
        )
        defaults["crontab"] = crontab
        defaults["interval"] = None
    else:
        minutes = max(int(source.schedule_interval_minutes or 1), 1)
        interval, _ = IntervalSchedule.objects.get_or_create(
            every=minutes,
            period=IntervalSchedule.MINUTES,
        )
        defaults["interval"] = interval
        defaults["crontab"] = None

    PeriodicTask.objects.update_or_create(name=task_name, defaults=defaults)


@receiver(post_save, sender=Alert, dispatch_uid="tenant_data.alert.post_save.sync_index")
def alert_saved_sync_index(sender, instance, **kwargs):
    update_fields = set(kwargs.get("update_fields") or [])
    ioc_only_update = bool(update_fields) and update_fields.issubset({"iocs", "updated_at"})

    _enqueue_sync(instance.id)
    if not ioc_only_update:
        _enqueue_ioc_extraction(instance.id)

    if instance.severity == Alert.Severity.CRITICAL and instance.is_active:
        create_notifications(
            alert=instance,
            title=f"Alert critico: {instance.title}",
            message=f"Sorgente {instance.source_name} - stato {instance.current_state.name}",
            severity=NotificationEvent.Severity.CRITICAL,
            metadata={"source_name": instance.source_name, "alert_id": instance.id, "kind": "critical_alert"},
            dedupe_key=f"critical:{instance.id}",
        )
    else:
        NotificationEvent.objects.filter(
            alert=instance,
            metadata__kind="critical_alert",
        ).update(is_active=False)


@receiver(post_save, sender=Source, dispatch_uid="tenant_data.source.post_save.sync_schedule")
def source_saved_sync_schedule(sender, instance, **kwargs):
    _sync_source_schedule(instance)


@receiver(post_delete, sender=Source, dispatch_uid="tenant_data.source.post_delete.sync_schedule")
def source_deleted_sync_schedule(sender, instance, **kwargs):
    try:
        from django_celery_beat.models import PeriodicTask
    except Exception:
        return
    schema_name = connection.schema_name or "public"
    task_name = _source_periodic_task_name(schema_name, instance.id)
    PeriodicTask.objects.filter(name=task_name).delete()


@receiver(post_delete, sender=Alert, dispatch_uid="tenant_data.alert.post_delete.sync_index")
def alert_deleted_sync_index(sender, instance, **kwargs):
    _enqueue_delete(instance.id)


@receiver(post_save, sender=NotificationEvent, dispatch_uid="tenant_data.notification.post_save.broadcast")
def notification_saved_broadcast(sender, instance, **kwargs):
    if not instance.is_active:
        return
    update_fields = set(kwargs.get("update_fields") or [])
    if update_fields and update_fields.issubset({"snoozed_until", "updated_at"}):
        return
    dispatch_notification(instance)
