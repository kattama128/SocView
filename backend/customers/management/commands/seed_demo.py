from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone
from django_tenants.utils import get_tenant_domain_model, get_tenant_model


class Command(BaseCommand):
    help = "Crea tenant e utenti demo per bootstrap locale"

    def handle(self, *args, **options):
        User = get_user_model()
        TenantModel = get_tenant_model()
        DomainModel = get_tenant_domain_model()

        paid_until = timezone.now().date() + timedelta(days=365)

        if not TenantModel.objects.filter(schema_name="public").exists():
            public_tenant = TenantModel(
                schema_name="public",
                name="Public",
                paid_until=paid_until,
                on_trial=False,
            )
            public_tenant.auto_create_schema = False
            public_tenant.save()
            self.stdout.write(self.style.SUCCESS("Creato tenant public"))
        else:
            public_tenant = TenantModel.objects.get(schema_name="public")

        public_domain = getattr(settings, "PUBLIC_SCHEMA_DOMAIN", None) or "localhost"
        DomainModel.objects.get_or_create(
            domain=public_domain,
            defaults={"tenant": public_tenant, "is_primary": True},
        )

        demo_tenants = [
            {"schema_name": "tenant1", "name": "Tenant Demo 1", "domain": "tenant1.localhost"},
            {"schema_name": "tenant2", "name": "Tenant Demo 2", "domain": "tenant2.localhost"},
        ]

        for cfg in demo_tenants:
            tenant, created = TenantModel.objects.get_or_create(
                schema_name=cfg["schema_name"],
                defaults={
                    "name": cfg["name"],
                    "paid_until": paid_until,
                    "on_trial": True,
                },
            )
            if created:
                self.stdout.write(self.style.SUCCESS(f"Creato tenant: {cfg['schema_name']}"))
            else:
                tenant.name = cfg["name"]
                tenant.paid_until = paid_until
                tenant.on_trial = True
                tenant.save(update_fields=["name", "paid_until", "on_trial"])
                self.stdout.write(self.style.WARNING(f"Tenant aggiornato: {cfg['schema_name']}"))

            DomainModel.objects.get_or_create(
                domain=cfg["domain"],
                defaults={"tenant": tenant, "is_primary": True},
            )

        users = [
            {
                "username": "admin",
                "password": "Admin123!",
                "email": "admin@socview.local",
                "role": User.Role.SUPER_ADMIN,
                "is_superuser": True,
                "is_staff": True,
            },
            {
                "username": "manager",
                "password": "Manager123!",
                "email": "manager@socview.local",
                "role": User.Role.SOC_MANAGER,
                "is_superuser": False,
                "is_staff": True,
            },
            {
                "username": "analyst",
                "password": "Analyst123!",
                "email": "analyst@socview.local",
                "role": User.Role.SOC_ANALYST,
                "is_superuser": False,
                "is_staff": False,
            },
        ]

        for payload in users:
            user, _ = User.objects.get_or_create(username=payload["username"], defaults={"email": payload["email"]})
            user.email = payload["email"]
            user.role = payload["role"]
            user.is_superuser = payload["is_superuser"]
            user.is_staff = payload["is_staff"]
            user.is_active = True
            user.set_password(payload["password"])
            user.save()
            self.stdout.write(self.style.SUCCESS(f"Utente pronto: {payload['username']} ({payload['role']})"))

        self.stdout.write(self.style.SUCCESS("Seed demo completato"))
