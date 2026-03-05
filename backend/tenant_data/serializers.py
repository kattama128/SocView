from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import serializers

from tenant_data.models import (
    Alert,
    AlertDetailFieldConfig,
    AlertOccurrence,
    AlertState,
    AlertTag,
    Assignment,
    Attachment,
    AuditLog,
    Comment,
    Customer,
    CustomerMembership,
    CustomerSettings,
    NotificationEvent,
    NotificationPreferences,
    NotificationRead,
    PushSubscription,
    SLAConfig,
    SavedSearch,
    Source,
    Tag,
)

User = get_user_model()


class UserSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "username", "email", "role")


class AlertStateSerializer(serializers.ModelSerializer):
    class Meta:
        model = AlertState
        fields = ("id", "name", "order", "is_final", "is_enabled", "created_at", "updated_at")


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = ("id", "name", "code", "is_enabled", "metadata", "created_at", "updated_at")


class CustomerOverviewSerializer(CustomerSerializer):
    active_alerts_total = serializers.IntegerField(read_only=True)
    active_alerts_critical = serializers.IntegerField(read_only=True)
    active_alerts_high = serializers.IntegerField(read_only=True)
    active_alerts_medium = serializers.IntegerField(read_only=True)
    active_alerts_low = serializers.IntegerField(read_only=True)
    active_alerts_by_severity = serializers.SerializerMethodField()

    class Meta(CustomerSerializer.Meta):
        fields = CustomerSerializer.Meta.fields + (
            "active_alerts_total",
            "active_alerts_critical",
            "active_alerts_high",
            "active_alerts_medium",
            "active_alerts_low",
            "active_alerts_by_severity",
        )

    def get_active_alerts_by_severity(self, obj):
        return {
            "critical": getattr(obj, "active_alerts_critical", 0) or 0,
            "high": getattr(obj, "active_alerts_high", 0) or 0,
            "medium": getattr(obj, "active_alerts_medium", 0) or 0,
            "low": getattr(obj, "active_alerts_low", 0) or 0,
        }


class CustomerSettingsSerializer(serializers.ModelSerializer):
    contact_email = serializers.EmailField()
    retention_days = serializers.IntegerField(min_value=1, max_value=3650)

    class Meta:
        model = CustomerSettings
        fields = (
            "tier",
            "timezone",
            "sla_target",
            "primary_contact",
            "contact_email",
            "contact_phone",
            "notify_channels",
            "escalation_matrix",
            "maintenance_window",
            "default_severity",
            "auto_assign_team",
            "notify_on_critical",
            "notify_on_high",
            "allow_suppress",
            "retention_days",
            "tag_defaults",
            "enrich_geo",
            "enrich_threat_intel",
            "allow_external_sharing",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")


class CustomerSourceOverrideSerializer(serializers.Serializer):
    source_id = serializers.PrimaryKeyRelatedField(
        source="source",
        queryset=Source.objects.all(),
    )
    is_enabled = serializers.BooleanField()

    def validate_source(self, source):
        if source.customer_id is not None:
            raise serializers.ValidationError("Solo fonti globali supportate in impostazioni cliente")
        return source


class CustomerSourceCatalogSerializer(serializers.Serializer):
    source_id = serializers.IntegerField()
    name = serializers.CharField()
    type = serializers.CharField()
    description = serializers.CharField(allow_blank=True)
    globally_enabled = serializers.BooleanField()
    customer_enabled = serializers.BooleanField()
    parser_definition_name = serializers.CharField(allow_null=True, allow_blank=True)
    alert_type_rules_count = serializers.IntegerField()


class CustomerSettingsUpsertSerializer(serializers.Serializer):
    settings = CustomerSettingsSerializer(required=False)
    source_overrides = CustomerSourceOverrideSerializer(many=True, required=False)


class CustomerSettingsResponseSerializer(serializers.Serializer):
    customer = CustomerSerializer()
    settings = CustomerSettingsSerializer()
    sources = CustomerSourceCatalogSerializer(many=True)
    updated_at = serializers.DateTimeField()


class CustomerMembershipSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)
    email = serializers.CharField(source="user.email", read_only=True)

    class Meta:
        model = CustomerMembership
        fields = (
            "id",
            "user_id",
            "username",
            "email",
            "scope",
            "is_active",
            "notes",
            "created_at",
            "updated_at",
        )


