from django.core.management.base import BaseCommand
from django.db import connection, transaction

from tenant_data.models import Alert, Customer, IngestionRun, NotificationEvent, SavedSearch, Source


class Command(BaseCommand):
    help = "Backfill legacy records to a default business customer in the current schema."

    def handle(self, *args, **options):
        schema_name = (getattr(connection, "schema_name", None) or "legacy").strip() or "legacy"
        default_name = f"Legacy {schema_name}"
        default_code = schema_name[:64]

        with transaction.atomic():
            customer, created = Customer.objects.get_or_create(
                name=default_name,
                defaults={
                    "code": default_code,
                    "is_enabled": True,
                    "metadata": {"backfilled": True, "schema_name": schema_name},
                },
            )
            if not customer.code:
                customer.code = default_code
                customer.save(update_fields=["code", "updated_at"])

            alert_count = Alert.objects.filter(customer__isnull=True).update(customer=customer)
            source_count = Source.objects.filter(customer__isnull=True).update(customer=customer)
            saved_search_count = SavedSearch.objects.filter(customer__isnull=True).update(customer=customer)
            notification_count = NotificationEvent.objects.filter(customer__isnull=True).update(customer=customer)
            run_count = IngestionRun.objects.filter(customer__isnull=True).update(customer=customer)

        action = "created" if created else "reused"
        self.stdout.write(
            self.style.SUCCESS(
                (
                    f"Customer {action}: {customer.id} ({customer.name}) | "
                    f"alerts={alert_count}, sources={source_count}, saved_searches={saved_search_count}, "
                    f"notifications={notification_count}, ingestion_runs={run_count}"
                )
            )
        )
