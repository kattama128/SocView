from datetime import timedelta

from celery import shared_task
from django.db import transaction
from django.utils import timezone
from django_tenants.utils import get_tenant_domain_model, get_tenant_model, schema_context


@shared_task
def heartbeat():
    return "ok"


def _seed_tenant(schema_name):
    from tenant_data.models import AlertState, Tag

    with schema_context(schema_name):
        defaults_states = [
            {"name": "Nuovo", "order": 0, "is_final": False, "is_enabled": True},
            {"name": "In lavorazione", "order": 1, "is_final": False, "is_enabled": True},
            {"name": "Risolto", "order": 2, "is_final": True, "is_enabled": True},
            {"name": "Falso positivo", "order": 3, "is_final": True, "is_enabled": True},
        ]
        for payload in defaults_states:
            AlertState.objects.update_or_create(name=payload["name"], defaults=payload)

        defaults_tags = [
            {"name": "network", "scope": Tag.Scope.ALERT, "color": "#1976d2", "metadata": {}},
            {"name": "malware", "scope": Tag.Scope.ALERT, "color": "#d32f2f", "metadata": {}},
            {"name": "phishing", "scope": Tag.Scope.ALERT, "color": "#ed6c02", "metadata": {}},
        ]
        for payload in defaults_tags:
            Tag.objects.update_or_create(
                name=payload["name"],
                scope=payload["scope"],
                defaults={"color": payload["color"], "metadata": payload["metadata"]},
            )


@shared_task(bind=True)
def create_tenant_task(self, *, name, domain, schema_name, actor_id=None):
    TenantModel = get_tenant_model()
    DomainModel = get_tenant_domain_model()

    normalized_domain = domain.strip().lower()
    normalized_schema = schema_name.strip().lower()

    if TenantModel.objects.filter(schema_name=normalized_schema).exists():
        raise ValueError("Schema tenant gia esistente")
    if DomainModel.objects.filter(domain=normalized_domain).exists():
        raise ValueError("Dominio tenant gia esistente")

    paid_until = timezone.now().date() + timedelta(days=30)

    with transaction.atomic():
        tenant = TenantModel.objects.create(
            schema_name=normalized_schema,
            name=name.strip(),
            paid_until=paid_until,
            on_trial=True,
        )
        DomainModel.objects.create(domain=normalized_domain, tenant=tenant, is_primary=True)

    _seed_tenant(normalized_schema)

    if actor_id:
        try:
            from accounts.models import SecurityAuditEvent

            SecurityAuditEvent.objects.create(
                actor_id=actor_id,
                action="tenant.created",
                object_type="Tenant",
                object_id=str(tenant.id),
                metadata={"schema_name": normalized_schema, "domain": normalized_domain, "name": name.strip()},
            )
        except Exception:
            pass

    return {
        "status": "completed",
        "tenant_id": tenant.id,
        "schema_name": tenant.schema_name,
        "domain": normalized_domain,
        "name": tenant.name,
    }
