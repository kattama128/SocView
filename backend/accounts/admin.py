from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import SecurityAuditEvent, User, UserDashboardPreference


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    fieldsets = DjangoUserAdmin.fieldsets + (("Ruolo", {"fields": ("role",)}),)
    list_display = ("username", "email", "role", "is_staff", "is_superuser", "is_active")
    list_filter = ("role", "is_staff", "is_superuser", "is_active")


@admin.register(UserDashboardPreference)
class UserDashboardPreferenceAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "updated_at")


@admin.register(SecurityAuditEvent)
class SecurityAuditEventAdmin(admin.ModelAdmin):
    list_display = ("id", "created_at", "actor", "action", "object_type", "object_id", "ip_address")
    list_filter = ("action", "object_type")
    search_fields = ("actor__username", "object_type", "object_id", "metadata")
