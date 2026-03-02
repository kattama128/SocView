from django.contrib import admin

from .models import TenantPlaceholder


@admin.register(TenantPlaceholder)
class TenantPlaceholderAdmin(admin.ModelAdmin):
    list_display = ("id", "label", "created_at")
