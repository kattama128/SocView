from accounts.models import SecurityAuditEvent


def create_security_audit_event(request, action: str, object_type: str, object_id: str = "", metadata=None):
    actor = request.user if request and request.user and request.user.is_authenticated else None
    meta = request.META if request else {}
    return SecurityAuditEvent.objects.create(
        actor=actor,
        action=action,
        object_type=object_type,
        object_id=str(object_id or ""),
        metadata=metadata or {},
        ip_address=meta.get("REMOTE_ADDR") or None,
        user_agent=(meta.get("HTTP_USER_AGENT") or "")[:255],
    )
