import uuid

from django.conf import settings
from django.contrib.postgres.indexes import GinIndex
from django.db import models


def alert_attachment_upload_path(instance, filename):
    return f"attachments/alert_{instance.alert_id}/{filename}"


def generate_api_key():
    return uuid.uuid4().hex


def default_alert_iocs():
    return {
        "ips": [],
        "hashes": [],
        "urls": [],
        "emails": [],
    }


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Customer(TimeStampedModel):
    name = models.CharField(max_length=150)
    code = models.CharField(max_length=64, blank=True)
    is_enabled = models.BooleanField(default=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ("name", "id")
        constraints = [
            models.UniqueConstraint(fields=("name",), name="tenant_data_customer_name_unique"),
        ]
        indexes = [
            models.Index(fields=("is_enabled", "name"), name="cust_enabled_name_idx"),
        ]

    def __str__(self):
        if self.code:
            return f"{self.name} ({self.code})"
        return self.name


class CustomerMembership(TimeStampedModel):
    class Scope(models.TextChoices):
        VIEWER = "viewer", "Viewer"
        TRIAGE = "triage", "Triage"
        MANAGER = "manager", "Manager"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="customer_memberships",
    )
    customer = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    scope = models.CharField(max_length=20, choices=Scope.choices, default=Scope.TRIAGE)
    is_active = models.BooleanField(default=True)
    notes = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        ordering = ("customer_id", "user_id")
        unique_together = (("user", "customer"),)
        indexes = [
            models.Index(fields=("user", "is_active"), name="custmemb_user_active_idx"),
            models.Index(fields=("customer", "is_active"), name="custmemb_customer_active_idx"),
            models.Index(fields=("scope", "is_active"), name="custmemb_scope_active_idx"),
        ]

    def __str__(self):
        return f"{self.user_id}:{self.customer_id}:{self.scope}"


class CustomerSettings(TimeStampedModel):
    class Tier(models.TextChoices):
        BRONZE = "Bronze", "Bronze"
        SILVER = "Silver", "Silver"
        GOLD = "Gold", "Gold"
        PLATINUM = "Platinum", "Platinum"

    class DefaultSeverity(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"
        CRITICAL = "critical", "Critical"

    customer = models.OneToOneField(Customer, on_delete=models.CASCADE, related_name="settings")
    tier = models.CharField(max_length=20, choices=Tier.choices, default=Tier.GOLD)
    timezone = models.CharField(max_length=64, default="Europe/Rome")
    sla_target = models.CharField(max_length=64, default="15m")
    primary_contact = models.CharField(max_length=150, default="SOC Lead")
    contact_email = models.EmailField(default="soc@example.com")
    contact_phone = models.CharField(max_length=64, default="+39 000 000 000")
    notify_channels = models.CharField(max_length=255, default="Email, Slack, PagerDuty")
    escalation_matrix = models.CharField(max_length=255, default="L1 -> L2 -> L3")
    maintenance_window = models.CharField(max_length=255, default="Sunday 02:00 - 03:00")
    default_severity = models.CharField(
        max_length=20,
        choices=DefaultSeverity.choices,
        default=DefaultSeverity.MEDIUM,
    )
    auto_assign_team = models.CharField(max_length=120, default="SOC L1")
    notify_on_critical = models.BooleanField(default=True)
    notify_on_high = models.BooleanField(default=True)
    allow_suppress = models.BooleanField(default=True)
    retention_days = models.PositiveIntegerField(default=365)
    tag_defaults = models.CharField(max_length=255, default="customer, socview")
    enrich_geo = models.BooleanField(default=True)
    enrich_threat_intel = models.BooleanField(default=True)
    allow_external_sharing = models.BooleanField(default=False)

    class Meta:
        ordering = ("customer_id",)

    def __str__(self):
        return f"Settings for customer {self.customer_id}"


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
    customer = models.ForeignKey(
        Customer,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="alerts",
    )
    severity = models.CharField(max_length=20, choices=Severity.choices, default=Severity.MEDIUM)
    event_timestamp = models.DateTimeField()
    source_name = models.CharField(max_length=120)
    source_id = models.CharField(max_length=120, blank=True)
    raw_payload = models.JSONField(default=dict, blank=True)
    parsed_payload = models.JSONField(null=True, blank=True, default=None)
    parsed_field_schema = models.JSONField(default=list, blank=True)
    parse_error_detail = models.TextField(blank=True)
    iocs = models.JSONField(default=default_alert_iocs, blank=True)
    mitre_technique_id = models.CharField(max_length=20, null=True, blank=True)
    current_state = models.ForeignKey(AlertState, on_delete=models.PROTECT, related_name="alerts")
    dedup_fingerprint = models.CharField(max_length=255, db_index=True, blank=True)

    class Meta:
        ordering = ("-event_timestamp", "-id")
        indexes = [
            models.Index(fields=("customer", "-event_timestamp"), name="alert_customer_event_ts_idx"),
            models.Index(fields=("customer", "severity"), name="alert_customer_severity_idx"),
            models.Index(fields=("customer", "source_name"), name="alert_customer_source_idx"),
            models.Index(fields=("-event_timestamp",), name="alert_event_ts_idx"),
            models.Index(fields=("source_name", "-event_timestamp"), name="alert_source_event_ts_idx"),
            GinIndex(fields=("iocs",), name="alert_iocs_gin_idx"),
        ]

    @property
    def is_active(self):
        return not self.current_state.is_final

    def __str__(self):
        return f"{self.title} ({self.severity})"


class SLAConfig(TimeStampedModel):
    severity = models.CharField(max_length=20, choices=Alert.Severity.choices)
    response_minutes = models.PositiveIntegerField()
    resolution_minutes = models.PositiveIntegerField()

    class Meta:
        ordering = ("severity", "id")
        constraints = [
            models.UniqueConstraint(fields=("severity",), name="sla_config_severity_unique"),
        ]

    def __str__(self):
        return f"SLA {self.severity}: response={self.response_minutes} resolution={self.resolution_minutes}"


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
    class ScanStatus(models.TextChoices):
        CLEAN = "clean", "Clean"
        SUSPICIOUS = "suspicious", "Suspicious"
        FAILED = "failed", "Failed"

    alert = models.ForeignKey(Alert, on_delete=models.CASCADE, related_name="attachments")
    filename = models.CharField(max_length=255)
    file = models.FileField(upload_to=alert_attachment_upload_path)
    content_type = models.CharField(max_length=120, blank=True)
    size = models.PositiveBigIntegerField(default=0)
    scan_status = models.CharField(max_length=20, choices=ScanStatus.choices, default=ScanStatus.CLEAN)
    scan_detail = models.TextField(blank=True)
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
        SYSLOG_UDP = "syslog_udp", "Syslog UDP"
        SYSLOG_TCP = "syslog_tcp", "Syslog TCP"
        KAFKA_TOPIC = "kafka_topic", "Kafka Topic"
        S3_BUCKET = "s3_bucket", "S3 Bucket"
        AZURE_EVENT_HUB = "azure_event_hub", "Azure Event Hub"
        GCP_PUBSUB = "gcp_pubsub", "GCP Pub/Sub"
        SFTP_DROP = "sftp_drop", "SFTP Drop"

    customer = models.ForeignKey(
        Customer,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sources",
    )
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True, default="")
    type = models.CharField(max_length=20, choices=Type.choices)
    is_enabled = models.BooleanField(default=True)
    severity_map = models.JSONField(default=dict, blank=True)
    schedule_cron = models.CharField(max_length=120, null=True, blank=True)
    schedule_interval_minutes = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        ordering = ("name",)
        unique_together = (("customer", "name", "type"),)
        indexes = [
            models.Index(fields=("customer", "type", "is_enabled"), name="src_cust_type_enabled_idx"),
        ]

    def __str__(self):
        return f"{self.name} ({self.type})"


