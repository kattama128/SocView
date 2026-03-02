from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import RequestFactory
from django.utils import timezone
from django_tenants.test.cases import TenantTestCase
from rest_framework.test import APIClient

from tenant_data.audit import create_audit_log
from tenant_data.ingestion.service import run_ingestion_for_source
from tenant_data.models import (
    Alert,
    AlertOccurrence,
    AlertState,
    AlertTag,
    DedupPolicy,
    IngestionEventLog,
    IngestionRun,
    Source,
    SourceConfig,
    Tag,
)


class BaseTenantTestCase(TenantTestCase):
    @classmethod
    def setup_tenant(cls, tenant):
        tenant.name = "Test Tenant"
        tenant.paid_until = timezone.now().date() + timedelta(days=30)
        tenant.on_trial = True
        return tenant

    @classmethod
    def setup_domain(cls, domain):
        domain.domain = "test.localhost"
        domain.is_primary = True
        return domain


class AlertModelTests(BaseTenantTestCase):
    def test_is_active_derived_from_state(self):
        open_state = AlertState.objects.create(name="Nuovo", order=0, is_final=False, is_enabled=True)
        final_state = AlertState.objects.create(name="Risolto", order=1, is_final=True, is_enabled=True)

        active_alert = Alert.objects.create(
            title="Alert attivo",
            severity="high",
            event_timestamp=timezone.now(),
            source_name="unit-test",
            source_id="a1",
            current_state=open_state,
            dedup_fingerprint="test-active",
        )
        closed_alert = Alert.objects.create(
            title="Alert chiuso",
            severity="low",
            event_timestamp=timezone.now(),
            source_name="unit-test",
            source_id="a2",
            current_state=final_state,
            dedup_fingerprint="test-closed",
        )

        self.assertTrue(active_alert.is_active)
        self.assertFalse(closed_alert.is_active)


class AuditLogTests(BaseTenantTestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="audit-user",
            password="Audit123!",
            role="SOC_ANALYST",
        )
        state = AlertState.objects.create(name="In lavorazione", order=0, is_final=False, is_enabled=True)
        self.alert = Alert.objects.create(
            title="Alert audit",
            severity="medium",
            event_timestamp=timezone.now(),
            source_name="audit-source",
            source_id="audit-1",
            current_state=state,
            dedup_fingerprint="audit-fingerprint",
        )

    def test_create_audit_log_persists_context(self):
        request = RequestFactory().post("/api/alerts/alerts/1/change-state/")
        request.user = self.user
        request.META["REMOTE_ADDR"] = "127.0.0.1"
        request.META["HTTP_USER_AGENT"] = "pytest-agent"

        entry = create_audit_log(
            request,
            action="alert.state_changed",
            obj=self.alert,
            alert=self.alert,
            diff={"old_state": "Nuovo", "new_state": "In lavorazione"},
        )

        self.assertEqual(entry.actor_id, self.user.id)
        self.assertEqual(entry.alert_id, self.alert.id)
        self.assertEqual(entry.ip_address, "127.0.0.1")
        self.assertEqual(entry.user_agent, "pytest-agent")
        self.assertEqual(entry.action, "alert.state_changed")


