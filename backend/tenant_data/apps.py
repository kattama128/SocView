from django.apps import AppConfig


class TenantDataConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "tenant_data"

    def ready(self):
        from tenant_data import signals  # noqa: F401
