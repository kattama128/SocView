from django.db import models


class TenantPlaceholder(models.Model):
    label = models.CharField(max_length=120, default="placeholder")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Tenant Placeholder"
        verbose_name_plural = "Tenant Placeholders"

    def __str__(self):
        return self.label