class IngestionServiceTests(BaseTenantTestCase):
    def setUp(self):
        self.state = AlertState.objects.create(name="Nuovo", order=0, is_final=False, is_enabled=True)
        self.rest_source = Source.objects.create(
            name="REST Test Source",
            type=Source.Type.REST,
            is_enabled=True,
            severity_map={"field": "severity", "default": "medium", "map": {}},
        )
        SourceConfig.objects.create(
            source=self.rest_source,
            poll_interval_seconds=60,
            config_json={
                "use_mock": True,
                "mock_events": [
                    {
                        "event_id": "dup-1",
                        "title": "Evento duplicato",
                        "severity": "high",
                        "timestamp": "2026-01-10T10:00:00Z",
                    },
                    {
                        "event_id": "dup-1",
                        "title": "Evento duplicato",
                        "severity": "high",
                        "timestamp": "2026-01-10T10:05:00Z",
                    },
                ],
            },
        )
        DedupPolicy.objects.create(
            source=self.rest_source,
            fingerprint_fields=["event_id"],
            strategy=DedupPolicy.Strategy.INCREMENT_OCCURRENCE,
        )

    def test_dedup_increments_occurrences(self):
        run = run_ingestion_for_source(self.rest_source, trigger=IngestionRun.Trigger.MANUAL)
        self.assertEqual(run.status, IngestionRun.Status.SUCCESS)
        self.assertEqual(run.processed_count, 2)
        self.assertEqual(run.created_count, 1)
        self.assertEqual(run.updated_count, 1)
        self.assertEqual(run.error_count, 0)

        alert = Alert.objects.get(source_name=self.rest_source.name)
        occurrence = AlertOccurrence.objects.get(alert=alert)
        self.assertEqual(occurrence.count, 2)
        self.assertEqual(alert.severity, "high")
        self.assertEqual(alert.source_id, "dup-1")

        config = SourceConfig.objects.get(source=self.rest_source)
        self.assertIsNotNone(config.last_success)
        self.assertEqual(config.status, SourceConfig.Status.HEALTHY)

    def test_parse_failure_still_creates_alert_with_unparsed_tag(self):
        self.rest_source.config.config_json = {
            "use_mock": True,
            "mock_events": [
                {
                    "event_id": "parse-1",
                    "title": "Evento parse failure",
                    "severity": "medium",
                    "force_parse_error": True,
                    "parse_error_message": "errore parser test",
                }
            ],
        }
        self.rest_source.config.save(update_fields=["config_json", "updated_at"])

        run = run_ingestion_for_source(self.rest_source, trigger=IngestionRun.Trigger.MANUAL)
        self.assertEqual(run.status, IngestionRun.Status.SUCCESS)
        self.assertEqual(run.created_count, 1)

        alert = Alert.objects.get(source_name=self.rest_source.name, source_id="parse-1")
        self.assertEqual(alert.parsed_payload.get("_parse_error"), "errore parser test")

        tag = Tag.objects.get(name="#unparsed", scope=Tag.Scope.ALERT)
        self.assertTrue(AlertTag.objects.filter(alert=alert, tag=tag).exists())
        self.assertTrue(
            IngestionEventLog.objects.filter(
                run=run,
                alert=alert,
                parse_error__icontains="errore parser test",
            ).exists()
        )


class WebhookIngestionTests(BaseTenantTestCase):
    def setUp(self):
        self.client = APIClient()
        AlertState.objects.create(name="Nuovo", order=0, is_final=False, is_enabled=True)
        self.source = Source.objects.create(
            name="Webhook Test Source",
            type=Source.Type.WEBHOOK,
            is_enabled=True,
            severity_map={"field": "severity", "default": "medium", "map": {}},
        )
        self.config = SourceConfig.objects.create(
            source=self.source,
            poll_interval_seconds=300,
            rate_limit_per_minute=30,
            config_json={"example": "test"},
        )
        DedupPolicy.objects.create(
            source=self.source,
            fingerprint_fields=["event_id"],
            strategy=DedupPolicy.Strategy.INCREMENT_OCCURRENCE,
        )

    def test_webhook_push_creates_and_updates_occurrence(self):
        payload = {
            "event_id": "wh-1",
            "title": "Webhook evento",
            "severity": "critical",
            "timestamp": "2026-01-10T11:00:00Z",
        }
        url = f"/api/ingestion/webhook/{self.source.id}/"

        response_1 = self.client.post(
            url,
            data=payload,
            format="json",
            HTTP_HOST="test.localhost",
            HTTP_X_API_KEY=self.config.webhook_api_key,
        )
        self.assertEqual(response_1.status_code, 202)

        response_2 = self.client.post(
            url,
            data=payload,
            format="json",
            HTTP_HOST="test.localhost",
            HTTP_X_API_KEY=self.config.webhook_api_key,
        )
        self.assertEqual(response_2.status_code, 202)

        alert = Alert.objects.get(source_name=self.source.name, source_id="wh-1")
        occurrence = AlertOccurrence.objects.get(alert=alert)
        self.assertEqual(occurrence.count, 2)
        self.assertEqual(alert.severity, "critical")

    def test_webhook_rejects_invalid_key(self):
        url = f"/api/ingestion/webhook/{self.source.id}/"
        response = self.client.post(
            url,
            data={"event_id": "bad-key"},
            format="json",
            HTTP_HOST="test.localhost",
            HTTP_X_API_KEY="invalid",
        )
        self.assertEqual(response.status_code, 403)
