from datetime import timedelta
import json

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import RequestFactory, override_settings
from django.utils.dateparse import parse_datetime
from django.utils import timezone
from django_tenants.test.cases import TenantTestCase
from rest_framework.test import APIClient

from accounts.models import SecurityAuditEvent
from tenant_data.audit import create_audit_log
from tenant_data.ingestion.parser import ParserValidationError, parse_event, parse_parser_config_text
from tenant_data.ingestion.service import run_ingestion_for_source, test_source_connection
from tenant_data.models import (
    Alert,
    AlertOccurrence,
    AlertState,
    AlertTag,
    Assignment,
    Attachment,
    Customer,
    CustomerMembership,
    CustomerSettings,
    CustomerSourcePreference,
    DedupPolicy,
    IngestionEventLog,
    IngestionRun,
    NotificationEvent,
    NotificationPreferences,
    ParserDefinition,
    ParserRevision,
    ParserTestCase,
    PushSubscription,
    SLAConfig,
    Source,
    SourceAlertTypeRule,
    SourceConfig,
    Tag,
)
from tenant_data.tasks import extract_iocs_task
from tenant_data.tasks import unsnooze_notifications_task


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
        self.manager = get_user_model().objects.create_user(
            username="manager-test",
            password="Manager123!",
            role="SOC_MANAGER",
        )
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

    def test_internal_mock_rest_endpoint_is_processed_without_http_auth(self):
        self.rest_source.config.config_json = {
            "url": "http://backend:8000/api/ingestion/mock/rest-events/",
            "method": "GET",
            "headers": {},
            "pagination": {"type": "none"},
        }
        self.rest_source.config.save(update_fields=["config_json", "updated_at"])

        run = run_ingestion_for_source(self.rest_source, trigger=IngestionRun.Trigger.MANUAL)
        self.assertEqual(run.status, IngestionRun.Status.SUCCESS)
        self.assertEqual(run.processed_count, 2)
        self.assertEqual(run.created_count, 2)
        self.assertEqual(run.error_count, 0)

        self.assertTrue(Alert.objects.filter(source_name=self.rest_source.name, source_id="rest-demo-1").exists())
        self.assertTrue(Alert.objects.filter(source_name=self.rest_source.name, source_id="rest-demo-2").exists())

    def test_internal_mock_rest_connection_returns_ok(self):
        self.rest_source.config.config_json = {
            "url": "http://backend:8000/api/ingestion/mock/rest-events/",
            "method": "GET",
            "headers": {},
        }
        self.rest_source.config.save(update_fields=["config_json", "updated_at"])

        result = test_source_connection(self.rest_source)
        self.assertTrue(result.get("ok"))
        self.assertIn("Mock REST endpoint interno", result.get("detail", ""))

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
        self.assertIsNone(alert.parsed_payload)
        self.assertIn("errore parser test", alert.parse_error_detail)

        tag = Tag.objects.get(name="#unparsed", scope=Tag.Scope.ALERT)
        self.assertTrue(AlertTag.objects.filter(alert=alert, tag=tag).exists())
        self.assertTrue(
            IngestionEventLog.objects.filter(
                run=run,
                alert=alert,
                parse_error__icontains="errore parser test",
            ).exists()
        )

    def test_configured_parser_populates_parsed_payload_and_field_schema(self):
        parser_definition = ParserDefinition.objects.create(
            source=self.rest_source,
            name="REST Parser",
            description="Parser test",
            is_enabled=True,
        )
        parser_config = {
            "extract": [
                {"type": "jsonpath", "name": "event_id", "path": "$.event_id"},
                {"type": "jsonpath", "name": "severity", "path": "$.severity"},
                {"type": "jsonpath", "name": "title", "path": "$.title"},
            ],
            "transform": [{"type": "concat", "target": "summary", "fields": ["title", "event_id"], "separator": " :: "}],
            "normalize": {
                "ecs": {
                    "event.id": "event_id",
                    "event.severity": "severity",
                    "event.summary": "summary",
                }
            },
            "output": {"mode": "normalized"},
        }
        revision = ParserRevision.objects.create(
            parser_definition=parser_definition,
            version=1,
            config_text=json.dumps(parser_config),
            config_data=parser_config,
            created_by=self.manager,
        )
        parser_definition.active_revision = revision
        parser_definition.save(update_fields=["active_revision", "updated_at"])

        run = run_ingestion_for_source(self.rest_source, trigger=IngestionRun.Trigger.MANUAL)
        self.assertEqual(run.status, IngestionRun.Status.SUCCESS)

        alert = Alert.objects.get(source_name=self.rest_source.name, source_id="dup-1")
        self.assertEqual(alert.parse_error_detail, "")
        self.assertIsInstance(alert.parsed_payload, dict)
        self.assertEqual(alert.parsed_payload.get("event", {}).get("id"), "dup-1")
        self.assertTrue(any(item.get("field") == "event.id" for item in alert.parsed_field_schema))

    def test_broken_parser_generates_unparsed_tag(self):
        self.rest_source.config.config_json = {
            "use_mock": True,
            "mock_events": [
                {
                    "event_id": "broken-parser-1",
                    "title": "not-an-int",
                    "severity": "low",
                    "timestamp": "2026-01-10T10:00:00Z",
                }
            ],
        }
        self.rest_source.config.save(update_fields=["config_json", "updated_at"])

        parser_definition = ParserDefinition.objects.create(
            source=self.rest_source,
            name="Broken Parser",
            description="Broken cast parser",
            is_enabled=True,
        )
        broken_config = {
            "extract": [
                {"type": "jsonpath", "name": "event_id", "path": "$.event_id"},
                {"type": "jsonpath", "name": "title", "path": "$.title"},
            ],
            "transform": [{"type": "cast", "field": "title", "to": "int"}],
            "normalize": {"ecs": {"event.id": "event_id", "event.code": "title"}},
            "output": {"mode": "normalized"},
        }
        revision = ParserRevision.objects.create(
            parser_definition=parser_definition,
            version=1,
            config_text=json.dumps(broken_config),
            config_data=broken_config,
            created_by=self.manager,
        )
        parser_definition.active_revision = revision
        parser_definition.save(update_fields=["active_revision", "updated_at"])

        run = run_ingestion_for_source(self.rest_source, trigger=IngestionRun.Trigger.MANUAL)
        self.assertEqual(run.status, IngestionRun.Status.SUCCESS)
        alert = Alert.objects.get(source_name=self.rest_source.name, source_id="broken-parser-1")
        self.assertIsNone(alert.parsed_payload)
        self.assertNotEqual(alert.parse_error_detail, "")
        tag = Tag.objects.get(name="#unparsed", scope=Tag.Scope.ALERT)
        self.assertTrue(AlertTag.objects.filter(alert=alert, tag=tag).exists())
        self.assertTrue(IngestionEventLog.objects.filter(run=run, alert=alert, parse_error__gt="").exists())

    def test_alert_type_rule_overrides_severity_and_updates_catalog_counters(self):
        SourceAlertTypeRule.objects.create(
            source=self.rest_source,
            alert_name="Evento duplicato",
            match_mode=SourceAlertTypeRule.MatchMode.EXACT,
            severity=Alert.Severity.CRITICAL,
            is_enabled=True,
        )

        run = run_ingestion_for_source(self.rest_source, trigger=IngestionRun.Trigger.MANUAL)
        self.assertEqual(run.status, IngestionRun.Status.SUCCESS)

        alert = Alert.objects.get(source_name=self.rest_source.name, source_id="dup-1")
        self.assertEqual(alert.severity, Alert.Severity.CRITICAL)

        rule = SourceAlertTypeRule.objects.get(
            source=self.rest_source,
            alert_name="Evento duplicato",
            match_mode=SourceAlertTypeRule.MatchMode.EXACT,
        )
        self.assertEqual(rule.received_count, 2)
        self.assertIsNotNone(rule.last_seen_at)

    def test_ingestion_auto_censuses_new_alert_type_rule_when_missing(self):
        SourceAlertTypeRule.objects.filter(source=self.rest_source).delete()
        run = run_ingestion_for_source(self.rest_source, trigger=IngestionRun.Trigger.MANUAL)
        self.assertEqual(run.status, IngestionRun.Status.SUCCESS)

        rule = SourceAlertTypeRule.objects.get(
            source=self.rest_source,
            alert_name="Evento duplicato",
            match_mode=SourceAlertTypeRule.MatchMode.EXACT,
        )
        self.assertEqual(rule.severity, Alert.Severity.HIGH)
        self.assertEqual(rule.received_count, 2)
        self.assertIsNotNone(rule.last_seen_at)


