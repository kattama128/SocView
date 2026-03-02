from tenant_data.models import AuditLog


def create_audit_log(request, action, obj, diff=None, alert=None):
    actor = request.user if request and request.user and request.user.is_authenticated else None
    meta = request.META if request else {}

    return AuditLog.objects.create(
        actor=actor,
        action=action,
        object_type=obj.__class__.__name__,
        object_id=str(getattr(obj, "pk", "")),
        diff=diff or {},
        alert=alert,
        ip_address=meta.get("REMOTE_ADDR") or None,
        user_agent=(meta.get("HTTP_USER_AGENT") or "")[:255],
    )
