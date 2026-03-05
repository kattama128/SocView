from __future__ import annotations

import json
from typing import Iterable

from asgiref.sync import async_to_sync
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import connection
from django.db.models import Q

from accounts.rbac import CAP_VIEW, has_capability
from tenant_data.models import NotificationEvent, NotificationPreferences, PushSubscription
from tenant_data.rbac import ensure_customer_capability

User = get_user_model()

SEVERITY_ORDER = {
    NotificationEvent.Severity.LOW: 0,
    NotificationEvent.Severity.MEDIUM: 1,
    NotificationEvent.Severity.HIGH: 2,
    NotificationEvent.Severity.CRITICAL: 3,
}


def _severity_passes(min_severity: str, severity: str) -> bool:
    if min_severity == NotificationPreferences.MinSeverity.ALL:
        return True
    return SEVERITY_ORDER.get(severity, 0) >= SEVERITY_ORDER.get(min_severity, 0)


def get_or_create_preferences(user):
    prefs, _ = NotificationPreferences.objects.get_or_create(user=user)
    return prefs


def _iter_candidate_users(customer_id: int | None) -> Iterable[User]:
    queryset = User.objects.filter(is_active=True).order_by("id")
    if customer_id is not None:
        queryset = queryset.filter(
            Q(
                customer_memberships__customer_id=customer_id,
                customer_memberships__is_active=True,
            )
            | Q(role="SUPER_ADMIN")
        ).distinct()
    return queryset


def _can_receive_ui_notification(user, *, severity: str, customer_id: int | None) -> bool:
    if not has_capability(user, CAP_VIEW):
        return False
    try:
        ensure_customer_capability(user, customer_id, CAP_VIEW)
    except Exception:
        return False

    prefs = get_or_create_preferences(user)
    channels = prefs.channels or {}
    if not bool(channels.get("ui", True)):
        return False
    if not _severity_passes(prefs.min_severity, severity):
        return False

    customer_filter_ids = set(prefs.customer_filter.values_list("id", flat=True))
    if customer_filter_ids and customer_id not in customer_filter_ids:
        return False
    return True


def _notification_payload(notification: NotificationEvent) -> dict:
    return {
        "id": notification.id,
        "alert": notification.alert_id,
        "title": notification.title,
        "message": notification.message,
        "severity": notification.severity,
        "metadata": notification.metadata,
        "created_at": notification.created_at.isoformat(),
    }


def _broadcast_ws(notification: NotificationEvent):
    try:
        from channels.layers import get_channel_layer
    except Exception:
        return

    channel_layer = get_channel_layer()
    if channel_layer is None:
        return

    payload = _notification_payload(notification)
    target_user_id = notification.metadata.get("target_user_id")
    tenant_schema = connection.schema_name or "public"

    if target_user_id:
        async_to_sync(channel_layer.group_send)(
            f"notifications_user_{target_user_id}",
            {"type": "notification.message", "payload": payload},
        )
        return

    async_to_sync(channel_layer.group_send)(
        f"notifications_tenant_{tenant_schema}",
        {"type": "notification.message", "payload": payload},
    )


def _send_web_push(notification: NotificationEvent):
    try:
        from pywebpush import WebPushException, webpush
    except Exception:
        return

    if not bool(getattr(settings, "ENABLE_BROWSER_PUSH", False)):
        return
    if notification.severity != NotificationEvent.Severity.CRITICAL:
        return

    vapid_private_key = (getattr(settings, "WEB_PUSH_PRIVATE_KEY", "") or "").strip()
    vapid_claims_subject = (getattr(settings, "WEB_PUSH_SUBJECT", "") or "").strip()
    if not vapid_private_key or not vapid_claims_subject:
        return

    target_user_id = notification.metadata.get("target_user_id")
    queryset = PushSubscription.objects.filter(is_active=True)
    if target_user_id:
        queryset = queryset.filter(user_id=target_user_id)
    else:
        queryset = queryset.filter(
            Q(user__customer_memberships__customer_id=notification.customer_id, user__customer_memberships__is_active=True)
            | Q(user__role="SUPER_ADMIN")
        ).distinct()

    payload = _notification_payload(notification)
    for subscription in queryset:
        subscription_info = {
            "endpoint": subscription.endpoint,
            "keys": {
                "p256dh": subscription.p256dh,
                "auth": subscription.auth,
            },
        }
        try:
            webpush(
                subscription_info=subscription_info,
                data=json.dumps(payload, ensure_ascii=False),
                vapid_private_key=vapid_private_key,
                vapid_claims={"sub": vapid_claims_subject},
            )
        except WebPushException:
            subscription.is_active = False
            subscription.save(update_fields=["is_active", "updated_at"])


def dispatch_notification(notification: NotificationEvent):
    _broadcast_ws(notification)
    _send_web_push(notification)


def _upsert_per_user_notification(
    *,
    alert_id: int,
    customer_id: int | None,
    title: str,
    message: str,
    severity: str,
    metadata: dict,
    target_user_id: int,
    dedupe_key: str | None,
):
    base_metadata = dict(metadata or {})
    base_metadata["target_user_id"] = target_user_id
    if dedupe_key:
        base_metadata["dedupe_key"] = dedupe_key

    queryset = NotificationEvent.objects.filter(
        alert_id=alert_id,
        metadata__target_user_id=target_user_id,
    )
    if dedupe_key:
        queryset = queryset.filter(metadata__dedupe_key=dedupe_key)
    notification = queryset.first()
    if notification:
        notification.customer_id = customer_id
        notification.title = title
        notification.message = message
        notification.severity = severity
        notification.metadata = base_metadata
        notification.is_active = True
        notification.snoozed_until = None
        notification.save()
        return notification

    return NotificationEvent.objects.create(
        alert_id=alert_id,
        customer_id=customer_id,
        title=title,
        message=message,
        severity=severity,
        metadata=base_metadata,
        is_active=True,
    )


def create_notifications(
    *,
    alert,
    title: str,
    message: str,
    severity: str,
    metadata: dict | None = None,
    recipients: Iterable[User] | None = None,
    dedupe_key: str | None = None,
):
    if recipients is None:
        recipients = _iter_candidate_users(alert.customer_id)

    created = []
    for user in recipients:
        if not _can_receive_ui_notification(user, severity=severity, customer_id=alert.customer_id):
            continue
        notification = _upsert_per_user_notification(
            alert_id=alert.id,
            customer_id=alert.customer_id,
            title=title,
            message=message,
            severity=severity,
            metadata=metadata or {},
            target_user_id=user.id,
            dedupe_key=dedupe_key,
        )
        created.append(notification)
    return created
