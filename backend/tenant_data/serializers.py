from django.contrib.auth import get_user_model
from rest_framework import serializers

from tenant_data.models import (
    Alert,
    AlertOccurrence,
    AlertState,
    AlertTag,
    Assignment,
    Attachment,
    AuditLog,
    Comment,
    NotificationEvent,
    NotificationRead,
    SavedSearch,
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

    class Meta:
        model = Attachment
        fields = (
            "id",
            "alert",
            "filename",
            "file",
            "file_url",
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
        request = self.context.get("request")
        if not obj.file:
            return None
        if request:
            return request.build_absolute_uri(obj.file.url)
        return obj.file.url


class AlertBaseSerializer(serializers.ModelSerializer):
    is_active = serializers.SerializerMethodField()
    current_state_detail = AlertStateSerializer(source="current_state", read_only=True)
    occurrence = AlertOccurrenceSerializer(read_only=True)
    assignment = AssignmentSerializer(read_only=True)
    tags = serializers.SerializerMethodField()

    class Meta:
        model = Alert
        fields = (
            "id",
            "title",
            "severity",
            "event_timestamp",
            "source_name",
            "source_id",
            "raw_payload",
            "parsed_payload",
            "parsed_field_schema",
            "parse_error_detail",
            "current_state",
            "current_state_detail",
            "is_active",
            "dedup_fingerprint",
            "occurrence",
            "assignment",
            "tags",
            "created_at",
            "updated_at",
        )

    def get_is_active(self, obj) -> bool:
        return obj.is_active

    def get_tags(self, obj) -> list[dict]:
        alert_tags = obj.alert_tags.select_related("tag")
        return TagSerializer([item.tag for item in alert_tags], many=True).data


class AlertListSerializer(AlertBaseSerializer):
    class Meta(AlertBaseSerializer.Meta):
        fields = (
            "id",
            "title",
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
    text = serializers.CharField(required=False, allow_blank=True)
    source_name = serializers.CharField(required=False, allow_blank=True)
    state_id = serializers.IntegerField(required=False, min_value=1)
    severity = serializers.ChoiceField(choices=Alert.Severity.values, required=False)
    is_active = serializers.BooleanField(required=False)
    dynamic_filters = DynamicFilterSerializer(many=True, required=False)
    ordering = serializers.CharField(required=False, allow_blank=True, default="-event_timestamp")
    page = serializers.IntegerField(required=False, min_value=1, default=1)
    page_size = serializers.IntegerField(required=False, min_value=1, max_value=100, default=25)


class SavedSearchSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavedSearch
        fields = (
            "id",
            "name",
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


class AlertTimelineEventSerializer(serializers.Serializer):
    timestamp = serializers.DateTimeField()
    type = serializers.CharField()
    title = serializers.CharField()
    detail = serializers.JSONField(required=False)


class NotificationEventSerializer(serializers.ModelSerializer):
    alert_title = serializers.CharField(source="alert.title", read_only=True)
    is_read = serializers.SerializerMethodField()

    class Meta:
        model = NotificationEvent
        fields = (
            "id",
            "alert",
            "alert_title",
            "title",
            "message",
            "severity",
            "metadata",
            "is_active",
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
