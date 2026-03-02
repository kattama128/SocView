from rest_framework import serializers
from django.core.exceptions import ObjectDoesNotExist

from tenant_data.models import DedupPolicy, IngestionEventLog, IngestionRun, Source, SourceConfig


class SourceConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = SourceConfig
        fields = (
            "config_json",
            "poll_interval_seconds",
            "secrets_ref",
            "webhook_api_key",
            "rate_limit_per_minute",
            "last_polled_at",
            "last_success",
            "last_error",
            "status",
            "health_details",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("last_polled_at", "last_success", "last_error", "status", "health_details")


class DedupPolicySerializer(serializers.ModelSerializer):
    class Meta:
        model = DedupPolicy
        fields = ("fingerprint_fields", "strategy", "created_at", "updated_at")


class SourceSerializer(serializers.ModelSerializer):
    config = SourceConfigSerializer(required=False)
    dedup_policy = DedupPolicySerializer(required=False)
    webhook_endpoint = serializers.SerializerMethodField()
    parser_definition_id = serializers.SerializerMethodField()
    parser_definition_name = serializers.SerializerMethodField()

    class Meta:
        model = Source
        fields = (
            "id",
            "name",
            "type",
            "is_enabled",
            "severity_map",
            "config",
            "dedup_policy",
            "webhook_endpoint",
            "parser_definition_id",
            "parser_definition_name",
            "created_at",
            "updated_at",
        )

    def create(self, validated_data):
        config_data = validated_data.pop("config", {})
        dedup_data = validated_data.pop("dedup_policy", {})
        source = Source.objects.create(**validated_data)

        config_defaults = {
            "source": source,
            "config_json": config_data.get("config_json", {}),
            "poll_interval_seconds": config_data.get("poll_interval_seconds", 300),
            "secrets_ref": config_data.get("secrets_ref", ""),
            "rate_limit_per_minute": config_data.get("rate_limit_per_minute", 60),
        }
        if config_data.get("webhook_api_key"):
            config_defaults["webhook_api_key"] = config_data.get("webhook_api_key")
        SourceConfig.objects.create(**config_defaults)

        DedupPolicy.objects.create(
            source=source,
            fingerprint_fields=dedup_data.get("fingerprint_fields", []),
            strategy=dedup_data.get("strategy", DedupPolicy.Strategy.INCREMENT_OCCURRENCE),
        )

        return source

    def update(self, instance, validated_data):
        config_data = validated_data.pop("config", None)
        dedup_data = validated_data.pop("dedup_policy", None)

        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()

        if config_data is not None:
            current_config, _ = SourceConfig.objects.get_or_create(source=instance)
            SourceConfig.objects.update_or_create(
                source=instance,
                defaults={
                    "config_json": config_data.get("config_json", current_config.config_json),
                    "poll_interval_seconds": config_data.get(
                        "poll_interval_seconds",
                        current_config.poll_interval_seconds,
                    ),
                    "secrets_ref": config_data.get("secrets_ref", current_config.secrets_ref),
                    "webhook_api_key": config_data.get("webhook_api_key", current_config.webhook_api_key),
                    "rate_limit_per_minute": config_data.get(
                        "rate_limit_per_minute",
                        current_config.rate_limit_per_minute,
                    ),
                },
            )

        if dedup_data is not None:
            current_policy, _ = DedupPolicy.objects.get_or_create(source=instance)
            DedupPolicy.objects.update_or_create(
                source=instance,
                defaults={
                    "fingerprint_fields": dedup_data.get(
                        "fingerprint_fields",
                        current_policy.fingerprint_fields,
                    ),
                    "strategy": dedup_data.get("strategy", current_policy.strategy),
                },
            )

        return instance

    def get_webhook_endpoint(self, obj):
        request = self.context.get("request")
        if obj.type != Source.Type.WEBHOOK:
            return None

        path = f"/api/ingestion/webhook/{obj.id}/"
        if request:
            return request.build_absolute_uri(path)

        base = f"http://localhost"
        return f"{base}{path}"

    def get_parser_definition_id(self, obj):
        try:
            parser_definition = obj.parser_definition
        except ObjectDoesNotExist:
            parser_definition = None
        return getattr(parser_definition, "id", None)

    def get_parser_definition_name(self, obj):
        try:
            parser_definition = obj.parser_definition
        except ObjectDoesNotExist:
            parser_definition = None
        return getattr(parser_definition, "name", None)


class IngestionEventLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = IngestionEventLog
        fields = (
            "id",
            "run",
            "source",
            "alert",
            "fingerprint",
            "action",
            "parse_error",
            "error_detail",
            "raw_preview",
            "created_at",
        )


class IngestionRunSerializer(serializers.ModelSerializer):
    events = IngestionEventLogSerializer(many=True, read_only=True)

    class Meta:
        model = IngestionRun
        fields = (
            "id",
            "source",
            "trigger",
            "status",
            "started_at",
            "finished_at",
            "processed_count",
            "created_count",
            "updated_count",
            "error_count",
            "error_detail",
            "metadata",
            "events",
        )
