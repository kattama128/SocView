from django.contrib import admin

from .models import (
    Alert,
    AlertOccurrence,
    AlertState,
    AlertTag,
    Assignment,
    Attachment,
    AuditLog,
    Comment,
    DedupPolicy,
    IngestionEventLog,
    IngestionRun,
    ParserDefinition,
    ParserRevision,
    SavedSearch,
    Source,
    SourceConfig,
    Tag,
    TenantPlaceholder,
)


@admin.register(TenantPlaceholder)
class TenantPlaceholderAdmin(admin.ModelAdmin):
    list_display = ("id", "label", "created_at")


@admin.register(AlertState)
class AlertStateAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "order", "is_final", "is_enabled")
    list_editable = ("order", "is_final", "is_enabled")


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "scope", "color", "updated_at")
    list_filter = ("scope",)
    search_fields = ("name",)


@admin.register(Alert)
class AlertAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "severity", "current_state", "source_name", "event_timestamp", "parse_error_detail")
    list_filter = ("severity", "current_state")
    search_fields = ("title", "source_name", "source_id", "dedup_fingerprint")


@admin.register(AlertOccurrence)
class AlertOccurrenceAdmin(admin.ModelAdmin):
    list_display = ("id", "alert", "count", "first_seen", "last_seen")


@admin.register(AlertTag)
class AlertTagAdmin(admin.ModelAdmin):
    list_display = ("id", "alert", "tag", "created_at")


@admin.register(Assignment)
class AssignmentAdmin(admin.ModelAdmin):
    list_display = ("id", "alert", "assigned_to", "assigned_by", "updated_at")


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ("id", "alert", "author", "created_at")
    search_fields = ("body",)


@admin.register(Attachment)
class AttachmentAdmin(admin.ModelAdmin):
    list_display = ("id", "alert", "filename", "uploaded_by", "size", "created_at")


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("id", "timestamp", "actor", "action", "object_type", "object_id")
    search_fields = ("action", "object_type", "object_id")


@admin.register(Source)
class SourceAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "type", "is_enabled", "updated_at")
    list_filter = ("type", "is_enabled")
    search_fields = ("name",)


@admin.register(ParserDefinition)
class ParserDefinitionAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "source", "is_enabled", "active_revision", "updated_at")
    list_filter = ("is_enabled",)
    search_fields = ("name", "source__name")


@admin.register(ParserRevision)
class ParserRevisionAdmin(admin.ModelAdmin):
    list_display = ("id", "parser_definition", "version", "created_by", "rollback_from", "created_at")
    search_fields = ("parser_definition__name", "parser_definition__source__name")


@admin.register(SourceConfig)
class SourceConfigAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "source",
        "poll_interval_seconds",
        "status",
        "last_success",
        "last_polled_at",
    )
    list_filter = ("status",)


@admin.register(DedupPolicy)
class DedupPolicyAdmin(admin.ModelAdmin):
    list_display = ("id", "source", "strategy", "updated_at")


@admin.register(IngestionRun)
class IngestionRunAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "source",
        "trigger",
        "status",
        "processed_count",
        "created_count",
        "updated_count",
        "error_count",
        "started_at",
    )
    list_filter = ("trigger", "status")


@admin.register(IngestionEventLog)
class IngestionEventLogAdmin(admin.ModelAdmin):
    list_display = ("id", "run", "source", "action", "alert", "created_at")
    list_filter = ("action",)


@admin.register(SavedSearch)
class SavedSearchAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "name", "source_name", "ordering", "updated_at")
    list_filter = ("severity",)
    search_fields = ("name", "user__username", "source_name")
