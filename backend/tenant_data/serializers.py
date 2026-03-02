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
