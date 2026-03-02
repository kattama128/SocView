import uuid

from django.conf import settings
from django.db import models


def alert_attachment_upload_path(instance, filename):
    return f"attachments/alert_{instance.alert_id}/{filename}"


def generate_api_key():
    return uuid.uuid4().hex


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class AlertState(TimeStampedModel):
    name = models.CharField(max_length=100, unique=True)
    order = models.PositiveIntegerField(default=0)
    is_final = models.BooleanField(default=False)
    is_enabled = models.BooleanField(default=True)

    class Meta:
        ordering = ("order", "id")

    def __str__(self):
        return f"{self.order} - {self.name}"


class Tag(TimeStampedModel):
    class Scope(models.TextChoices):
        TENANT = "tenant", "Tenant"
        SOURCE = "source", "Source"
        ALERT = "alert", "Alert"

    name = models.CharField(max_length=100)
    color = models.CharField(max_length=20, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    scope = models.CharField(max_length=20, choices=Scope.choices, default=Scope.ALERT)

    class Meta:
        ordering = ("name",)
        unique_together = (("name", "scope"),)

    def __str__(self):
        return f"{self.name} ({self.scope})"


class Alert(TimeStampedModel):
    class Severity(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"
        CRITICAL = "critical", "Critical"

    title = models.CharField(max_length=255)
    severity = models.CharField(max_length=20, choices=Severity.choices, default=Severity.MEDIUM)
    event_timestamp = models.DateTimeField()
    source_name = models.CharField(max_length=120)
    source_id = models.CharField(max_length=120, blank=True)
    raw_payload = models.JSONField(default=dict, blank=True)
    parsed_payload = models.JSONField(null=True, blank=True, default=None)
    parsed_field_schema = models.JSONField(default=list, blank=True)
    parse_error_detail = models.TextField(blank=True)
    current_state = models.ForeignKey(AlertState, on_delete=models.PROTECT, related_name="alerts")
    dedup_fingerprint = models.CharField(max_length=255, db_index=True, blank=True)

    class Meta:
        ordering = ("-event_timestamp", "-id")

    @property
    def is_active(self):
        return not self.current_state.is_final

    def __str__(self):
        return f"{self.title} ({self.severity})"


class AlertOccurrence(TimeStampedModel):
    alert = models.OneToOneField(Alert, on_delete=models.CASCADE, related_name="occurrence")
    count = models.PositiveIntegerField(default=1)
    first_seen = models.DateTimeField()
    last_seen = models.DateTimeField()

    class Meta:
        ordering = ("-last_seen",)

    def __str__(self):
        return f"Alert {self.alert_id} x{self.count}"


class AlertTag(TimeStampedModel):
    alert = models.ForeignKey(Alert, on_delete=models.CASCADE, related_name="alert_tags")
    tag = models.ForeignKey(Tag, on_delete=models.CASCADE, related_name="tag_alerts")

    class Meta:
        unique_together = (("alert", "tag"),)
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.alert_id} -> {self.tag_id}"


class Assignment(TimeStampedModel):
    alert = models.OneToOneField(Alert, on_delete=models.CASCADE, related_name="assignment")
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_alerts",
    )
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_alerts_by",
    )

    class Meta:
        ordering = ("-updated_at",)

    def __str__(self):
        return f"Alert {self.alert_id} -> {self.assigned_to_id}"


class Comment(TimeStampedModel):
    alert = models.ForeignKey(Alert, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="comments")
    body = models.TextField()

    class Meta:
        ordering = ("created_at",)

    def __str__(self):
        return f"Comment {self.id} on alert {self.alert_id}"


class Attachment(TimeStampedModel):
    alert = models.ForeignKey(Alert, on_delete=models.CASCADE, related_name="attachments")
    filename = models.CharField(max_length=255)
    file = models.FileField(upload_to=alert_attachment_upload_path)
    content_type = models.CharField(max_length=120, blank=True)
    size = models.PositiveBigIntegerField(default=0)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="uploaded_attachments",
    )

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return self.filename


class AuditLog(models.Model):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    action = models.CharField(max_length=100)
    object_type = models.CharField(max_length=100)
    object_id = models.CharField(max_length=100)
    diff = models.JSONField(default=dict, blank=True)
    alert = models.ForeignKey(Alert, on_delete=models.SET_NULL, null=True, blank=True, related_name="audit_logs")
    timestamp = models.DateTimeField(auto_now_add=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ("-timestamp", "-id")

    def __str__(self):
        return f"{self.action} {self.object_type}:{self.object_id}"


class Source(TimeStampedModel):
    class Type(models.TextChoices):
        IMAP = "imap", "IMAP"
        REST = "rest", "REST"
        WEBHOOK = "webhook", "Webhook"

    name = models.CharField(max_length=150)
    type = models.CharField(max_length=20, choices=Type.choices)
    is_enabled = models.BooleanField(default=True)
    severity_map = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ("name",)
        unique_together = (("name", "type"),)

    def __str__(self):
        return f"{self.name} ({self.type})"


class ParserDefinition(TimeStampedModel):
    source = models.OneToOneField(Source, on_delete=models.CASCADE, related_name="parser_definition")
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    is_enabled = models.BooleanField(default=True)
    active_revision = models.ForeignKey(
        "ParserRevision",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )

    class Meta:
        ordering = ("name", "id")

    def __str__(self):
        return f"{self.name} (source={self.source_id})"


class ParserRevision(TimeStampedModel):
    parser_definition = models.ForeignKey(
        ParserDefinition,
        on_delete=models.CASCADE,
        related_name="revisions",
    )
    version = models.PositiveIntegerField()
    config_text = models.TextField()
    config_data = models.JSONField(default=dict, blank=True)
    rollback_from = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="rollback_children",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="parser_revisions",
    )

    class Meta:
        ordering = ("-version", "-id")
        unique_together = (("parser_definition", "version"),)

    def __str__(self):
        return f"ParserRevision {self.parser_definition_id} v{self.version}"


