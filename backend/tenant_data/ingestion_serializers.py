import re

from rest_framework import serializers
from django.core.exceptions import ObjectDoesNotExist

from tenant_data.source_capabilities import is_source_type_create_enabled, source_type_capability
from tenant_data.models import (
    Customer,
    DedupPolicy,
    IngestionEventLog,
    IngestionRun,
    Source,
    SourceAlertTypeRule,
    SourceConfig,
)


class SourceConfigSerializer(serializers.ModelSerializer):
    default_error_messages = {
        "unknown_field": "Campo non supportato.",
    }

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

    def to_internal_value(self, data):
        if isinstance(data, dict):
            unknown = sorted(set(data.keys()) - set(self.fields.keys()))
            if unknown:
                raise serializers.ValidationError({field: [self.error_messages["unknown_field"]] for field in unknown})
        return super().to_internal_value(data)


class DedupPolicySerializer(serializers.ModelSerializer):
    class Meta:
        model = DedupPolicy
        fields = ("fingerprint_fields", "strategy", "created_at", "updated_at")


class SourceAlertTypeRuleSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)

    _REGEX_MAX_LENGTH = 500

    class Meta:
        model = SourceAlertTypeRule
        fields = (
            "id",
            "alert_name",
            "match_mode",
            "severity",
            "is_enabled",
            "notes",
            "received_count",
            "last_seen_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("received_count", "last_seen_at", "created_at", "updated_at")

    def validate(self, attrs):
        attrs = super().validate(attrs)
        match_mode = attrs.get("match_mode", getattr(self.instance, "match_mode", None))
        alert_name = attrs.get("alert_name", getattr(self.instance, "alert_name", None))
        if match_mode == SourceAlertTypeRule.MatchMode.REGEX and alert_name:
            if len(alert_name) > self._REGEX_MAX_LENGTH:
                raise serializers.ValidationError(
                    {"alert_name": f"Pattern regex troppo lungo (max {self._REGEX_MAX_LENGTH} caratteri)."}
                )
            try:
                re.compile(alert_name)
            except re.error as exc:
                raise serializers.ValidationError(
                    {"alert_name": f"Regex non valida: {exc}"}
                )
        return attrs


class SourceSerializer(serializers.ModelSerializer):
    customer = serializers.PrimaryKeyRelatedField(queryset=Customer.objects.all(), required=False, allow_null=True)
    customer_name = serializers.SerializerMethodField()
    config = SourceConfigSerializer(required=False)
    dedup_policy = DedupPolicySerializer(required=False)
    alert_type_rules = SourceAlertTypeRuleSerializer(many=True, required=False)
    webhook_endpoint = serializers.SerializerMethodField()
    parser_definition_id = serializers.SerializerMethodField()
    parser_definition_name = serializers.SerializerMethodField()

    _required_config_by_type = {
        Source.Type.IMAP: ("host", "user", "pass"),
        Source.Type.REST: ("url",),
        Source.Type.SYSLOG_UDP: ("listen_port",),
        Source.Type.SYSLOG_TCP: ("listen_port",),
        Source.Type.KAFKA_TOPIC: ("brokers", "topic"),
        Source.Type.S3_BUCKET: ("bucket",),
        Source.Type.AZURE_EVENT_HUB: ("namespace", "event_hub"),
        Source.Type.GCP_PUBSUB: ("project_id", "subscription"),
        Source.Type.SFTP_DROP: ("host", "user", "path"),
    }

    class Meta:
        model = Source
        validators = []
        fields = (
            "id",
            "customer",
            "customer_name",
            "name",
            "description",
            "type",
            "is_enabled",
            "severity_map",
            "schedule_cron",
            "schedule_interval_minutes",
            "config",
            "dedup_policy",
            "alert_type_rules",
            "webhook_endpoint",
            "parser_definition_id",
            "parser_definition_name",
            "created_at",
            "updated_at",
        )

    default_error_messages = {
        "unknown_field": "Campo non supportato.",
    }

    def to_internal_value(self, data):
        if isinstance(data, dict):
            unknown = sorted(set(data.keys()) - set(self.fields.keys()))
            if unknown:
                raise serializers.ValidationError({field: [self.error_messages["unknown_field"]] for field in unknown})
        return super().to_internal_value(data)

    def _validate_config_for_type(self, source_type, config_json):
        required_fields = self._required_config_by_type.get(source_type, ())
        missing = [field for field in required_fields if not config_json.get(field)]
        if missing:
            raise serializers.ValidationError(
                {"config": f"Configurazione incompleta per tipo '{source_type}'. Campi obbligatori: {', '.join(missing)}"}
            )

    def validate(self, attrs):
        attrs = super().validate(attrs)
        customer = attrs.get("customer", getattr(self.instance, "customer", None))
        source_type = attrs.get("type", getattr(self.instance, "type", None))
        source_name = attrs.get("name", getattr(self.instance, "name", None))
        config_data = attrs.get("config")
        schedule_cron = attrs.get("schedule_cron", getattr(self.instance, "schedule_cron", None))
        schedule_interval_minutes = attrs.get(
            "schedule_interval_minutes",
            getattr(self.instance, "schedule_interval_minutes", None),
        )

        if source_type:
            capability = source_type_capability(source_type)
            if capability is None:
                raise serializers.ValidationError({"type": f"Tipo fonte non riconosciuto: {source_type}"})
            if not is_source_type_create_enabled(source_type):
                if self.instance is None:
                    raise serializers.ValidationError(
                        {"type": f"Tipo fonte '{source_type}' non operativo ({capability['status']})."}
                    )
                if source_type != self.instance.type:
                    raise serializers.ValidationError(
                        {"type": f"Cambio verso tipo fonte '{source_type}' non consentito ({capability['status']})."}
                    )

        if source_name and source_type:
            duplicated = Source.objects.filter(
                customer=customer,
                name=source_name,
                type=source_type,
            )
            if self.instance:
                duplicated = duplicated.exclude(id=self.instance.id)
            if duplicated.exists():
                raise serializers.ValidationError(
                    {"name": "Esiste gia una fonte con stesso nome e tipo per questo customer scope"}
                )

        if config_data is not None:
            incoming_config_json = config_data.get("config_json")
            if incoming_config_json is not None and not isinstance(incoming_config_json, dict):
                raise serializers.ValidationError({"config": "config.config_json deve essere un oggetto"})

            merged_config_json = {}
            if self.instance is not None:
                current_config = getattr(self.instance, "config", None)
                if current_config and isinstance(current_config.config_json, dict):
                    merged_config_json = dict(current_config.config_json)

            if incoming_config_json is not None:
                merged_config_json.update(incoming_config_json)

            if source_type:
                self._validate_config_for_type(source_type, merged_config_json)

        if schedule_cron and schedule_interval_minutes:
            raise serializers.ValidationError(
                {"schedule_cron": "Impostare cron oppure intervallo minuti, non entrambi."}
            )

        if schedule_cron:
            parts = [item for item in str(schedule_cron).strip().split(" ") if item]
            if len(parts) != 5:
                raise serializers.ValidationError(
                    {"schedule_cron": "Cron expression non valida: usare 5 campi (m h dom mon dow)."}
                )

        if source_type not in {Source.Type.IMAP, Source.Type.REST} and (schedule_cron or schedule_interval_minutes):
            raise serializers.ValidationError(
                {"schedule_interval_minutes": "Scheduling automatico disponibile solo per fonti IMAP/REST."}
            )
        return attrs

    def create(self, validated_data):
        config_data = validated_data.pop("config", {})
        dedup_data = validated_data.pop("dedup_policy", {})
        alert_type_rules_data = validated_data.pop("alert_type_rules", [])
        poll_interval_seconds = int(config_data.get("poll_interval_seconds", 300) or 300)

        source_type = validated_data.get("type")
        schedule_cron = validated_data.get("schedule_cron")
        schedule_interval_minutes = validated_data.get("schedule_interval_minutes")
        if (
            source_type in {Source.Type.IMAP, Source.Type.REST}
            and not schedule_cron
            and schedule_interval_minutes is None
        ):
            validated_data["schedule_interval_minutes"] = max(1, (poll_interval_seconds + 59) // 60)

        source = Source.objects.create(**validated_data)

        config_defaults = {
            "source": source,
            "config_json": config_data.get("config_json", {}),
            "poll_interval_seconds": poll_interval_seconds,
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

        if alert_type_rules_data:
            normalized_rules = []
            for rule_data in alert_type_rules_data:
                payload = dict(rule_data)
                payload.pop("id", None)
                normalized_rules.append(payload)
            SourceAlertTypeRule.objects.bulk_create(
                [SourceAlertTypeRule(source=source, **rule_data) for rule_data in normalized_rules]
            )

        return source

    def update(self, instance, validated_data):
        config_data = validated_data.pop("config", None)
        dedup_data = validated_data.pop("dedup_policy", None)
        alert_type_rules_data = validated_data.pop("alert_type_rules", None)

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

        if alert_type_rules_data is not None:
            existing_by_id = {item.id: item for item in instance.alert_type_rules.all()}
            keep_ids = set()
            for rule_data in alert_type_rules_data:
                rule_id = rule_data.pop("id", None)
                if rule_id and rule_id in existing_by_id:
                    rule = existing_by_id[rule_id]
                    for field, value in rule_data.items():
                        setattr(rule, field, value)
                    rule.save()
                    keep_ids.add(rule.id)
                    continue
                created = SourceAlertTypeRule.objects.create(source=instance, **rule_data)
                keep_ids.add(created.id)
            stale_ids = [item_id for item_id in existing_by_id if item_id not in keep_ids]
            if stale_ids:
                SourceAlertTypeRule.objects.filter(id__in=stale_ids).delete()

        instance.refresh_from_db()
        instance._state.fields_cache.pop("config", None)
        instance._state.fields_cache.pop("dedup_policy", None)
        instance._state.fields_cache.pop("alert_type_rules", None)
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

    def get_customer_name(self, obj):
        return getattr(obj.customer, "name", None)


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
    customer = serializers.PrimaryKeyRelatedField(read_only=True)
    customer_name = serializers.SerializerMethodField()

    class Meta:
        model = IngestionRun
        fields = (
            "id",
            "customer",
            "customer_name",
            "source",
            "trigger",
            "status",
            "started_at",
            "finished_at",
            "processed_count",
            "created_count",
            "updated_count",
            "error_count",
            "error_message",
            "error_detail",
            "metadata",
            "events",
        )

    def get_customer_name(self, obj):
        return getattr(obj.customer, "name", None)


class SourceStatsSerializer(serializers.Serializer):
    last_run_at = serializers.DateTimeField(allow_null=True)
    last_run_status = serializers.ChoiceField(
        choices=(IngestionRun.Status.SUCCESS, IngestionRun.Status.ERROR, IngestionRun.Status.PARTIAL),
        allow_null=True,
    )
    runs_today = serializers.IntegerField()
    records_today = serializers.IntegerField()
    error_rate_7d = serializers.FloatField()
    avg_duration_seconds = serializers.FloatField(allow_null=True)


class SourceErrorLogSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    status = serializers.CharField()
    started_at = serializers.DateTimeField()
    finished_at = serializers.DateTimeField(allow_null=True)
    duration_seconds = serializers.FloatField(allow_null=True)
    error_message = serializers.CharField()
    error_detail = serializers.JSONField(allow_null=True)