class CustomerMembershipUpsertSerializer(serializers.Serializer):
    user_id = serializers.PrimaryKeyRelatedField(source="user", queryset=User.objects.all())
    scope = serializers.ChoiceField(choices=CustomerMembership.Scope.choices)
    is_active = serializers.BooleanField(required=False, default=True)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=255, default="")


class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ("id", "name", "scope", "color", "metadata", "created_at", "updated_at")


class AlertOccurrenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = AlertOccurrence
        fields = ("count", "first_seen", "last_seen")


class AssignmentSerializer(serializers.ModelSerializer):
    assigned_to_detail = UserSummarySerializer(source="assigned_to", read_only=True)
    assigned_by_detail = UserSummarySerializer(source="assigned_by", read_only=True)

    class Meta:
        model = Assignment
        fields = (
            "id",
            "assigned_to",
            "assigned_to_detail",
            "assigned_by",
            "assigned_by_detail",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("assigned_by",)


class CommentSerializer(serializers.ModelSerializer):
    author_detail = UserSummarySerializer(source="author", read_only=True)

    class Meta:
        model = Comment
        fields = ("id", "alert", "author", "author_detail", "body", "created_at", "updated_at")
        read_only_fields = ("alert", "author")


class AttachmentSerializer(serializers.ModelSerializer):
    uploaded_by_detail = UserSummarySerializer(source="uploaded_by", read_only=True)
    file_url = serializers.SerializerMethodField()
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = Attachment
        fields = (
            "id",
            "alert",
            "filename",
            "file_url",
            "download_url",
            "content_type",
            "size",
            "scan_status",
            "scan_detail",
            "uploaded_by",
            "uploaded_by_detail",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("alert", "uploaded_by", "size", "content_type", "filename")

    def get_file_url(self, obj) -> str | None:
        return self.get_download_url(obj)

    def get_download_url(self, obj) -> str | None:
        request = self.context.get("request")
        if not obj.file:
            return None
        relative_url = reverse("attachment-download", kwargs={"pk": obj.pk})
        if request:
            return request.build_absolute_uri(relative_url)
        return relative_url


class AlertBaseSerializer(serializers.ModelSerializer):
    customer_detail = CustomerSerializer(source="customer", read_only=True)
    is_active = serializers.SerializerMethodField()
    current_state_detail = AlertStateSerializer(source="current_state", read_only=True)
    occurrence = AlertOccurrenceSerializer(read_only=True)
    assignment = AssignmentSerializer(read_only=True)
    tags = serializers.SerializerMethodField()
    sla_status = serializers.SerializerMethodField()

    class Meta:
        model = Alert
        fields = (
            "id",
            "title",
            "customer",
            "customer_detail",
            "severity",
            "event_timestamp",
            "source_name",
            "source_id",
            "raw_payload",
            "parsed_payload",
            "parsed_field_schema",
            "parse_error_detail",
            "iocs",
            "mitre_technique_id",
            "current_state",
            "current_state_detail",
            "is_active",
            "dedup_fingerprint",
            "occurrence",
            "assignment",
            "tags",
            "sla_status",
            "created_at",
            "updated_at",
        )

    def get_is_active(self, obj) -> bool:
        return obj.is_active

    def get_tags(self, obj) -> list[dict]:
        alert_tags = obj.alert_tags.select_related("tag")
        return TagSerializer([item.tag for item in alert_tags], many=True).data

    def get_sla_status(self, obj):
        cache_key = "_sla_config_map"
        config_map = self.context.get(cache_key)
        if config_map is None:
            config_map = {item.severity: item for item in SLAConfig.objects.all()}
            self.context[cache_key] = config_map

        config = config_map.get(obj.severity)
        if config is None:
            return None

        now = timezone.now()
        elapsed_resolution_minutes = int((now - obj.created_at).total_seconds() // 60)
        resolution_reference = now
        if obj.current_state.is_final:
            resolution_reference = obj.updated_at
            elapsed_resolution_minutes = int((resolution_reference - obj.created_at).total_seconds() // 60)

        assignment = getattr(obj, "assignment", None)
        if assignment and assignment.assigned_to_id:
            response_reference = assignment.updated_at
        else:
            response_reference = now
        elapsed_response_minutes = int((response_reference - obj.created_at).total_seconds() // 60)

        def _status(elapsed: int, target: int) -> str:
            if target <= 0:
                return "breached"
            if elapsed >= target:
                return "breached"
            remaining = target - elapsed
            if remaining <= int(target * 0.2):
                return "warning"
            return "ok"

        remaining_response = config.response_minutes - elapsed_response_minutes
        return {
            "response": _status(elapsed_response_minutes, config.response_minutes),
            "resolution": _status(elapsed_resolution_minutes, config.resolution_minutes),
            "response_remaining_minutes": remaining_response,
        }


class AlertListSerializer(AlertBaseSerializer):
    class Meta(AlertBaseSerializer.Meta):
        fields = (
            "id",
            "title",
            "customer",
            "customer_detail",
            "severity",
            "event_timestamp",
            "source_name",
            "source_id",
            "current_state",
            "current_state_detail",
            "is_active",
            "dedup_fingerprint",
            "parse_error_detail",
            "assignment",
            "tags",
            "created_at",
            "updated_at",
        )


class AlertDetailSerializer(AlertBaseSerializer):
    comments = CommentSerializer(many=True, read_only=True)
    attachments = AttachmentSerializer(many=True, read_only=True)

    class Meta(AlertBaseSerializer.Meta):
        fields = AlertBaseSerializer.Meta.fields + ("comments", "attachments")


class RelatedAlertSerializer(serializers.ModelSerializer):
    current_state_detail = AlertStateSerializer(source="current_state", read_only=True)

    class Meta:
        model = Alert
        fields = ("id", "title", "severity", "created_at", "event_timestamp", "current_state_detail")


class SLAConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = SLAConfig
        fields = ("id", "severity", "response_minutes", "resolution_minutes", "created_at", "updated_at")


class StateChangeSerializer(serializers.Serializer):
    state_id = serializers.PrimaryKeyRelatedField(queryset=AlertState.objects.all())


class TagMutationSerializer(serializers.Serializer):
    tag_id = serializers.PrimaryKeyRelatedField(queryset=Tag.objects.all())


class AssignSerializer(serializers.Serializer):
    assigned_to_id = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), allow_null=True)


class CommentCreateSerializer(serializers.Serializer):
    body = serializers.CharField()


class AttachmentUploadSerializer(serializers.Serializer):
    file = serializers.FileField()


class AuditLogSerializer(serializers.ModelSerializer):
    actor_detail = UserSummarySerializer(source="actor", read_only=True)

    class Meta:
        model = AuditLog
        fields = (
            "id",
            "actor",
            "actor_detail",
            "action",
            "object_type",
            "object_id",
            "diff",
            "alert",
            "timestamp",
            "ip_address",
            "user_agent",
        )


class DynamicFilterSerializer(serializers.Serializer):
    field = serializers.CharField(max_length=255)
    type = serializers.ChoiceField(choices=("keyword", "number", "date", "boolean"))
    operator = serializers.ChoiceField(
        choices=("eq", "contains", "in", "gt", "gte", "lt", "lte"),
        default="eq",
    )
    value = serializers.JSONField()

    def validate(self, attrs):
        filter_type = attrs.get("type")
        operator = attrs.get("operator")
        value = attrs.get("value")

        if filter_type == "boolean" and operator != "eq":
            raise serializers.ValidationError("Filtri boolean supportano solo operator eq")

        if filter_type == "keyword" and operator in {"gt", "gte", "lt", "lte"}:
            raise serializers.ValidationError("Filtri keyword supportano solo eq/contains/in")

        if filter_type in {"number", "date"} and operator not in {"eq", "gt", "gte", "lt", "lte"}:
            raise serializers.ValidationError("Filtri number/date supportano solo eq/gt/gte/lt/lte")

        if operator == "in" and not isinstance(value, list):
            raise serializers.ValidationError("Operatore in richiede una lista nel campo value")

        return attrs


class AlertSearchRequestSerializer(serializers.Serializer):
    customer_id = serializers.IntegerField(required=False, min_value=1)
    text = serializers.CharField(required=False, allow_blank=True)
    source_name = serializers.CharField(required=False, allow_blank=True)
    source_names = serializers.ListField(
        child=serializers.CharField(allow_blank=False, max_length=150),
        required=False,
        allow_empty=False,
    )
    state_id = serializers.IntegerField(required=False, min_value=1)
    state_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        required=False,
        allow_empty=False,
    )
    severity = serializers.ChoiceField(choices=Alert.Severity.values, required=False)
    severities = serializers.ListField(
        child=serializers.ChoiceField(choices=Alert.Severity.values),
        required=False,
        allow_empty=False,
    )
    alert_types = serializers.ListField(
        child=serializers.CharField(allow_blank=False, max_length=255),
        required=False,
        allow_empty=False,
    )
    tag_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        required=False,
        allow_empty=False,
    )
    event_timestamp_from = serializers.DateTimeField(required=False)
    event_timestamp_to = serializers.DateTimeField(required=False)
    is_active = serializers.BooleanField(required=False)
    assignee = serializers.CharField(required=False, allow_blank=True)
    in_state_since = serializers.DateTimeField(required=False)
    dynamic_filters = DynamicFilterSerializer(many=True, required=False)
    ordering = serializers.CharField(required=False, allow_blank=True, default="-event_timestamp")
    page = serializers.IntegerField(required=False, min_value=1, default=1)
    page_size = serializers.IntegerField(required=False, min_value=1, max_value=100, default=25)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        from_ts = attrs.get("event_timestamp_from")
        to_ts = attrs.get("event_timestamp_to")
        assignee = (attrs.get("assignee") or "").strip()
        if from_ts and to_ts and from_ts > to_ts:
            raise serializers.ValidationError(
                {"event_timestamp_to": "event_timestamp_to deve essere >= event_timestamp_from"}
            )
        if assignee and assignee != "me":
            try:
                assignee_id = int(assignee)
            except (TypeError, ValueError) as exc:
                raise serializers.ValidationError({"assignee": "assignee deve essere 'me' o un id numerico"}) from exc
            if assignee_id <= 0:
                raise serializers.ValidationError({"assignee": "assignee deve essere 'me' o un id numerico"})
        return attrs


class SavedSearchSerializer(serializers.ModelSerializer):
    customer = serializers.PrimaryKeyRelatedField(
        queryset=Customer.objects.all(),
        required=False,
        allow_null=True,
    )
    severity = serializers.ChoiceField(
        choices=Alert.Severity.choices,
        required=False,
        allow_blank=True,
        allow_null=True,
    )

    class Meta:
        model = SavedSearch
        fields = (
            "id",
            "name",
            "customer",
            "text_query",
            "source_name",
            "state_id",
            "severity",
            "is_active",
            "dynamic_filters",
            "ordering",
            "visible_columns",
            "created_at",
            "updated_at",
        )

    def validate_severity(self, value):
        if value is None:
            return ""
        return value

    def validate_dynamic_filters(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("dynamic_filters deve essere una lista")
        serializer = DynamicFilterSerializer(data=value, many=True)
        serializer.is_valid(raise_exception=True)
        return value

    def validate_visible_columns(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("visible_columns deve essere una lista")
        return value


class ExportConfigurableRequestSerializer(AlertSearchRequestSerializer):
    columns = serializers.ListField(child=serializers.CharField(max_length=255), required=False, allow_empty=False)
    all_results = serializers.BooleanField(required=False, default=True)
    preview = serializers.BooleanField(required=False, default=False)
    limit = serializers.IntegerField(required=False, min_value=1, max_value=100, default=5)


class ExportPreviewResponseSerializer(serializers.Serializer):
    count = serializers.IntegerField()
    rows = serializers.ListField(child=serializers.DictField())
    columns = serializers.ListField(child=serializers.CharField())


class BulkActionRequestSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=("change_state", "assign", "add_tag"))
    ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        required=False,
        allow_empty=False,
    )
    select_all = serializers.BooleanField(required=False, default=False)
    filters = AlertSearchRequestSerializer(required=False)
    state_id = serializers.PrimaryKeyRelatedField(queryset=AlertState.objects.all(), required=False)
    assigned_to_id = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), required=False, allow_null=True)
    tag_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        required=False,
        allow_empty=False,
    )

    def validate(self, attrs):
        attrs = super().validate(attrs)
        action = attrs.get("action")
        select_all = attrs.get("select_all", False)
        ids = attrs.get("ids") or []
        filters = attrs.get("filters")

        if select_all and filters is None:
            raise serializers.ValidationError({"filters": "filters è obbligatorio quando select_all=true"})
        if not select_all and not ids:
            raise serializers.ValidationError({"ids": "ids è obbligatorio quando select_all=false"})

        if action == "change_state" and attrs.get("state_id") is None:
            raise serializers.ValidationError({"state_id": "state_id è obbligatorio per change_state"})
        if action == "assign" and "assigned_to_id" not in attrs:
            raise serializers.ValidationError({"assigned_to_id": "assigned_to_id è obbligatorio per assign"})
        if action == "add_tag" and not attrs.get("tag_ids"):
            raise serializers.ValidationError({"tag_ids": "tag_ids è obbligatorio per add_tag"})

        return attrs