class SourceConfig(TimeStampedModel):
    class Status(models.TextChoices):
        NEVER = "never", "Never"
        HEALTHY = "healthy", "Healthy"
        ERROR = "error", "Error"

    source = models.OneToOneField(Source, on_delete=models.CASCADE, related_name="config")
    config_json = models.JSONField(default=dict, blank=True)
    poll_interval_seconds = models.PositiveIntegerField(default=300)
    secrets_ref = models.CharField(max_length=255, blank=True)
    webhook_api_key = models.CharField(max_length=64, default=generate_api_key)
    rate_limit_per_minute = models.PositiveIntegerField(default=60)

    last_polled_at = models.DateTimeField(null=True, blank=True)
    last_success = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.NEVER)
    health_details = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return f"Config {self.source.name}"


class DedupPolicy(TimeStampedModel):
    class Strategy(models.TextChoices):
        INCREMENT_OCCURRENCE = "increment_occurrence", "Increment Occurrence"

    source = models.OneToOneField(Source, on_delete=models.CASCADE, related_name="dedup_policy")
    fingerprint_fields = models.JSONField(default=list, blank=True)
    strategy = models.CharField(
        max_length=40,
        choices=Strategy.choices,
        default=Strategy.INCREMENT_OCCURRENCE,
    )

    def __str__(self):
        return f"Dedup {self.source.name}"


class IngestionRun(models.Model):
    class Trigger(models.TextChoices):
        SCHEDULED = "scheduled", "Scheduled"
        MANUAL = "manual", "Manual"
        WEBHOOK = "webhook", "Webhook"
        TEST = "test", "Test"

    class Status(models.TextChoices):
        RUNNING = "running", "Running"
        SUCCESS = "success", "Success"
        PARTIAL = "partial", "Partial"
        ERROR = "error", "Error"

    source = models.ForeignKey(Source, on_delete=models.CASCADE, related_name="ingestion_runs")
    trigger = models.CharField(max_length=20, choices=Trigger.choices, default=Trigger.SCHEDULED)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.RUNNING)
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    processed_count = models.PositiveIntegerField(default=0)
    created_count = models.PositiveIntegerField(default=0)
    updated_count = models.PositiveIntegerField(default=0)
    error_count = models.PositiveIntegerField(default=0)
    error_detail = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ("-started_at", "-id")

    def __str__(self):
        return f"Run {self.id} {self.source.name} ({self.status})"


class IngestionEventLog(TimeStampedModel):
    class Action(models.TextChoices):
        CREATED = "created", "Created"
        UPDATED = "updated", "Updated"
        ERROR = "error", "Error"
        IGNORED = "ignored", "Ignored"

    run = models.ForeignKey(IngestionRun, on_delete=models.CASCADE, related_name="events")
    source = models.ForeignKey(Source, on_delete=models.CASCADE, related_name="event_logs")
    alert = models.ForeignKey(Alert, on_delete=models.SET_NULL, null=True, blank=True)
    fingerprint = models.CharField(max_length=255, blank=True)
    action = models.CharField(max_length=20, choices=Action.choices)
    parse_error = models.TextField(blank=True)
    error_detail = models.TextField(blank=True)
    raw_preview = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ("-created_at", "-id")

    def __str__(self):
        return f"{self.source.name} {self.action}"


class SavedSearch(TimeStampedModel):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="saved_searches",
    )
    name = models.CharField(max_length=150)
    text_query = models.CharField(max_length=255, blank=True)
    source_name = models.CharField(max_length=150, blank=True)
    state_id = models.PositiveBigIntegerField(null=True, blank=True)
    severity = models.CharField(max_length=20, choices=Alert.Severity.choices, blank=True)
    is_active = models.BooleanField(null=True, blank=True)
    dynamic_filters = models.JSONField(default=list, blank=True)
    ordering = models.CharField(max_length=64, default="-event_timestamp")
    visible_columns = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ("name", "id")
        unique_together = (("user", "name"),)

    def __str__(self):
        return f"{self.user_id}:{self.name}"


class TenantPlaceholder(models.Model):
    label = models.CharField(max_length=120, default="placeholder")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Tenant Placeholder"
        verbose_name_plural = "Tenant Placeholders"

    def __str__(self):
        return self.label