class SourceApiTests(BaseTenantTestCase):
    def setUp(self):
        self.client = APIClient()
        self.manager = get_user_model().objects.create_user(
            username="source-manager",
            password="Manager123!",
            role="SOC_MANAGER",
        )
        self.client.force_authenticate(user=self.manager)

    def _create_source(self, source_type="rest", config_json=None):
        if config_json is None:
            config_json = {"url": "https://collector.example/api/events", "method": "GET"}
        return self.client.post(
            "/api/ingestion/sources/",
            data={
                "name": f"Source {source_type}",
                "description": "Source test",
                "type": source_type,
                "is_enabled": True,
                "severity_map": {"field": "severity", "default": "medium", "map": {}},
                "config": {
                    "config_json": config_json,
                    "poll_interval_seconds": 300,
                    "rate_limit_per_minute": 90,
                },
                "dedup_policy": {
                    "fingerprint_fields": ["event_id"],
                    "strategy": "increment_occurrence",
                },
            },
            format="json",
            HTTP_HOST="test.localhost",
        )

    def test_create_and_patch_source_return_updated_nested_state(self):
        create_response = self.client.post(
            "/api/ingestion/sources/",
            data={
                "name": "Global REST Source",
                "description": "Source globale API-driven",
                "type": "rest",
                "is_enabled": True,
                "severity_map": {"field": "severity", "default": "medium", "map": {"critical": "critical"}},
                "config": {
                    "config_json": {"url": "https://collector.example/api/events", "method": "GET"},
                    "poll_interval_seconds": 300,
                    "rate_limit_per_minute": 90,
                },
                "dedup_policy": {
                    "fingerprint_fields": ["event_id"],
                    "strategy": "increment_occurrence",
                },
                "alert_type_rules": [
                    {
                        "alert_name": "Suspicious login",
                        "match_mode": "contains",
                        "severity": "high",
                        "is_enabled": True,
                        "notes": "Rule v1",
                    }
                ],
            },
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(create_response.status_code, 201, create_response.data)
        source_id = create_response.data["id"]
        self.assertEqual(create_response.data["description"], "Source globale API-driven")
        self.assertEqual(create_response.data["config"]["poll_interval_seconds"], 300)
        self.assertEqual(create_response.data["alert_type_rules"][0]["alert_name"], "Suspicious login")
        self.assertEqual(create_response.data["alert_type_rules"][0]["severity"], "high")

        existing_rule_id = create_response.data["alert_type_rules"][0]["id"]
        patch_response = self.client.patch(
            f"/api/ingestion/sources/{source_id}/",
            data={
                "description": "Descrizione aggiornata",
                "config": {
                    "config_json": {"url": "https://collector.example/api/v2/events", "method": "GET"},
                    "poll_interval_seconds": 120,
                    "rate_limit_per_minute": 45,
                },
                "alert_type_rules": [
                    {
                        "id": existing_rule_id,
                        "alert_name": "Suspicious login",
                        "match_mode": "contains",
                        "severity": "critical",
                        "is_enabled": True,
                        "notes": "Rule v2",
                    },
                    {
                        "alert_name": "Impossible travel",
                        "match_mode": "exact",
                        "severity": "high",
                        "is_enabled": True,
                        "notes": "",
                    },
                ],
            },
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(patch_response.status_code, 200)
        self.assertEqual(patch_response.data["description"], "Descrizione aggiornata")
        self.assertEqual(patch_response.data["config"]["poll_interval_seconds"], 120)
        self.assertEqual(patch_response.data["config"]["rate_limit_per_minute"], 45)
        self.assertEqual(len(patch_response.data["alert_type_rules"]), 2)

        rules_by_name = {item["alert_name"]: item for item in patch_response.data["alert_type_rules"]}
        self.assertEqual(rules_by_name["Suspicious login"]["severity"], "critical")
        self.assertEqual(rules_by_name["Impossible travel"]["severity"], "high")

        source = Source.objects.get(id=source_id)
        self.assertEqual(source.description, "Descrizione aggiornata")
        self.assertEqual(source.config.poll_interval_seconds, 120)
        self.assertEqual(source.config.rate_limit_per_minute, 45)
        self.assertEqual(source.alert_type_rules.count(), 2)

    def test_patch_rejects_unknown_top_level_fields(self):
        create_response = self._create_source()
        self.assertEqual(create_response.status_code, 201, create_response.data)
        source_id = create_response.data["id"]

        source = Source.objects.get(id=source_id)
        updated_at_before = source.updated_at

        patch_response = self.client.patch(
            f"/api/ingestion/sources/{source_id}/",
            data={"x_unknown": 123},
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(patch_response.status_code, 400)
        self.assertIn("x_unknown", patch_response.data)

        source.refresh_from_db()
        self.assertEqual(source.updated_at, updated_at_before)

    def test_patch_partial_config_keeps_existing_required_fields(self):
        create_response = self._create_source(
            source_type="imap",
            config_json={
                "host": "imap.example.com",
                "port": 993,
                "user": "soc@example.com",
                "pass": "secret",
                "tls": True,
            },
        )
        self.assertEqual(create_response.status_code, 201, create_response.data)
        source_id = create_response.data["id"]

        patch_response = self.client.patch(
            f"/api/ingestion/sources/{source_id}/",
            data={
                "config": {
                    "poll_interval_seconds": 321,
                }
            },
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(patch_response.status_code, 200, patch_response.data)
        self.assertEqual(patch_response.data["config"]["poll_interval_seconds"], 321)
        self.assertEqual(patch_response.data["config"]["config_json"]["host"], "imap.example.com")
        self.assertEqual(patch_response.data["config"]["config_json"]["user"], "soc@example.com")

    def test_capabilities_endpoint_exposes_operational_matrix(self):
        response = self.client.get("/api/ingestion/sources/capabilities/", HTTP_HOST="test.localhost")
        self.assertEqual(response.status_code, 200)
        matrix_by_type = {item["type"]: item for item in response.data["types"]}

        self.assertEqual(matrix_by_type["imap"]["status"], "ga")
        self.assertTrue(matrix_by_type["imap"]["create_enabled"])
        self.assertEqual(matrix_by_type["rest"]["status"], "ga")
        self.assertTrue(matrix_by_type["rest"]["create_enabled"])
        self.assertEqual(matrix_by_type["webhook"]["status"], "ga")
        self.assertTrue(matrix_by_type["webhook"]["create_enabled"])

        self.assertEqual(matrix_by_type["syslog_udp"]["status"], "planned")
        self.assertFalse(matrix_by_type["syslog_udp"]["create_enabled"])
        self.assertEqual(matrix_by_type["kafka_topic"]["status"], "planned")
        self.assertFalse(matrix_by_type["kafka_topic"]["create_enabled"])

        preset_keys = {item["key"] for item in response.data["presets"]}
        self.assertIn("canary_tools_rest", preset_keys)
        self.assertIn("sentinelone_rest", preset_keys)

    def test_reject_create_for_planned_source_type(self):
        response = self.client.post(
            "/api/ingestion/sources/",
            data={
                "name": "Syslog Planned",
                "description": "non operativo",
                "type": "syslog_udp",
                "is_enabled": True,
                "severity_map": {"field": "severity", "default": "medium", "map": {}},
                "config": {
                    "config_json": {"listen_port": 5514},
                    "poll_interval_seconds": 60,
                    "rate_limit_per_minute": 60,
                },
                "dedup_policy": {
                    "fingerprint_fields": ["event_id"],
                    "strategy": "increment_occurrence",
                },
            },
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("non operativo", str(response.data))

    def test_create_from_canary_preset_creates_rest_source_and_parser(self):
        response = self.client.post(
            "/api/ingestion/sources/create-from-preset/",
            data={"preset_key": "canary_tools_rest"},
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["type"], "rest")
        self.assertIn("Canary Tools", response.data["name"])

        source = Source.objects.get(id=response.data["id"])
        self.assertEqual(source.type, Source.Type.REST)
        self.assertEqual(source.config.config_json.get("vendor"), "canary_tools")
        parser_definition = ParserDefinition.objects.get(source=source)
        self.assertTrue(parser_definition.is_enabled)
        self.assertIsNotNone(parser_definition.active_revision)
        self.assertIn("event.id", parser_definition.active_revision.config_text)

    def test_create_from_sentinel_preset_creates_rest_source_and_parser(self):
        response = self.client.post(
            "/api/ingestion/sources/create-from-preset/",
            data={"preset_key": "sentinelone_rest"},
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["type"], "rest")
        self.assertIn("SentinelOne", response.data["name"])

        source = Source.objects.get(id=response.data["id"])
        self.assertEqual(source.config.config_json.get("vendor"), "sentinelone")
        parser_definition = ParserDefinition.objects.get(source=source)
        self.assertIsNotNone(parser_definition.active_revision)
        self.assertIn("host.name", parser_definition.active_revision.config_text)

    def _create_run(
        self,
        source,
        *,
        status,
        started_at,
        finished_at,
        processed_count,
        error_message="",
        error_detail=None,
    ):
        run = IngestionRun.objects.create(
            source=source,
            status=status,
            trigger=IngestionRun.Trigger.MANUAL,
            processed_count=processed_count,
            created_count=0,
            updated_count=0,
            error_count=1 if status == IngestionRun.Status.ERROR else 0,
            error_message=error_message,
            error_detail=error_detail,
        )
        IngestionRun.objects.filter(id=run.id).update(started_at=started_at, finished_at=finished_at)
        run.refresh_from_db()
        return run

    def test_source_stats_endpoint_returns_aggregated_metrics(self):
        create_response = self._create_source(source_type="rest")
        self.assertEqual(create_response.status_code, 201, create_response.data)
        source = Source.objects.get(id=create_response.data["id"])

        now = timezone.now()
        self._create_run(
            source,
            status=IngestionRun.Status.SUCCESS,
            started_at=now - timedelta(hours=2),
            finished_at=now - timedelta(hours=1, minutes=30),
            processed_count=100,
        )
        latest_error = self._create_run(
            source,
            status=IngestionRun.Status.ERROR,
            started_at=now - timedelta(hours=1),
            finished_at=now - timedelta(minutes=50),
            processed_count=10,
            error_message="HTTP 500 upstream",
            error_detail={"stack": "Traceback..."},
        )
        self._create_run(
            source,
            status=IngestionRun.Status.PARTIAL,
            started_at=now - timedelta(days=2, minutes=5),
            finished_at=now - timedelta(days=2),
            processed_count=60,
        )
        self._create_run(
            source,
            status=IngestionRun.Status.ERROR,
            started_at=now - timedelta(days=8),
            finished_at=now - timedelta(days=8, minutes=-10),
            processed_count=5,
            error_message="Too old for 7d window",
            error_detail={"kind": "old"},
        )

        response = self.client.get(
            f"/api/ingestion/sources/{source.id}/stats/",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["last_run_status"], IngestionRun.Status.ERROR)
        self.assertEqual(parse_datetime(response.data["last_run_at"]), latest_error.started_at)
        self.assertEqual(response.data["runs_today"], 2)
        self.assertEqual(response.data["records_today"], 110)
        self.assertAlmostEqual(response.data["error_rate_7d"], 0.3333, places=4)
        self.assertAlmostEqual(response.data["avg_duration_seconds"], 1200.0, places=2)

    def test_source_error_log_endpoint_returns_latest_20_error_runs(self):
        create_response = self._create_source(source_type="rest")
        self.assertEqual(create_response.status_code, 201, create_response.data)
        source = Source.objects.get(id=create_response.data["id"])

        now = timezone.now()
        created_ids = []
        for index in range(25):
            run = self._create_run(
                source,
                status=IngestionRun.Status.ERROR,
                started_at=now - timedelta(minutes=index),
                finished_at=now - timedelta(minutes=index - 1),
                processed_count=0,
                error_message=f"Errore #{index}",
                error_detail={"line": index, "message": "stack trace"},
            )
            created_ids.append(run.id)

        self._create_run(
            source,
            status=IngestionRun.Status.SUCCESS,
            started_at=now - timedelta(days=1),
            finished_at=now - timedelta(days=1, minutes=-2),
            processed_count=22,
        )

        response = self.client.get(
            f"/api/ingestion/sources/{source.id}/error-log/",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(len(response.data), 20)
        self.assertTrue(all(item["status"] == IngestionRun.Status.ERROR for item in response.data))
        self.assertEqual(response.data[0]["id"], created_ids[0])
        self.assertEqual(response.data[0]["error_message"], "Errore #0")
        self.assertEqual(response.data[0]["error_detail"]["line"], 0)


class CustomerSettingsApiTests(BaseTenantTestCase):
    def setUp(self):
        self.client = APIClient()
        self.manager = get_user_model().objects.create_user(
            username="cust-settings-manager",
            password="Manager123!",
            role="SOC_MANAGER",
        )
        self.client.force_authenticate(user=self.manager)
        self.customer = Customer.objects.create(name="Customer Settings A", code="csa")
        self.global_source_a = Source.objects.create(
            name="Global EDR Feed",
            type=Source.Type.REST,
            is_enabled=True,
            severity_map={"field": "severity", "default": "medium", "map": {}},
        )
        self.global_source_b = Source.objects.create(
            name="Global Mail Feed",
            type=Source.Type.IMAP,
            is_enabled=True,
            severity_map={"field": "severity", "default": "medium", "map": {}},
        )

    def test_get_customer_settings_returns_defaults_and_global_sources(self):
        response = self.client.get(
            f"/api/alerts/customers/{self.customer.id}/settings/",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["customer"]["id"], self.customer.id)
        self.assertEqual(response.data["settings"]["tier"], "Gold")
        self.assertEqual(len(response.data["sources"]), 2)
        source_ids = {item["source_id"] for item in response.data["sources"]}
        self.assertEqual(source_ids, {self.global_source_a.id, self.global_source_b.id})
        self.assertTrue(all(item["customer_enabled"] for item in response.data["sources"]))

    def test_patch_customer_settings_persists_and_applies_source_override(self):
        patch_response = self.client.patch(
            f"/api/alerts/customers/{self.customer.id}/settings/",
            data={
                "settings": {
                    "tier": "Platinum",
                    "contact_email": "soc-customer-a@example.com",
                    "retention_days": 730,
                },
                "source_overrides": [
                    {"source_id": self.global_source_a.id, "is_enabled": False},
                ],
            },
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(patch_response.status_code, 200, patch_response.data)
        self.assertEqual(patch_response.data["settings"]["tier"], "Platinum")
        self.assertEqual(patch_response.data["settings"]["retention_days"], 730)

        by_source = {item["source_id"]: item for item in patch_response.data["sources"]}
        self.assertFalse(by_source[self.global_source_a.id]["customer_enabled"])
        self.assertTrue(by_source[self.global_source_b.id]["customer_enabled"])

        settings = CustomerSettings.objects.get(customer=self.customer)
        self.assertEqual(settings.tier, "Platinum")
        self.assertEqual(settings.contact_email, "soc-customer-a@example.com")
        self.assertEqual(settings.retention_days, 730)

        pref = CustomerSourcePreference.objects.get(customer=self.customer, source=self.global_source_a)
        self.assertFalse(pref.is_enabled)

        reload_response = self.client.get(
            f"/api/alerts/customers/{self.customer.id}/settings/",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(reload_response.status_code, 200)
        reloaded_by_source = {item["source_id"]: item for item in reload_response.data["sources"]}
        self.assertFalse(reloaded_by_source[self.global_source_a.id]["customer_enabled"])


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


class ParserEngineTests(BaseTenantTestCase):
    def test_parser_pipeline_extract_transform_normalize_output(self):
        config = {
            "extract": [
                {"type": "jsonpath", "name": "event_id", "path": "$.id"},
                {"type": "jsonpath", "name": "message", "path": "$.message"},
                {"type": "grok", "source": "message", "pattern": "user=%{WORD:user} ip=%{IPV4:ip}"},
            ],
            "transform": [{"type": "concat", "target": "summary", "fields": ["user", "ip"], "separator": "@"}],
            "normalize": {"ecs": {"event.id": "event_id", "user.name": "user", "source.ip": "ip", "event.summary": "summary"}},
            "output": {"mode": "normalized"},
        }
        payload = {"id": "evt-1", "message": "user=alice ip=192.168.1.22"}

        result = parse_event(payload, parser_config=config)
        self.assertEqual(result.parsed_payload.get("event", {}).get("id"), "evt-1")
        self.assertEqual(result.parsed_payload.get("user", {}).get("name"), "alice")
        self.assertEqual(result.parsed_payload.get("source", {}).get("ip"), "192.168.1.22")
        self.assertTrue(any(item.get("field") == "event.id" for item in result.field_schema))

    def test_invalid_parser_config_raises_clear_error(self):
        broken = {"extract": [{"type": "unknown"}]}
        with self.assertRaises(ParserValidationError):
            parse_parser_config_text(json.dumps(broken))


class ParserApiTests(BaseTenantTestCase):
    def setUp(self):
        self.client = APIClient()
        self.manager = get_user_model().objects.create_user(
            username="parser-manager",
            password="Manager123!",
            role="SOC_MANAGER",
        )
        self.client.force_authenticate(user=self.manager)
        self.source = Source.objects.create(
            name="Parser API Source",
            type=Source.Type.REST,
            is_enabled=True,
            severity_map={"field": "severity", "default": "medium", "map": {}},
        )
        SourceConfig.objects.create(source=self.source, config_json={"use_mock": True, "mock_events": []})
        DedupPolicy.objects.create(source=self.source, fingerprint_fields=["event_id"])
        self.config_v1 = {
            "extract": [
                {"type": "jsonpath", "name": "event_id", "path": "$.event_id"},
                {"type": "jsonpath", "name": "severity", "path": "$.severity"},
            ],
            "transform": [],
            "normalize": {"ecs": {"event.id": "event_id", "event.severity": "severity"}},
            "output": {"mode": "normalized"},
        }
        self.config_v2 = {
            "extract": [
                {"type": "jsonpath", "name": "event_id", "path": "$.event_id"},
                {"type": "jsonpath", "name": "severity", "path": "$.severity"},
                {"type": "jsonpath", "name": "message", "path": "$.message"},
            ],
            "transform": [{"type": "concat", "target": "summary", "fields": ["event_id", "message"], "separator": " -> "}],
            "normalize": {"ecs": {"event.id": "event_id", "event.severity": "severity", "event.summary": "summary"}},
            "output": {"mode": "normalized"},
        }

    def test_create_preview_update_and_rollback_parser(self):
        create_response = self.client.post(
            "/api/ingestion/parsers/",
            data={
                "source": self.source.id,
                "name": "Parser API",
                "description": "Parser test",
                "is_enabled": True,
                "config_text": json.dumps(self.config_v1),
            },
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(create_response.status_code, 201)
        parser_id = create_response.data["id"]
        self.assertEqual(create_response.data["active_revision_detail"]["version"], 1)

        preview_response = self.client.post(
            f"/api/ingestion/parsers/{parser_id}/preview/",
            data={"raw_payload": {"event_id": "evt-1", "severity": "high"}},
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(preview_response.status_code, 200)
        self.assertEqual(preview_response.data["parsed_payload"]["event"]["id"], "evt-1")

        update_response = self.client.patch(
            f"/api/ingestion/parsers/{parser_id}/",
            data={"config_text": json.dumps(self.config_v2)},
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.data["active_revision_detail"]["version"], 2)

        rollback_response = self.client.post(
            f"/api/ingestion/parsers/{parser_id}/rollback/",
            data={"revision_id": create_response.data["active_revision_detail"]["id"]},
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(rollback_response.status_code, 200)
        self.assertEqual(rollback_response.data["active_revision_detail"]["version"], 3)
        self.assertEqual(rollback_response.data["active_revision_detail"]["rollback_from_version"], 1)


@override_settings(SEARCH_BACKEND="postgres", SEARCH_INDEX_SYNC_ASYNC=False)
class SearchApiTests(BaseTenantTestCase):
    def setUp(self):
        self.client = APIClient()
        self.manager = get_user_model().objects.create_user(
            username="search-manager",
            password="Manager123!",
            role="SOC_MANAGER",
        )
        self.client.force_authenticate(user=self.manager)
        self.state = AlertState.objects.create(name="Nuovo", order=0, is_final=False, is_enabled=True)
        self.state_investigating = AlertState.objects.create(name="Investigating", order=1, is_final=False, is_enabled=True)
        self.customer_primary = Customer.objects.create(name="Customer Alpha", code="alpha")
        self.customer_secondary = Customer.objects.create(name="Customer Beta", code="beta")
        self.tag_incident = Tag.objects.create(name="incident", scope=Tag.Scope.ALERT)
        self.tag_noise = Tag.objects.create(name="noise", scope=Tag.Scope.ALERT)
        now = timezone.now()

        self.alert_1 = Alert.objects.create(
            title="EDR suspicious process",
            customer=self.customer_primary,
            severity="high",
            event_timestamp=now,
            source_name="edr-feed",
            source_id="evt-1",
            raw_payload={"message": "Ransomware behavior detected on host ws-11"},
            parsed_payload={
                "event": {
                    "id": "evt-1",
                    "risk": 91,
                    "success": False,
                    "timestamp": "2026-01-10T10:00:00Z",
                }
            },
            parsed_field_schema=[
                {"field": "event.id", "type": "string"},
                {"field": "event.risk", "type": "int"},
                {"field": "event.success", "type": "bool"},
                {"field": "event.timestamp", "type": "string"},
            ],
            current_state=self.state,
            dedup_fingerprint="search-1",
        )
        AlertTag.objects.create(alert=self.alert_1, tag=self.tag_incident)

        self.alert_2 = Alert.objects.create(
            title="Firewall unusual traffic",
            customer=self.customer_secondary,
            severity="medium",
            event_timestamp=now - timedelta(days=2),
            source_name="firewall-feed",
            source_id="evt-2",
            raw_payload={"message": "Outbound traffic above threshold"},
            parsed_payload={
                "event": {
                    "id": "evt-2",
                    "risk": 35,
                    "success": True,
                    "timestamp": "2026-01-09T07:30:00Z",
                }
            },
            parsed_field_schema=[
                {"field": "event.id", "type": "string"},
                {"field": "event.risk", "type": "int"},
                {"field": "event.success", "type": "bool"},
                {"field": "event.timestamp", "type": "string"},
            ],
            current_state=self.state_investigating,
            dedup_fingerprint="search-2",
        )
        AlertTag.objects.create(alert=self.alert_2, tag=self.tag_noise)
        Assignment.objects.create(alert=self.alert_1, assigned_to=self.manager, assigned_by=self.manager)

        self.global_source_edr = Source.objects.create(
            name="edr-feed",
            type=Source.Type.REST,
            is_enabled=True,
            severity_map={"field": "severity", "default": "medium", "map": {}},
        )
        self.global_source_fw = Source.objects.create(
            name="firewall-feed",
            type=Source.Type.WEBHOOK,
            is_enabled=True,
            severity_map={"field": "severity", "default": "medium", "map": {}},
        )

    def test_search_full_text_and_dynamic_filters(self):
        response = self.client.post(
            "/api/alerts/search/",
            data={
                "text": "ransomware",
                "customer_id": self.customer_primary.id,
                "source_name": "edr-feed",
                "dynamic_filters": [
                    {"field": "event.risk", "type": "number", "operator": "gte", "value": 80},
                    {"field": "event.success", "type": "boolean", "operator": "eq", "value": False},
                ],
                "page": 1,
                "page_size": 20,
            },
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["backend"], "postgres")
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], self.alert_1.id)

    def test_source_field_schema_endpoint(self):
        response = self.client.get(
            f"/api/alerts/field-schemas/?source_name=edr-feed&customer_id={self.customer_primary.id}",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(response.status_code, 200)
        fields = response.data[0]["fields"]
        fields_map = {item["field"]: item["type"] for item in fields}
        self.assertEqual(fields_map.get("event.id"), "keyword")
        self.assertEqual(fields_map.get("event.risk"), "number")
        self.assertEqual(fields_map.get("event.success"), "boolean")
        self.assertEqual(fields_map.get("event.timestamp"), "date")

    def test_search_can_filter_by_customer_id(self):
        response = self.client.post(
            "/api/alerts/search/",
            data={
                "customer_id": self.customer_secondary.id,
                "page": 1,
                "page_size": 20,
            },
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], self.alert_2.id)

    def test_search_full_text_matches_customer_name_and_code(self):
        response_by_code = self.client.post(
            "/api/alerts/search/",
            data={
                "text": "alpha",
                "page": 1,
                "page_size": 20,
            },
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(response_by_code.status_code, 200)
        self.assertEqual(response_by_code.data["count"], 1)
        self.assertEqual(response_by_code.data["results"][0]["id"], self.alert_1.id)

        response_by_name = self.client.post(
            "/api/alerts/search/",
            data={
                "text": "Customer Beta",
                "page": 1,
                "page_size": 20,
            },
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(response_by_name.status_code, 200)
        self.assertEqual(response_by_name.data["count"], 1)
        self.assertEqual(response_by_name.data["results"][0]["id"], self.alert_2.id)

    def test_customers_overview_exposes_realtime_active_counts(self):
        response = self.client.get("/api/alerts/customers/overview/", HTTP_HOST="test.localhost")
        self.assertEqual(response.status_code, 200)
        by_customer_id = {item["id"]: item for item in response.data}

        primary = by_customer_id[self.customer_primary.id]
        self.assertEqual(primary["active_alerts_total"], 1)
        self.assertEqual(primary["active_alerts_critical"], 0)
        self.assertEqual(primary["active_alerts_high"], 1)
        self.assertEqual(primary["active_alerts_medium"], 0)
        self.assertEqual(primary["active_alerts_low"], 0)
        self.assertEqual(
            primary["active_alerts_by_severity"],
            {"critical": 0, "high": 1, "medium": 0, "low": 0},
        )

        secondary = by_customer_id[self.customer_secondary.id]
        self.assertEqual(secondary["active_alerts_total"], 1)
        self.assertEqual(secondary["active_alerts_medium"], 1)

    def test_customers_overview_supports_ordering(self):
        Alert.objects.create(
            title="Firewall critical event",
            customer=self.customer_secondary,
            severity="critical",
            event_timestamp=timezone.now(),
            source_name="firewall-feed",
            source_id="evt-3",
            raw_payload={"message": "Critical outbound spike"},
            parsed_payload={"event": {"id": "evt-3", "risk": 98}},
            parsed_field_schema=[
                {"field": "event.id", "type": "string"},
                {"field": "event.risk", "type": "int"},
            ],
            current_state=self.state_investigating,
            dedup_fingerprint="search-3",
        )

        response = self.client.get(
            "/api/alerts/customers/overview/?ordering=-active_alerts_total",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(len(response.data), 2)
        self.assertEqual(response.data[0]["id"], self.customer_secondary.id)
        self.assertEqual(response.data[0]["active_alerts_total"], 2)

    def test_search_supports_advanced_server_side_filters(self):
        response = self.client.post(
            "/api/alerts/search/",
            data={
                "source_names": ["edr-feed"],
                "state_ids": [self.state.id],
                "severities": ["high"],
                "alert_types": ["EDR suspicious process"],
                "tag_ids": [self.tag_incident.id],
                "event_timestamp_from": (timezone.now() - timedelta(days=1)).isoformat(),
                "event_timestamp_to": (timezone.now() + timedelta(days=1)).isoformat(),
                "ordering": "-event_timestamp",
                "page": 1,
                "page_size": 25,
            },
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], self.alert_1.id)

    def test_search_supports_assignee_me_in_state_since_and_multi_ordering(self):
        old_timestamp = timezone.now() - timedelta(days=2)
        Alert.objects.filter(pk=self.alert_1.pk).update(created_at=old_timestamp)

        response = self.client.post(
            "/api/alerts/search/",
            data={
                "assignee": "me",
                "in_state_since": (timezone.now() - timedelta(hours=24)).isoformat(),
                "ordering": "severity,-created_at",
                "page": 1,
                "page_size": 25,
            },
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], self.alert_1.id)

    def test_bulk_action_supports_select_all_with_filters(self):
        response = self.client.post(
            "/api/alerts/alerts/bulk-action/",
            data={
                "action": "add_tag",
                "select_all": True,
                "filters": {
                    "assignee": "me",
                    "page": 1,
                    "page_size": 25,
                },
                "tag_ids": [self.tag_noise.id],
            },
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["errors"], 0)
        self.assertGreaterEqual(response.data["updated"], 1)
        self.assertTrue(AlertTag.objects.filter(alert=self.alert_1, tag=self.tag_noise).exists())

    def test_alert_list_supports_assignee_me_query_param(self):
        response = self.client.get(
            "/api/alerts/alerts/?assignee=me",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], self.alert_1.id)

    def test_search_applies_customer_source_preferences(self):
        CustomerSourcePreference.objects.create(
            customer=self.customer_primary,
            source=self.global_source_edr,
            is_enabled=False,
        )
        response = self.client.post(
            "/api/alerts/search/",
            data={
                "customer_id": self.customer_primary.id,
                "page": 1,
                "page_size": 20,
            },
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 0)

    def test_search_customer_filter_keeps_legacy_customer_sources(self):
        Source.objects.create(
            customer=self.customer_primary,
            name="edr-feed",
            type=Source.Type.REST,
            is_enabled=True,
            severity_map={"field": "severity", "default": "medium", "map": {}},
        )
        CustomerSourcePreference.objects.create(
            customer=self.customer_primary,
            source=self.global_source_edr,
            is_enabled=False,
        )
        response = self.client.post(
            "/api/alerts/search/",
            data={
                "customer_id": self.customer_primary.id,
                "page": 1,
                "page_size": 20,
            },
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], self.alert_1.id)

    def test_alert_detail_field_config_set_and_list(self):
        set_response = self.client.put(
            f"/api/alerts/detail-field-configs/set/?customer_id={self.customer_primary.id}",
            data={
                "source_name": "edr-feed",
                "alert_type": "EDR suspicious process",
                "visible_fields": ["event.id", "event.risk"],
            },
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(set_response.status_code, 200)
        self.assertEqual(set_response.data["source_name"], "edr-feed")
        self.assertEqual(set_response.data["alert_type"], "EDR suspicious process")
        self.assertEqual(set_response.data["visible_fields"], ["event.id", "event.risk"])

        list_response = self.client.get(
            f"/api/alerts/detail-field-configs/?customer_id={self.customer_primary.id}",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(len(list_response.data), 1)
        self.assertEqual(list_response.data[0]["visible_fields"], ["event.id", "event.risk"])

        update_response = self.client.put(
            f"/api/alerts/detail-field-configs/set/?customer_id={self.customer_primary.id}",
            data={
                "source_name": "edr-feed",
                "alert_type": "EDR suspicious process",
                "visible_fields": ["event.id"],
            },
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.data["visible_fields"], ["event.id"])

        final_list = self.client.get(
            f"/api/alerts/detail-field-configs/?customer_id={self.customer_primary.id}",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(final_list.status_code, 200)
        self.assertEqual(len(final_list.data), 1)
        self.assertEqual(final_list.data[0]["visible_fields"], ["event.id"])

    def test_saved_search_crud_is_user_scoped(self):
        create_response = self.client.post(
            "/api/alerts/saved-searches/",
            data={
                "name": "Ricerca SOC",
                "text_query": "ransomware",
                "source_name": "edr-feed",
                "state_id": self.state.id,
                "severity": "high",
                "is_active": True,
                "dynamic_filters": [{"field": "event.risk", "type": "number", "operator": "gte", "value": 80}],
                "ordering": "-event_timestamp",
                "visible_columns": ["title", "severity", "state", "event_timestamp"],
            },
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(create_response.status_code, 201)
        saved_search_id = create_response.data["id"]

        list_response = self.client.get("/api/alerts/saved-searches/", HTTP_HOST="test.localhost")
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(len(list_response.data), 1)
        self.assertEqual(list_response.data[0]["name"], "Ricerca SOC")

        patch_response = self.client.patch(
            f"/api/alerts/saved-searches/{saved_search_id}/",
            data={"name": "Ricerca SOC aggiornata"},
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(patch_response.status_code, 200)
        self.assertEqual(patch_response.data["name"], "Ricerca SOC aggiornata")

        other_user = get_user_model().objects.create_user(
            username="search-other",
            password="ReadOnly123!",
            role=get_user_model().Role.READ_ONLY,
        )
        self.client.force_authenticate(user=other_user)
        isolated_list = self.client.get("/api/alerts/saved-searches/", HTTP_HOST="test.localhost")
        self.assertEqual(isolated_list.status_code, 200)
        self.assertEqual(len(isolated_list.data), 0)

        self.client.force_authenticate(user=self.manager)
        delete_response = self.client.delete(
            f"/api/alerts/saved-searches/{saved_search_id}/",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(delete_response.status_code, 204)
        final_list = self.client.get("/api/alerts/saved-searches/", HTTP_HOST="test.localhost")
        self.assertEqual(len(final_list.data), 0)


class SmokeApiTests(BaseTenantTestCase):
    def setUp(self):
        self.client = APIClient()
        self.manager = get_user_model().objects.create_user(
            username="smoke-manager",
            password="Manager123!",
            role="SOC_MANAGER",
        )
        self.client.force_authenticate(user=self.manager)
        self.state = AlertState.objects.create(name="Nuovo", order=0, is_final=False, is_enabled=True)
        self.alert = Alert.objects.create(
            title="Alert smoke critico",
            severity="critical",
            event_timestamp=timezone.now(),
            source_name="smoke-source",
            source_id="smoke-1",
            raw_payload={"message": "smoke raw"},
            parsed_payload={"event": {"id": "smoke-1"}},
            parsed_field_schema=[{"field": "event.id", "type": "keyword"}],
            current_state=self.state,
            dedup_fingerprint="smoke-fingerprint-1",
        )

    def test_system_health_ready_and_docs(self):
        health = self.client.get("/healthz", HTTP_HOST="test.localhost")
        ready = self.client.get("/readyz", HTTP_HOST="test.localhost")
        docs = self.client.get("/api/docs/", HTTP_HOST="test.localhost")

        self.assertEqual(health.status_code, 200)
        self.assertEqual(ready.status_code, 200)
        self.assertEqual(docs.status_code, 200)
        self.assertIn("celery", ready.data.get("checks", {}))

    def test_dashboard_notifications_and_export_endpoints(self):
        widgets = self.client.get("/api/core/dashboard/widgets/", HTTP_HOST="test.localhost")
        self.assertEqual(widgets.status_code, 200)
        self.assertIn("widgets_layout", widgets.data)
        self.assertIn("widgets", widgets.data)

        updated_layout = self.client.put(
            "/api/core/dashboard/widgets/",
            data={
                "widgets_layout": [
                    {"key": "top_sources", "enabled": True, "order": 0},
                    {"key": "alert_trend", "enabled": True, "order": 1},
                    {"key": "state_distribution", "enabled": False, "order": 2},
                ]
            },
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(updated_layout.status_code, 200)

        tenants = self.client.get("/api/core/dashboard/tenants/", HTTP_HOST="test.localhost")
        self.assertEqual(tenants.status_code, 200)
        self.assertGreaterEqual(len(tenants.data), 1)
        self.assertEqual(tenants.data[0]["schema_name"], self.tenant.schema_name)
        self.assertEqual(tenants.data[0]["domain"], "test.localhost")
        self.assertTrue(tenants.data[0]["entry_url"].endswith("/tenant"))

        reorder = self.client.post(
            "/api/core/dashboard/tenants/reorder/",
            data={"schema_order": [self.tenant.schema_name]},
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(reorder.status_code, 200)
        self.assertEqual(reorder.data["schema_order"], [self.tenant.schema_name])

        notifications = self.client.get("/api/alerts/notifications/", HTTP_HOST="test.localhost")
        self.assertEqual(notifications.status_code, 200)
        self.assertGreaterEqual(notifications.data["unread_count"], 1)
        self.assertGreaterEqual(len(notifications.data["results"]), 1)

        ack_all = self.client.post("/api/alerts/notifications/ack-all/", data={}, format="json", HTTP_HOST="test.localhost")
        self.assertEqual(ack_all.status_code, 200)

        export = self.client.post(
            "/api/alerts/alerts/export-configurable/",
            data={
                "text": "smoke",
                "columns": ["id", "title", "severity", "dyn:event.id"],
                "all_results": True,
                "page": 1,
                "page_size": 25,
            },
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(export.status_code, 200)
        self.assertIn("text/csv", export["Content-Type"])
        body = export.content.decode("utf-8")
        self.assertIn("id,title,severity,dyn:event.id", body)
        self.assertIn("Alert smoke critico", body)

        preview = self.client.post(
            "/api/alerts/alerts/export-configurable/",
            data={
                "text": "smoke",
                "columns": ["id", "title", "severity"],
                "preview": True,
                "limit": 5,
                "all_results": True,
            },
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(preview.status_code, 200)
        self.assertIn("count", preview.data)
        self.assertIn("rows", preview.data)
        self.assertEqual(preview.data["columns"], ["id", "title", "severity"])

    def test_tenant_endpoints_blocked_on_public_schema(self):
        notifications = self.client.get("/api/alerts/notifications/", HTTP_HOST="localhost")
        search = self.client.post(
            "/api/alerts/search/",
            data={"text": "smoke", "page": 1, "page_size": 10},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(notifications.status_code, 403)
        self.assertEqual(search.status_code, 403)


class NotificationCenterApiTests(BaseTenantTestCase):
    def setUp(self):
        self.client = APIClient()
        self.manager = get_user_model().objects.create_user(
            username="notif-manager",
            password="Manager123!",
            role="SOC_MANAGER",
        )
        self.client.force_authenticate(user=self.manager)
        self.open_state = AlertState.objects.create(name="Notif Open", order=0, is_final=False, is_enabled=True)
        self.customer_a = Customer.objects.create(name="Notif Customer A", code="NCA")
        self.customer_b = Customer.objects.create(name="Notif Customer B", code="NCB")
        CustomerMembership.objects.create(
            user=self.manager,
            customer=self.customer_a,
            scope=CustomerMembership.Scope.MANAGER,
            is_active=True,
        )

        self.alert = Alert.objects.create(
            title="Alert notifica",
            customer=self.customer_a,
            severity=Alert.Severity.CRITICAL,
            event_timestamp=timezone.now(),
            source_name="notif-source",
            source_id="notif-1",
            current_state=self.open_state,
            dedup_fingerprint="notif-fp-1",
        )

        self.notification = NotificationEvent.objects.create(
            alert=self.alert,
            customer=self.customer_a,
            title="Notifica test",
            message="Messaggio test",
            severity=NotificationEvent.Severity.HIGH,
            metadata={"target_user_id": self.manager.id},
            is_active=True,
        )

    def test_notification_preferences_get_and_patch(self):
        get_response = self.client.get("/api/alerts/notification-preferences/", HTTP_HOST="test.localhost")
        self.assertEqual(get_response.status_code, 200)
        self.assertEqual(get_response.data["min_severity"], "all")
        self.assertEqual(get_response.data["channels"]["ui"], True)

        patch_response = self.client.patch(
            "/api/alerts/notification-preferences/",
            data={
                "min_severity": "high",
                "customer_filter": [self.customer_a.id],
                "channels": {"ui": True, "email": True},
            },
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(patch_response.status_code, 200)
        self.assertEqual(patch_response.data["min_severity"], "high")
        self.assertEqual(patch_response.data["channels"]["email"], True)
        prefs = NotificationPreferences.objects.get(user=self.manager)
        self.assertEqual(list(prefs.customer_filter.values_list("id", flat=True)), [self.customer_a.id])

    def test_snooze_endpoint_hides_until_unsnooze_task_runs(self):
        snooze_response = self.client.post(
            f"/api/alerts/notifications/{self.notification.id}/snooze/",
            data={"minutes": 15},
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(snooze_response.status_code, 200)
        self.notification.refresh_from_db()
        self.assertIsNotNone(self.notification.snoozed_until)

        list_response = self.client.get("/api/alerts/notifications/", HTTP_HOST="test.localhost")
        self.assertEqual(list_response.status_code, 200)
        listed_ids = [item["id"] for item in list_response.data["results"]]
        self.assertNotIn(self.notification.id, listed_ids)

        NotificationEvent.objects.filter(id=self.notification.id).update(
            snoozed_until=timezone.now() - timedelta(minutes=1)
        )
        task_result = unsnooze_notifications_task()
        self.assertGreaterEqual(task_result["updated"], 1)
        self.notification.refresh_from_db()
        self.assertIsNone(self.notification.snoozed_until)

    @override_settings(ENABLE_BROWSER_PUSH=True)
    def test_push_subscription_endpoint_upserts_subscription(self):
        response = self.client.post(
            "/api/alerts/push-subscriptions/",
            data={
                "endpoint": "https://push.example/endpoint-1",
                "keys": {"p256dh": "abc", "auth": "def"},
            },
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(PushSubscription.objects.filter(user=self.manager).count(), 1)

    def test_critical_notification_respects_user_preferences(self):
        prefs, _ = NotificationPreferences.objects.get_or_create(user=self.manager)
        prefs.min_severity = NotificationPreferences.MinSeverity.CRITICAL
        prefs.channels = {"ui": True, "email": False}
        prefs.save(update_fields=["min_severity", "channels", "updated_at"])
        prefs.customer_filter.add(self.customer_b)

        high_alert = Alert.objects.create(
            title="High alert no notif",
            customer=self.customer_a,
            severity=Alert.Severity.HIGH,
            event_timestamp=timezone.now(),
            source_name="notif-source",
            source_id="notif-high",
            current_state=self.open_state,
            dedup_fingerprint="notif-high-fp",
        )
        self.assertFalse(
            NotificationEvent.objects.filter(
                alert=high_alert,
                metadata__target_user_id=self.manager.id,
                metadata__kind="critical_alert",
            ).exists()
        )

        critical_alert = Alert.objects.create(
            title="Critical alert filtered customer",
            customer=self.customer_a,
            severity=Alert.Severity.CRITICAL,
            event_timestamp=timezone.now(),
            source_name="notif-source",
            source_id="notif-critical",
            current_state=self.open_state,
            dedup_fingerprint="notif-critical-fp",
        )
        self.assertFalse(
            NotificationEvent.objects.filter(
                alert=critical_alert,
                metadata__target_user_id=self.manager.id,
                metadata__kind="critical_alert",
            ).exists()
        )


class PublicDashboardApiTests(BaseTenantTestCase):
    def setUp(self):
        self.client = APIClient()
        self.manager = get_user_model().objects.create_user(
            username="public-dashboard-manager",
            password="Manager123!",
            role="SOC_MANAGER",
        )
        self.client.force_authenticate(user=self.manager)

    def test_public_dashboard_lists_tenant_entries(self):
        tenants = self.client.get("/api/core/dashboard/tenants/", HTTP_HOST="localhost")
        self.assertEqual(tenants.status_code, 200)
        self.assertGreaterEqual(len(tenants.data), 1)
        self.assertEqual(tenants.data[0]["schema_name"], self.tenant.schema_name)
        self.assertEqual(tenants.data[0]["domain"], "test.localhost")

        reorder = self.client.post(
            "/api/core/dashboard/tenants/reorder/",
            data={"schema_order": [self.tenant.schema_name]},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(reorder.status_code, 200)
        self.assertEqual(reorder.data["schema_order"], [self.tenant.schema_name])


class AlertSummaryApiTests(BaseTenantTestCase):
    def setUp(self):
        self.client = APIClient()
        self.manager = get_user_model().objects.create_user(
            username="summary-manager",
            password="Manager123!",
            role="SOC_MANAGER",
        )
        self.client.force_authenticate(user=self.manager)

        self.open_state = AlertState.objects.create(name="Nuovo summary", order=0, is_final=False, is_enabled=True)
        self.closed_state = AlertState.objects.create(name="Risolto summary", order=1, is_final=True, is_enabled=True)

        now = timezone.now()
        self.open_today = Alert.objects.create(
            title="Open today",
            severity="high",
            event_timestamp=now,
            source_name="summary-source",
            source_id="summary-open-today",
            current_state=self.open_state,
            dedup_fingerprint="summary-open-today",
        )
        self.open_yesterday = Alert.objects.create(
            title="Open yesterday",
            severity="low",
            event_timestamp=now - timedelta(days=1),
            source_name="summary-source",
            source_id="summary-open-yesterday",
            current_state=self.open_state,
            dedup_fingerprint="summary-open-yesterday",
        )
        Alert.objects.filter(pk=self.open_yesterday.pk).update(created_at=now - timedelta(days=1, hours=2))

        self.closed_alert = Alert.objects.create(
            title="Closed mttr",
            severity="critical",
            event_timestamp=now - timedelta(hours=2),
            source_name="summary-source",
            source_id="summary-closed",
            current_state=self.closed_state,
            dedup_fingerprint="summary-closed",
        )
        Alert.objects.filter(pk=self.closed_alert.pk).update(
            created_at=now - timedelta(hours=3),
            updated_at=now - timedelta(hours=1),
        )

    def test_alert_summary_severity_returns_aggregated_counts(self):
        response = self.client.get(
            "/api/alerts/alerts/?summary=severity",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["summary"], "severity")
        counts = {item["severity"]: item["count"] for item in response.data["items"]}
        self.assertEqual(counts["critical"], 1)
        self.assertEqual(counts["high"], 1)
        self.assertEqual(counts["low"], 1)

    def test_alert_summary_mttr_and_state_category_filters(self):
        mttr_response = self.client.get(
            "/api/alerts/alerts/?summary=mttr&state__category=closed",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(mttr_response.status_code, 200)
        self.assertEqual(mttr_response.data["summary"], "mttr")
        self.assertEqual(mttr_response.data["sample_size"], 1)
        self.assertEqual(mttr_response.data["avg_minutes"], 120)

        created_after = (timezone.now() + timedelta(days=1)).isoformat().replace("+00:00", "Z")
        open_response = self.client.get(
            f"/api/alerts/alerts/?state__category=open&created_after={created_after}",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(open_response.status_code, 200)
        self.assertEqual(open_response.data["count"], 0)


class AlertDetailEnhancementsTests(BaseTenantTestCase):
    def setUp(self):
        self.client = APIClient()
        self.mentioned_client = APIClient()
        self.manager = get_user_model().objects.create_user(
            username="detail-enh-manager",
            password="Manager123!",
            role="SOC_MANAGER",
        )
        self.mentioned_user = get_user_model().objects.create_user(
            username="soc-mentioned",
            password="Analyst123!",
            role="SOC_ANALYST",
        )
        self.client.force_authenticate(user=self.manager)
        self.mentioned_client.force_authenticate(user=self.mentioned_user)

        self.open_state = AlertState.objects.create(name="Nuovo detail", order=0, is_final=False, is_enabled=True)
        self.closed_state = AlertState.objects.create(name="Chiuso detail", order=1, is_final=True, is_enabled=True)
        self.customer = Customer.objects.create(name="Detail Customer", code="DET")

        CustomerMembership.objects.create(
            user=self.manager,
            customer=self.customer,
            scope=CustomerMembership.Scope.MANAGER,
            is_active=True,
        )
        CustomerMembership.objects.create(
            user=self.mentioned_user,
            customer=self.customer,
            scope=CustomerMembership.Scope.TRIAGE,
            is_active=True,
        )

        now = timezone.now()
        self.base_alert = Alert.objects.create(
            title="Base alert detail",
            customer=self.customer,
            severity="high",
            event_timestamp=now,
            source_name="detail-source",
            source_id="detail-base",
            raw_payload={
                "src_ip": "8.8.8.8",
                "rule_id": "RULE-42",
                "extra_ip": "10.0.0.1",
                "hash": "0123456789abcdef0123456789abcdef",
                "url": "https://evil.example/path",
                "email": "attacker@example.org",
            },
            current_state=self.open_state,
            dedup_fingerprint="detail-base-fp",
        )
        Alert.objects.filter(pk=self.base_alert.pk).update(created_at=now - timedelta(minutes=30))

        self.related_by_ip = Alert.objects.create(
            title="Related by IP",
            customer=self.customer,
            severity="medium",
            event_timestamp=now - timedelta(minutes=20),
            source_name="detail-source",
            source_id="detail-ip",
            raw_payload={"src_ip": "8.8.8.8", "rule_id": "RULE-X"},
            current_state=self.open_state,
            dedup_fingerprint="detail-ip-fp",
        )
        Alert.objects.filter(pk=self.related_by_ip.pk).update(created_at=now - timedelta(minutes=20))

        self.related_by_rule = Alert.objects.create(
            title="Related by Rule",
            customer=self.customer,
            severity="critical",
            event_timestamp=now - timedelta(minutes=10),
            source_name="detail-source",
            source_id="detail-rule",
            raw_payload={"src_ip": "203.0.113.9", "rule_id": "RULE-42"},
            current_state=self.open_state,
            dedup_fingerprint="detail-rule-fp",
        )
        Alert.objects.filter(pk=self.related_by_rule.pk).update(created_at=now - timedelta(minutes=10))

        self.unrelated_alert = Alert.objects.create(
            title="Unrelated alert",
            customer=self.customer,
            severity="low",
            event_timestamp=now,
            source_name="detail-source",
            source_id="detail-unrelated",
            raw_payload={"src_ip": "203.0.113.7", "rule_id": "RULE-OTHER"},
            current_state=self.open_state,
            dedup_fingerprint="detail-unrelated-fp",
        )
        Alert.objects.filter(pk=self.unrelated_alert.pk).update(created_at=now - timedelta(minutes=5))

        old_related = Alert.objects.create(
            title="Old related",
            customer=self.customer,
            severity="low",
            event_timestamp=now - timedelta(days=40),
            source_name="detail-source",
            source_id="detail-old",
            raw_payload={"src_ip": "8.8.8.8", "rule_id": "RULE-42"},
            current_state=self.open_state,
            dedup_fingerprint="detail-old-fp",
        )
        Alert.objects.filter(pk=old_related.pk).update(created_at=now - timedelta(days=40))

    def test_related_endpoint_returns_recent_alerts_for_same_customer(self):
        response = self.client.get(
            f"/api/alerts/alerts/{self.base_alert.id}/related/",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(response.status_code, 200)
        ids = [item["id"] for item in response.data]
        self.assertIn(self.related_by_ip.id, ids)
        self.assertIn(self.related_by_rule.id, ids)
        self.assertNotIn(self.unrelated_alert.id, ids)
        self.assertLessEqual(len(ids), 5)
        self.assertEqual(ids[0], self.related_by_rule.id)

    def test_sla_config_endpoint_and_alert_detail_sla_status(self):
        create_response = self.client.post(
            "/api/alerts/sla-config/",
            data={"severity": "high", "response_minutes": 120, "resolution_minutes": 480},
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(create_response.status_code, 200)
        self.assertEqual(SLAConfig.objects.filter(severity="high").count(), 1)

        list_response = self.client.get("/api/alerts/sla-config/", HTTP_HOST="test.localhost")
        self.assertEqual(list_response.status_code, 200)
        self.assertTrue(any(item["severity"] == "high" for item in list_response.data))

        detail_response = self.client.get(
            f"/api/alerts/alerts/{self.base_alert.id}/",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(detail_response.status_code, 200)
        self.assertIn("sla_status", detail_response.data)
        self.assertEqual(detail_response.data["sla_status"]["response"], "ok")
        self.assertGreater(detail_response.data["sla_status"]["response_remaining_minutes"], 0)

    def test_comment_mentions_create_targeted_notifications(self):
        response = self.client.post(
            f"/api/alerts/alerts/{self.base_alert.id}/comments/",
            data={"body": "Coinvolgo @soc-mentioned per verifica IOC"},
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(
            NotificationEvent.objects.filter(
                alert=self.base_alert,
                metadata__mention=True,
                metadata__target_user_id=self.mentioned_user.id,
            ).exists()
        )

        mentioned_notifications = self.mentioned_client.get("/api/alerts/notifications/", HTTP_HOST="test.localhost")
        self.assertEqual(mentioned_notifications.status_code, 200)
        self.assertTrue(
            any(
                item["metadata"].get("target_user_id") == self.mentioned_user.id
                for item in mentioned_notifications.data["results"]
            )
        )

        author_notifications = self.client.get("/api/alerts/notifications/", HTTP_HOST="test.localhost")
        self.assertEqual(author_notifications.status_code, 200)
        self.assertFalse(
            any(
                item["metadata"].get("target_user_id") == self.mentioned_user.id
                for item in author_notifications.data["results"]
            )
        )

    def test_extract_iocs_task_populates_alert_iocs(self):
        result = extract_iocs_task(self.tenant.schema_name, self.base_alert.id)
        self.assertTrue(result.get("ok"))
        self.base_alert.refresh_from_db()
        self.assertIn("8.8.8.8", self.base_alert.iocs.get("ips", []))
        self.assertNotIn("10.0.0.1", self.base_alert.iocs.get("ips", []))
        self.assertIn("0123456789abcdef0123456789abcdef", self.base_alert.iocs.get("hashes", []))
        self.assertIn("https://evil.example/path", self.base_alert.iocs.get("urls", []))
        self.assertIn("attacker@example.org", self.base_alert.iocs.get("emails", []))


class CustomerMembershipEnforcementTests(BaseTenantTestCase):
    def setUp(self):
        self.analyst_client = APIClient()
        self.manager_client = APIClient()

        self.state = AlertState.objects.create(name="Nuovo scope", order=0, is_final=False, is_enabled=True)
        self.customer_a = Customer.objects.create(name="Scope Customer A", code="SCA")
        self.customer_b = Customer.objects.create(name="Scope Customer B", code="SCB")

        self.analyst = get_user_model().objects.create_user(
            username="scope-analyst",
            password="Analyst123!",
            role="SOC_ANALYST",
            is_active=True,
        )
        self.manager = get_user_model().objects.create_user(
            username="scope-manager",
            password="Manager123!",
            role="SOC_MANAGER",
            is_active=True,
        )

        CustomerMembership.objects.create(
            user=self.analyst,
            customer=self.customer_a,
            scope=CustomerMembership.Scope.TRIAGE,
            is_active=True,
        )
        CustomerMembership.objects.create(
            user=self.manager,
            customer=self.customer_a,
            scope=CustomerMembership.Scope.MANAGER,
            is_active=True,
        )

        self.analyst_client.force_authenticate(user=self.analyst)
        self.manager_client.force_authenticate(user=self.manager)

        self.alert_a = Alert.objects.create(
            title="Scoped alert A",
            severity="high",
            event_timestamp=timezone.now(),
            source_name="scope-source-a",
            source_id="scope-a-1",
            customer=self.customer_a,
            current_state=self.state,
            dedup_fingerprint="scope-fp-a",
        )
        self.alert_b = Alert.objects.create(
            title="Scoped alert B",
            severity="critical",
            event_timestamp=timezone.now(),
            source_name="scope-source-b",
            source_id="scope-b-1",
            customer=self.customer_b,
            current_state=self.state,
            dedup_fingerprint="scope-fp-b",
        )

        self.global_source = Source.objects.create(
            name="Scoped global source",
            type=Source.Type.REST,
            is_enabled=True,
            customer=None,
        )
        self.customer_a_source = Source.objects.create(
            name="Scoped customer A source",
            type=Source.Type.REST,
            is_enabled=True,
            customer=self.customer_a,
        )
        self.customer_b_source = Source.objects.create(
            name="Scoped customer B source",
            type=Source.Type.REST,
            is_enabled=True,
            customer=self.customer_b,
        )

    def test_alert_endpoints_are_customer_scoped_by_membership(self):
        list_response = self.analyst_client.get("/api/alerts/alerts/", HTTP_HOST="test.localhost")
        self.assertEqual(list_response.status_code, 200)
        alert_ids = {item["id"] for item in list_response.data["results"]}
        self.assertIn(self.alert_a.id, alert_ids)
        self.assertNotIn(self.alert_b.id, alert_ids)

        forbidden_customer = self.analyst_client.get(
            f"/api/alerts/alerts/?customer_id={self.customer_b.id}",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(forbidden_customer.status_code, 403)

    def test_alert_search_returns_only_authorized_customers(self):
        response = self.analyst_client.post(
            "/api/alerts/search/",
            data={"page": 1, "page_size": 50},
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(response.status_code, 200)
        result_ids = [item["id"] for item in response.data["results"]]
        self.assertEqual(result_ids, [self.alert_a.id])
        self.assertEqual(response.data["count"], 1)

    def test_ingestion_sources_requires_manage_sources_and_is_scoped(self):
        analyst_response = self.analyst_client.get("/api/ingestion/sources/", HTTP_HOST="test.localhost")
        self.assertEqual(analyst_response.status_code, 403)

        manager_response = self.manager_client.get("/api/ingestion/sources/?scope=all", HTTP_HOST="test.localhost")
        self.assertEqual(manager_response.status_code, 200)
        names = {item["name"] for item in manager_response.data}
        self.assertIn(self.global_source.name, names)
        self.assertIn(self.customer_a_source.name, names)
        self.assertNotIn(self.customer_b_source.name, names)


class UserManagementAuthorizationTests(BaseTenantTestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()
        self.customer_a = Customer.objects.create(name="User Scope A", code="USA")
        self.customer_b = Customer.objects.create(name="User Scope B", code="USB")

        self.manager = self.user_model.objects.create_user(
            username="mgr-users",
            password="Manager123!",
            role="SOC_MANAGER",
            is_active=True,
        )
        self.analyst = self.user_model.objects.create_user(
            username="analyst-users",
            password="Analyst123!",
            role="SOC_ANALYST",
            is_active=True,
        )
        self.readonly_b = self.user_model.objects.create_user(
            username="readonly-users-b",
            password="ReadOnly123!",
            role="READ_ONLY",
            is_active=True,
        )

        CustomerMembership.objects.create(
            user=self.manager,
            customer=self.customer_a,
            scope=CustomerMembership.Scope.MANAGER,
            is_active=True,
        )
        CustomerMembership.objects.create(
            user=self.analyst,
            customer=self.customer_a,
            scope=CustomerMembership.Scope.TRIAGE,
            is_active=True,
        )
        CustomerMembership.objects.create(
            user=self.readonly_b,
            customer=self.customer_b,
            scope=CustomerMembership.Scope.VIEWER,
            is_active=True,
        )

    def test_users_list_requires_manage_users(self):
        self.client.force_authenticate(user=self.analyst)
        response = self.client.get("/api/auth/users/", HTTP_HOST="test.localhost")
        self.assertEqual(response.status_code, 403)

    def test_users_list_is_scoped_for_manager(self):
        self.client.force_authenticate(user=self.manager)
        response = self.client.get("/api/auth/users/", HTTP_HOST="test.localhost")
        self.assertEqual(response.status_code, 200)
        usernames = {item["username"] for item in response.data}
        self.assertIn("mgr-users", usernames)
        self.assertIn("analyst-users", usernames)
        self.assertNotIn("readonly-users-b", usernames)

    def test_manager_cannot_create_manager_role(self):
        self.client.force_authenticate(user=self.manager)
        response = self.client.post(
            "/api/auth/users/",
            {
                "username": "not-allowed-manager",
                "email": "not-allowed-manager@example.com",
                "first_name": "Not",
                "last_name": "Allowed",
                "role": "SOC_MANAGER",
                "is_active": True,
                "password": "StrongPass123!",
            },
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(response.status_code, 403)

    def test_manager_create_user_writes_security_audit(self):
        self.client.force_authenticate(user=self.manager)
        create_response = self.client.post(
            "/api/auth/users/",
            {
                "username": "readonly-users-a",
                "email": "readonly-users-a@example.com",
                "first_name": "Read",
                "last_name": "Only",
                "role": "READ_ONLY",
                "is_active": True,
                "password": "StrongPass123!",
            },
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(create_response.status_code, 201)

        audit_response = self.client.get("/api/auth/security-audit/", HTTP_HOST="test.localhost")
        self.assertEqual(audit_response.status_code, 200)
        self.assertTrue(any(item["action"] == "user.created" for item in audit_response.data))


class AttachmentSecurityTests(BaseTenantTestCase):
    def setUp(self):
        self.authorized_client = APIClient()
        self.forbidden_client = APIClient()
        self.anon_client = APIClient()

        self.state = AlertState.objects.create(name="Attachment Open", order=0, is_final=False, is_enabled=True)
        self.customer_a = Customer.objects.create(name="Attachment Customer A", code="ACA")
        self.customer_b = Customer.objects.create(name="Attachment Customer B", code="ACB")

        self.authorized_user = get_user_model().objects.create_user(
            username="attachment-analyst",
            password="Attachment123!",
            role="SOC_ANALYST",
            is_active=True,
        )
        self.forbidden_user = get_user_model().objects.create_user(
            username="attachment-forbidden",
            password="Attachment123!",
            role="SOC_ANALYST",
            is_active=True,
        )

        CustomerMembership.objects.create(
            user=self.authorized_user,
            customer=self.customer_a,
            scope=CustomerMembership.Scope.TRIAGE,
            is_active=True,
        )
        CustomerMembership.objects.create(
            user=self.forbidden_user,
            customer=self.customer_b,
            scope=CustomerMembership.Scope.TRIAGE,
            is_active=True,
        )

        self.authorized_client.force_authenticate(user=self.authorized_user)
        self.forbidden_client.force_authenticate(user=self.forbidden_user)

        self.alert_a = Alert.objects.create(
            title="Attachment scoped alert",
            severity="high",
            event_timestamp=timezone.now(),
            source_name="attachment-source",
            source_id="attachment-1",
            customer=self.customer_a,
            current_state=self.state,
            dedup_fingerprint="attachment-scope-a",
        )
        self.alert_b = Alert.objects.create(
            title="Attachment scoped alert b",
            severity="medium",
            event_timestamp=timezone.now(),
            source_name="attachment-source-b",
            source_id="attachment-2",
            customer=self.customer_b,
            current_state=self.state,
            dedup_fingerprint="attachment-scope-b",
        )

        self.attachment = Attachment.objects.create(
            alert=self.alert_a,
            filename="forensic.txt",
            file=SimpleUploadedFile("forensic.txt", b"ioc,1.2.3.4\n", content_type="text/plain"),
            content_type="text/plain",
            size=12,
            scan_status=Attachment.ScanStatus.CLEAN,
            scan_detail="seed",
            uploaded_by=self.authorized_user,
        )

    def test_direct_download_requires_authentication(self):
        response = self.anon_client.get(
            f"/api/alerts/attachments/{self.attachment.id}/download/",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(response.status_code, 401)

    def test_download_is_scoped_by_customer_membership(self):
        response = self.forbidden_client.get(
            f"/api/alerts/attachments/{self.attachment.id}/download/",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(response.status_code, 403)
        self.assertTrue(
            SecurityAuditEvent.objects.filter(
                action="attachment.download_denied",
                object_type="Attachment",
                object_id=str(self.attachment.id),
            ).exists()
        )

    def test_authorized_download_streams_and_audits(self):
        response = self.authorized_client.get(
            f"/api/alerts/attachments/{self.attachment.id}/download/",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("attachment;", response.get("Content-Disposition", ""))
        body = b"".join(response.streaming_content)
        self.assertEqual(body, b"ioc,1.2.3.4\n")
        self.assertTrue(
            self.alert_a.audit_logs.filter(
                action="alert.attachment_downloaded",
                object_type="Attachment",
                object_id=str(self.attachment.id),
            ).exists()
        )
        self.assertTrue(
            SecurityAuditEvent.objects.filter(
                action="attachment.downloaded",
                object_type="Attachment",
                object_id=str(self.attachment.id),
            ).exists()
        )

    @override_settings(
        ENABLE_DEV_ATTACHMENT_SCANNER=True,
        ATTACHMENT_SCAN_BACKEND="placeholder",
        BLOCK_UNSCANNED_ATTACHMENTS=True,
    )
    def test_upload_rejects_risky_content_and_writes_audit(self):
        payload = {
            "file": SimpleUploadedFile("bad.txt", b"<script>alert(1)</script>", content_type="text/plain"),
        }
        response = self.authorized_client.post(
            f"/api/alerts/alerts/{self.alert_a.id}/attachments/",
            data=payload,
            format="multipart",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Attachment.objects.filter(alert=self.alert_a, filename="bad.txt").exists())
        self.assertTrue(self.alert_a.audit_logs.filter(action="alert.attachment_upload_rejected").exists())
        self.assertTrue(SecurityAuditEvent.objects.filter(action="attachment.upload_rejected").exists())

    @override_settings(
        ENABLE_DEV_ATTACHMENT_SCANNER=True,
        ATTACHMENT_SCAN_BACKEND="placeholder",
        BLOCK_UNSCANNED_ATTACHMENTS=True,
    )
    def test_upload_accepts_clean_file_and_writes_audit(self):
        payload = {
            "file": SimpleUploadedFile("clean.txt", b"ioc=ok", content_type="text/plain"),
        }
        response = self.authorized_client.post(
            f"/api/alerts/alerts/{self.alert_a.id}/attachments/",
            data=payload,
            format="multipart",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["scan_status"], Attachment.ScanStatus.CLEAN)
        self.assertIn("/api/alerts/attachments/", response.data.get("download_url") or response.data.get("file_url") or "")
        self.assertTrue(
            self.alert_a.audit_logs.filter(
                action="alert.attachment_uploaded",
                object_type="Attachment",
            ).exists()
        )
        self.assertTrue(SecurityAuditEvent.objects.filter(action="attachment.uploaded").exists())

class ParserAdvancedApiTests(BaseTenantTestCase):
    def setUp(self):
        self.client = APIClient()
        self.manager = get_user_model().objects.create_user(
            username="parser-advanced-manager",
            password="Manager123!",
            role="SOC_MANAGER",
        )
        self.client.force_authenticate(user=self.manager)

        self.source = Source.objects.create(
            name="Parser Advanced Source",
            type=Source.Type.REST,
            is_enabled=True,
            severity_map={"field": "severity", "default": "medium", "map": {}},
        )

        self.config_v1 = {
            "extract": [{"type": "jsonpath", "name": "event_id", "path": "$.event_id"}],
            "transform": [],
            "normalize": {"ecs": {"event.id": "event_id"}},
            "output": {"mode": "normalized"},
        }
        self.config_v2 = {
            "extract": [
                {"type": "jsonpath", "name": "event_id", "path": "$.event_id"},
                {"type": "jsonpath", "name": "severity", "path": "$.severity"},
            ],
            "transform": [],
            "normalize": {"ecs": {"event.id": "event_id", "event.severity": "severity"}},
            "output": {"mode": "normalized"},
        }

        create_response = self.client.post(
            "/api/ingestion/parsers/",
            data={
                "source": self.source.id,
                "name": "Parser Advanced",
                "description": "Parser con revisioni avanzate",
                "is_enabled": True,
                "config_text": json.dumps(self.config_v1),
            },
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(create_response.status_code, 201, create_response.data)
        self.parser_id = create_response.data["id"]

        patch_response = self.client.patch(
            f"/api/ingestion/parsers/{self.parser_id}/",
            data={"config_text": json.dumps(self.config_v2)},
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(patch_response.status_code, 200, patch_response.data)

    def test_revisions_diff_test_cases_and_raw_event_preview(self):
        revisions_response = self.client.get(
            f"/api/ingestion/parsers/{self.parser_id}/revisions/",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(revisions_response.status_code, 200)
        self.assertGreaterEqual(len(revisions_response.data), 2)

        left = revisions_response.data[0]["revision_id"]
        right = revisions_response.data[1]["revision_id"]
        diff_response = self.client.get(
            f"/api/ingestion/parsers/{self.parser_id}/revisions/{left}/diff/?compare_to={right}",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(diff_response.status_code, 200)
        self.assertIn("diff", diff_response.data)

        preview_response = self.client.post(
            f"/api/ingestion/parsers/{self.parser_id}/preview/",
            data={"raw_event": "evento raw di test"},
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(preview_response.status_code, 200)
        self.assertTrue(preview_response.data["ok"])

        create_tc_response = self.client.post(
            f"/api/ingestion/parsers/{self.parser_id}/test-cases/",
            data={
                "name": "TC-1",
                "input_raw": '{"event_id":"tc-1","severity":"high"}',
                "expected_output": {"event": {"id": "tc-1", "severity": "high"}},
            },
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(create_tc_response.status_code, 201, create_tc_response.data)
        test_case_id = create_tc_response.data["id"]

        list_tc_response = self.client.get(
            f"/api/ingestion/parsers/{self.parser_id}/test-cases/",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(list_tc_response.status_code, 200)
        self.assertEqual(len(list_tc_response.data), 1)

        run_all_response = self.client.post(
            f"/api/ingestion/parsers/{self.parser_id}/test-cases/run-all/",
            data={},
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(run_all_response.status_code, 200)
        self.assertEqual(run_all_response.data["passed"], 1)
        self.assertEqual(run_all_response.data["failed"], 0)

        delete_response = self.client.delete(
            f"/api/ingestion/parsers/{self.parser_id}/test-cases/{test_case_id}/",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(delete_response.status_code, 204)
        self.assertFalse(ParserTestCase.objects.filter(id=test_case_id).exists())


class AnalyticsApiTests(BaseTenantTestCase):
    def setUp(self):
        self.client = APIClient()
        self.manager = get_user_model().objects.create_user(
            username="analytics-manager",
            password="Manager123!",
            role="SOC_MANAGER",
        )
        self.client.force_authenticate(user=self.manager)

        self.open_state = AlertState.objects.create(name="Open analytics", order=0, is_final=False, is_enabled=True)
        self.closed_state = AlertState.objects.create(name="Closed analytics", order=1, is_final=True, is_enabled=True)
        self.customer = Customer.objects.create(name="Analytics Customer", code="AN")
        self.source = Source.objects.create(
            name="Analytics Source",
            type=Source.Type.REST,
            is_enabled=True,
            severity_map={"field": "severity", "default": "medium", "map": {}},
        )

        now = timezone.now()
        alert_open = Alert.objects.create(
            title="Open analytics alert",
            severity=Alert.Severity.HIGH,
            event_timestamp=now,
            source_name=self.source.name,
            source_id="analytics-open-1",
            customer=self.customer,
            current_state=self.open_state,
            dedup_fingerprint="analytics-open-1",
        )
        alert_closed = Alert.objects.create(
            title="Closed analytics alert",
            severity=Alert.Severity.CRITICAL,
            event_timestamp=now - timedelta(hours=2),
            source_name=self.source.name,
            source_id="analytics-closed-1",
            customer=self.customer,
            current_state=self.closed_state,
            dedup_fingerprint="analytics-closed-1",
        )
        Alert.objects.filter(id=alert_closed.id).update(
            created_at=now - timedelta(hours=4),
            updated_at=now - timedelta(hours=1),
        )
        IngestionRun.objects.create(
            source=self.source,
            customer=self.customer,
            trigger=IngestionRun.Trigger.MANUAL,
            status=IngestionRun.Status.SUCCESS,
            processed_count=50,
            created_count=1,
            updated_count=0,
            error_count=0,
            metadata={},
        )
        SLAConfig.objects.create(severity=Alert.Severity.CRITICAL, response_minutes=60, resolution_minutes=240)
        SLAConfig.objects.create(severity=Alert.Severity.HIGH, response_minutes=120, resolution_minutes=360)

    def test_analytics_endpoints_return_payloads(self):
        params = "from=2026-01-01T00:00:00Z&to=2026-12-31T23:59:59Z"

        overview_response = self.client.get(f"/api/alerts/analytics/overview/?{params}", HTTP_HOST="test.localhost")
        self.assertEqual(overview_response.status_code, 200)
        self.assertIn("kpis", overview_response.data)

        by_source_response = self.client.get(f"/api/alerts/analytics/by-source/?{params}", HTTP_HOST="test.localhost")
        self.assertEqual(by_source_response.status_code, 200)
        self.assertGreaterEqual(len(by_source_response.data), 1)

        by_customer_response = self.client.get(f"/api/alerts/analytics/by-customer/?{params}", HTTP_HOST="test.localhost")
        self.assertEqual(by_customer_response.status_code, 200)
        self.assertGreaterEqual(len(by_customer_response.data), 1)

        heatmap_response = self.client.get(f"/api/alerts/analytics/heatmap/?{params}", HTTP_HOST="test.localhost")
        self.assertEqual(heatmap_response.status_code, 200)
        self.assertIn("matrix", heatmap_response.data)
        self.assertEqual(len(heatmap_response.data["matrix"]), 7)
        self.assertEqual(len(heatmap_response.data["matrix"][0]), 24)


class CustomerMembershipApiTests(BaseTenantTestCase):
    def setUp(self):
        self.client = APIClient()
        self.manager = get_user_model().objects.create_user(
            username="membership-manager",
            password="Manager123!",
            role="SOC_MANAGER",
        )
        self.user = get_user_model().objects.create_user(
            username="membership-analyst",
            password="Analyst123!",
            role="SOC_ANALYST",
        )
        self.client.force_authenticate(user=self.manager)
        self.customer = Customer.objects.create(name="Membership Customer", code="MEM")

    def test_customer_membership_crud_endpoint(self):
        upsert_response = self.client.post(
            f"/api/alerts/customers/{self.customer.id}/memberships/",
            data={"user_id": self.user.id, "scope": "triage", "is_active": True},
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(upsert_response.status_code, 200)
        self.assertEqual(len(upsert_response.data), 1)

        list_response = self.client.get(
            f"/api/alerts/customers/{self.customer.id}/memberships/",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(list_response.data[0]["user_id"], self.user.id)

        delete_response = self.client.delete(
            f"/api/alerts/customers/{self.customer.id}/memberships/",
            data={"user_id": self.user.id},
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(delete_response.status_code, 200)
        self.assertEqual(delete_response.data, [])
