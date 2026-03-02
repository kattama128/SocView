from rest_framework import serializers


class TenantContextSerializer(serializers.Serializer):
    schema = serializers.CharField()
    tenant = serializers.CharField()


class TenantSerializer(serializers.Serializer):
    schema_name = serializers.CharField()
    name = serializers.CharField()
    on_trial = serializers.BooleanField()