class CustomerSourcePreference(TimeStampedModel):
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name="source_preferences")
    source = models.ForeignKey(Source, on_delete=models.CASCADE, related_name="customer_preferences")
    is_enabled = models.BooleanField(default=True)

    class Meta:
        ordering = ("customer_id", "source_id")
        unique_together = (("customer", "source"),)
        indexes = [
            models.Index(fields=("customer", "is_enabled"), name="custsrcpref_cust_enabled_idx"),
            models.Index(fields=("source", "is_enabled"), name="custsrcpref_src_enabled_idx"),
        ]

    def __str__(self):
        return f"{self.customer_id}:{self.source_id}={self.is_enabled}"


class SourceAlertTypeRule(TimeStampedModel):
    class MatchMode(models.TextChoices):
        EXACT = "exact", "Exact"
        CONTAINS = "contains", "Contains"
        REGEX = "regex", "Regex"

    source = models.ForeignKey(Source, on_delete=models.CASCADE, related_name="alert_type_rules")
    alert_name = models.CharField(max_length=255)
    match_mode = models.CharField(max_length=20, choices=MatchMode.choices, default=MatchMode.EXACT)
    severity = models.CharField(max_length=20, choices=Alert.Severity.choices, default=Alert.Severity.MEDIUM)
    is_enabled = models.BooleanField(default=True)
    notes = models.TextField(blank=True)
    received_count = models.PositiveIntegerField(default=0)
    last_seen_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("alert_name", "id")
        unique_together = (("source", "alert_name", "match_mode"),)
        indexes = [
            models.Index(fields=("source", "is_enabled"), name="srcalrule_src_enabled_idx"),
            models.Index(fields=("source", "alert_name"), name="srcalrule_src_name_idx"),
        ]

    def __str__(self):
        return f"{self.source_id}:{self.alert_name}:{self.match_mode}"


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


