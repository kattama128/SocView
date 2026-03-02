from django.conf import settings
from django.db import connection
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from tenant_data.models import Alert, NotificationEvent


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


@receiver(post_save, sender=Alert, dispatch_uid="tenant_data.alert.post_save.sync_index")
def alert_saved_sync_index(sender, instance, **kwargs):
    _enqueue_sync(instance.id)
    if instance.severity == Alert.Severity.CRITICAL and instance.is_active:
        NotificationEvent.objects.update_or_create(
            alert=instance,
            defaults={
                "title": f"Alert critico: {instance.title}",
                "message": f"Sorgente {instance.source_name} - stato {instance.current_state.name}",
                "severity": NotificationEvent.Severity.CRITICAL,
                "metadata": {"source_name": instance.source_name, "alert_id": instance.id},
                "is_active": True,
            },
        )
    else:
        NotificationEvent.objects.filter(alert=instance).update(is_active=False)


@receiver(post_delete, sender=Alert, dispatch_uid="tenant_data.alert.post_delete.sync_index")
def alert_deleted_sync_index(sender, instance, **kwargs):
    _enqueue_delete(instance.id)
