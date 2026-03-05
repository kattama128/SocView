from rest_framework import serializers


class AnalyticsOverviewKpiSerializer(serializers.Serializer):
    total_alerts = serializers.IntegerField()
    closure_rate = serializers.FloatField()
    mttr_hours = serializers.FloatField(allow_null=True)
    critical_alerts = serializers.IntegerField()


class AnalyticsOverviewResponseSerializer(serializers.Serializer):
    kpis = AnalyticsOverviewKpiSerializer()
    alerts_by_day = serializers.ListField(child=serializers.JSONField())
    state_distribution = serializers.ListField(child=serializers.JSONField())
    mttr_daily = serializers.ListField(child=serializers.JSONField())


class AnalyticsBySourceItemSerializer(serializers.Serializer):
    source_name = serializers.CharField()
    source_id = serializers.IntegerField(allow_null=True)
    alert_total = serializers.IntegerField()
    critical_percentage = serializers.FloatField()
    mttr_hours = serializers.FloatField(allow_null=True)
    records_ingested_total = serializers.IntegerField()


class AnalyticsByCustomerItemSerializer(serializers.Serializer):
    customer_id = serializers.IntegerField(allow_null=True)
    customer_name = serializers.CharField(allow_blank=True)
    open_alerts = serializers.IntegerField()
    sla_compliance = serializers.FloatField()
    assigned_analysts = serializers.IntegerField()


class AnalyticsHeatmapResponseSerializer(serializers.Serializer):
    matrix = serializers.ListField(child=serializers.ListField(child=serializers.IntegerField()))
