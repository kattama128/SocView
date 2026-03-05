from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("tenant_data", "0014_add_source_scheduling_and_ingestionrun_error_json"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ParserTestCase",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("name", models.CharField(max_length=150)),
                ("input_raw", models.TextField()),
                ("expected_output", models.JSONField(blank=True, default=dict)),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="parser_test_cases",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "parser",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="test_cases",
                        to="tenant_data.parserdefinition",
                    ),
                ),
            ],
            options={
                "ordering": ("name", "id"),
            },
        ),
        migrations.AddIndex(
            model_name="parsertestcase",
            index=models.Index(fields=("parser",), name="parsertc_parser_idx"),
        ),
        migrations.AddIndex(
            model_name="alert",
            index=models.Index(fields=("-event_timestamp",), name="alert_event_ts_idx"),
        ),
        migrations.AddIndex(
            model_name="alert",
            index=models.Index(fields=("source_name", "-event_timestamp"), name="alert_source_event_ts_idx"),
        ),
    ]
