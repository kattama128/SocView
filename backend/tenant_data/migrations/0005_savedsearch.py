from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("tenant_data", "0004_parserdefinition_alert_parse_error_detail_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="SavedSearch",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("name", models.CharField(max_length=150)),
                ("text_query", models.CharField(blank=True, max_length=255)),
                ("source_name", models.CharField(blank=True, max_length=150)),
                ("state_id", models.PositiveBigIntegerField(blank=True, null=True)),
                (
                    "severity",
                    models.CharField(
                        blank=True,
                        choices=[("low", "Low"), ("medium", "Medium"), ("high", "High"), ("critical", "Critical")],
                        max_length=20,
                    ),
                ),
                ("is_active", models.BooleanField(blank=True, null=True)),
                ("dynamic_filters", models.JSONField(blank=True, default=list)),
                ("ordering", models.CharField(default="-event_timestamp", max_length=64)),
                ("visible_columns", models.JSONField(blank=True, default=list)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="saved_searches",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ("name", "id"),
                "unique_together": {("user", "name")},
            },
        ),
    ]