class BulkActionResultSerializer(serializers.Serializer):
    updated = serializers.IntegerField()
    errors = serializers.IntegerField()


class AlertTimelineEventSerializer(serializers.Serializer):
    timestamp = serializers.DateTimeField()
    type = serializers.CharField()
    title = serializers.CharField()
    detail = serializers.JSONField(required=False)


class NotificationEventSerializer(serializers.ModelSerializer):
    alert_title = serializers.CharField(source="alert.title", read_only=True)
    customer_detail = CustomerSerializer(source="customer", read_only=True)
    is_read = serializers.SerializerMethodField()

    class Meta:
        model = NotificationEvent
        fields = (
            "id",
            "alert",
            "customer",
            "customer_detail",
            "alert_title",
            "title",
            "message",
            "severity",
            "metadata",
            "is_active",
            "snoozed_until",
            "is_read",
            "created_at",
            "updated_at",
        )

    def get_is_read(self, obj) -> bool:
        reads_map = self.context.get("reads_map") or {}
        user = self.context.get("request").user if self.context.get("request") else None
        if not user or not user.is_authenticated:
            return False
        return bool(reads_map.get(obj.id))


class NotificationAckSerializer(serializers.Serializer):
    notification_id = serializers.PrimaryKeyRelatedField(
        queryset=NotificationEvent.objects.all(),
        required=False,
        allow_null=True,
    )


