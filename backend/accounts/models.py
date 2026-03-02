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
