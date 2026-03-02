from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("tenant_data", "0005_savedsearch"),
    ]

    operations = [
        migrations.AddField(
            model_name="attachment",
            name="scan_detail",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="attachment",
            name="scan_status",
            field=models.CharField(
                choices=[("clean", "Clean"), ("suspicious", "Suspicious"), ("failed", "Failed")],
                default="clean",
                max_length=20,
            ),
        ),
        migrations.CreateModel(
            name="NotificationEvent",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("title", models.CharField(max_length=255)),
                ("message", models.TextField(blank=True)),
                (
                    "severity",
                    models.CharField(
                        choices=[("low", "Low"), ("medium", "Medium"), ("high", "High"), ("critical", "Critical")],
                        default="medium",
                        max_length=20,
                    ),
                ),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("is_active", models.BooleanField(default=True)),
                (
                    "alert",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="notifications",
                        to="tenant_data.alert",
                    ),
                ),
            ],
            options={
                "ordering": ("-created_at", "-id"),
            },
        ),
        migrations.CreateModel(
            name="NotificationRead",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("read_at", models.DateTimeField(auto_now_add=True)),
                (
                    "notification",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="reads",
                        to="tenant_data.notificationevent",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="notification_reads",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ("-read_at",),
                "unique_together": {("notification", "user")},
            },
        ),
    ]
