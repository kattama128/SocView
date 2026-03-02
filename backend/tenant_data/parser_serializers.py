from django.contrib.auth import get_user_model
from rest_framework import serializers

from tenant_data.ingestion.parser import ParserValidationError, parse_parser_config_text
from tenant_data.models import ParserDefinition, ParserRevision

User = get_user_model()


class ParserRevisionSerializer(serializers.ModelSerializer):
    created_by_username = serializers.SerializerMethodField()
    rollback_from_version = serializers.SerializerMethodField()

    class Meta:
        model = ParserRevision
        fields = (
            "id",
            "version",
            "config_text",
            "config_data",
            "rollback_from",
            "rollback_from_version",
            "created_by",
            "created_by_username",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_created_by_username(self, obj):
        return getattr(obj.created_by, "username", None)

    def get_rollback_from_version(self, obj):
        return getattr(obj.rollback_from, "version", None)


class ParserDefinitionSerializer(serializers.ModelSerializer):
    source_name = serializers.SerializerMethodField()
    active_revision_detail = ParserRevisionSerializer(source="active_revision", read_only=True)
    active_config_text = serializers.SerializerMethodField()
    active_config_data = serializers.SerializerMethodField()
    revisions = ParserRevisionSerializer(many=True, read_only=True)
    config_text = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = ParserDefinition
        fields = (
            "id",
            "source",
            "source_name",
            "name",
            "description",
            "is_enabled",
            "active_revision",
            "active_revision_detail",
            "active_config_text",
            "active_config_data",
            "revisions",
            "config_text",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "active_revision",
            "active_revision_detail",
            "active_config_text",
            "active_config_data",
            "revisions",
            "created_at",
            "updated_at",
        )

    def _next_version(self, parser_definition):
        latest = parser_definition.revisions.order_by("-version").first()
        return (latest.version if latest else 0) + 1

    def _create_revision(self, parser_definition, config_text, config_data, rollback_from=None):
        request = self.context.get("request")
        user = request.user if request and getattr(request, "user", None) and request.user.is_authenticated else None
        revision = ParserRevision.objects.create(
            parser_definition=parser_definition,
            version=self._next_version(parser_definition),
            config_text=config_text,
            config_data=config_data,
            rollback_from=rollback_from,
            created_by=user,
        )
        parser_definition.active_revision = revision
        parser_definition.save(update_fields=["active_revision", "updated_at"])
        return revision

    def validate(self, attrs):
        config_text = attrs.get("config_text")
        if self.instance is None and not config_text:
            raise serializers.ValidationError({"config_text": "config_text obbligatorio in creazione"})

        if config_text:
            try:
                attrs["_config_data"] = parse_parser_config_text(config_text)
            except ParserValidationError as exc:
                raise serializers.ValidationError({"config_text": exc.errors}) from exc
        return attrs

    def create(self, validated_data):
        config_text = validated_data.pop("config_text")
        config_data = validated_data.pop("_config_data")
        parser_definition = ParserDefinition.objects.create(**validated_data)
        self._create_revision(parser_definition, config_text=config_text, config_data=config_data)
        return parser_definition

    def update(self, instance, validated_data):
        config_text = validated_data.pop("config_text", None)
        config_data = validated_data.pop("_config_data", None)

        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()

        if config_text:
            active = instance.active_revision
            if not active or active.config_text.strip() != config_text.strip():
                self._create_revision(instance, config_text=config_text, config_data=config_data)
        return instance

    def get_source_name(self, obj):
        return getattr(obj.source, "name", None)

    def get_active_config_text(self, obj):
        return obj.active_revision.config_text if obj.active_revision else ""

    def get_active_config_data(self, obj):
        return obj.active_revision.config_data if obj.active_revision else {}