class NotificationPreferencesSerializer(serializers.ModelSerializer):
    customer_filter = serializers.PrimaryKeyRelatedField(
        queryset=Customer.objects.all(),
        many=True,
        required=False,
    )

    class Meta:
        model = NotificationPreferences
        fields = (
            "min_severity",
            "customer_filter",
            "channels",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")

    def validate_channels(self, value):
        channels = value or {}
        return {
            "ui": bool(channels.get("ui", True)),
            "email": bool(channels.get("email", False)),
        }


class NotificationSnoozeSerializer(serializers.Serializer):
    snooze_until = serializers.DateTimeField(required=False, allow_null=True)
    minutes = serializers.IntegerField(required=False, min_value=1, max_value=24 * 60)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if attrs.get("snooze_until") is None and attrs.get("minutes") is None:
            raise serializers.ValidationError({"detail": "Specifica snooze_until oppure minutes"})
        return attrs


class PushSubscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PushSubscription
        fields = ("id", "endpoint", "p256dh", "auth", "is_active", "created_at", "updated_at")
        read_only_fields = ("id", "is_active", "created_at", "updated_at")


class PushSubscriptionUpsertSerializer(serializers.Serializer):
    endpoint = serializers.CharField()
    keys = serializers.DictField(child=serializers.CharField(), required=True)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        keys = attrs.get("keys") or {}
        if not keys.get("p256dh") or not keys.get("auth"):
            raise serializers.ValidationError({"keys": "Chiavi push mancanti (p256dh/auth)"})
        return attrs


class AlertDetailFieldConfigSerializer(serializers.ModelSerializer):
    customer_detail = CustomerSerializer(source="customer", read_only=True)

    class Meta:
        model = AlertDetailFieldConfig
        fields = (
            "id",
            "customer",
            "customer_detail",
            "source_name",
            "alert_type",
            "visible_fields",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")

    def validate_visible_fields(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("visible_fields deve essere una lista")
        normalized = []
        seen = set()
        for item in value:
            key = str(item).strip()
            if not key or key in seen:
                continue
            seen.add(key)
            normalized.append(key)
        return normalized
