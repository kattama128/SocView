from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        SUPER_ADMIN = "SUPER_ADMIN", "SuperAdmin"
        SOC_MANAGER = "SOC_MANAGER", "SOC Manager"
        SOC_ANALYST = "SOC_ANALYST", "SOC Analyst"
        READ_ONLY = "READ_ONLY", "ReadOnly"

    role = models.CharField(max_length=20, choices=Role.choices, default=Role.READ_ONLY)

    def __str__(self):
        return f"{self.username} ({self.role})"


class SecurityAuditEvent(models.Model):
    actor = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="security_audit_events",
    )
    action = models.CharField(max_length=120)
    object_type = models.CharField(max_length=120)
    object_id = models.CharField(max_length=120, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at", "-id")
        indexes = [
            models.Index(fields=("action", "-created_at"), name="secaudit_action_created_idx"),
            models.Index(fields=("actor", "-created_at"), name="secaudit_actor_created_idx"),
        ]

    def __str__(self):
        return f"{self.action} ({self.object_type}:{self.object_id})"


class UserDashboardPreference(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="dashboard_preference")
    widgets_layout = models.JSONField(default=list, blank=True)
    tenant_order = models.JSONField(default=list, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Dashboard Preference"
        verbose_name_plural = "Dashboard Preferences"

    def __str__(self):
        return f"DashboardPreference({self.user.username})"