class ParserTestCase(TimeStampedModel):
    parser = models.ForeignKey(
        ParserDefinition,
        on_delete=models.CASCADE,
        related_name="test_cases",
    )
    name = models.CharField(max_length=150)
    input_raw = models.TextField()
    expected_output = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="parser_test_cases",
    )

    class Meta:
        ordering = ("name", "id")
        indexes = [
            models.Index(fields=("parser",), name="parsertc_parser_idx"),
        ]

    def __str__(self):
        return f"ParserTestCase {self.parser_id}:{self.name}"


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

    customer = models.ForeignKey(
        Customer,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ingestion_runs",
    )
    source = models.ForeignKey(Source, on_delete=models.CASCADE, related_name="ingestion_runs")
    trigger = models.CharField(max_length=20, choices=Trigger.choices, default=Trigger.SCHEDULED)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.RUNNING)
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    processed_count = models.PositiveIntegerField(default=0)
    created_count = models.PositiveIntegerField(default=0)
    updated_count = models.PositiveIntegerField(default=0)
    error_count = models.PositiveIntegerField(default=0)
    error_message = models.TextField(blank=True, default="")
    error_detail = models.JSONField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ("-started_at", "-id")
        indexes = [
            models.Index(fields=("customer", "-started_at"), name="ingrun_customer_started_idx"),
            models.Index(fields=("source",), name="ingrun_source_idx"),
            models.Index(fields=("-started_at",), name="ingrun_started_idx"),
        ]

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
    customer = models.ForeignKey(
        Customer,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
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
        unique_together = (("user", "customer", "name"),)
        indexes = [
            models.Index(fields=("customer", "user"), name="savedsearch_customer_user_idx"),
        ]

    def __str__(self):
        return f"{self.user_id}:{self.name}"


class AlertDetailFieldConfig(TimeStampedModel):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="alert_detail_field_configs",
    )
    customer = models.ForeignKey(
        Customer,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="alert_detail_field_configs",
    )
    source_name = models.CharField(max_length=150)
    alert_type = models.CharField(max_length=255)
    visible_fields = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ("source_name", "alert_type", "id")
        unique_together = (("user", "customer", "source_name", "alert_type"),)
        indexes = [
            models.Index(
                fields=("customer", "user", "source_name", "alert_type"),
                name="alertdetailcfg_scope_idx",
            ),
        ]

    def __str__(self):
        return f"{self.user_id}:{self.source_name}:{self.alert_type}"


class NotificationEvent(TimeStampedModel):
    class Severity(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"
        CRITICAL = "critical", "Critical"

    alert = models.ForeignKey(Alert, on_delete=models.CASCADE, related_name="notifications")
    customer = models.ForeignKey(
        Customer,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notifications",
    )
    title = models.CharField(max_length=255)
    message = models.TextField(blank=True)
    severity = models.CharField(max_length=20, choices=Severity.choices, default=Severity.MEDIUM)
    metadata = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)
    snoozed_until = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at", "-id")
        indexes = [
            models.Index(fields=("customer", "is_active", "-created_at"), name="notif_cust_active_created_idx"),
        ]

    def __str__(self):
        return f"{self.severity}:{self.title}"


def default_notification_channels():
    return {
        "ui": True,
        "email": False,
    }


class NotificationPreferences(TimeStampedModel):
    class MinSeverity(models.TextChoices):
        ALL = "all", "All"
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"
        CRITICAL = "critical", "Critical"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notification_preferences",
    )
    min_severity = models.CharField(
        max_length=20,
        choices=MinSeverity.choices,
        default=MinSeverity.ALL,
    )
    customer_filter = models.ManyToManyField(
        Customer,
        related_name="notification_preferences",
        blank=True,
    )
    channels = models.JSONField(default=default_notification_channels, blank=True)

    class Meta:
        ordering = ("user_id",)

    def __str__(self):
        return f"NotificationPreferences(user={self.user_id}, min={self.min_severity})"


class PushSubscription(TimeStampedModel):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="push_subscriptions",
    )
    endpoint = models.TextField()
    p256dh = models.TextField()
    auth = models.TextField()
    user_agent = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("-updated_at", "-id")
        constraints = [
            models.UniqueConstraint(fields=("user", "endpoint"), name="push_subscription_user_endpoint_unique"),
        ]

    def __str__(self):
        return f"PushSubscription(user={self.user_id})"


class NotificationRead(models.Model):
    notification = models.ForeignKey(NotificationEvent, on_delete=models.CASCADE, related_name="reads")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notification_reads")
    read_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = (("notification", "user"),)
        ordering = ("-read_at",)

    def __str__(self):
        return f"{self.user_id}->{self.notification_id}"


class TenantPlaceholder(models.Model):
    label = models.CharField(max_length=120, default="placeholder")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Tenant Placeholder"
        verbose_name_plural = "Tenant Placeholders"

    def __str__(self):
        return self.label
