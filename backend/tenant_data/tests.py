from datetime import timedelta
import json

from django.contrib.auth import get_user_model
from django.test import RequestFactory, override_settings
from django.utils import timezone
from django_tenants.test.cases import TenantTestCase
from rest_framework.test import APIClient

from tenant_data.audit import create_audit_log
from tenant_data.ingestion.parser import ParserValidationError, parse_event, parse_parser_config_text
from tenant_data.ingestion.service import run_ingestion_for_source
from tenant_data.models import (
    Alert,
    AlertOccurrence,
    AlertState,
    AlertTag,
    DedupPolicy,
    IngestionEventLog,
    IngestionRun,
    ParserDefinition,
    ParserRevision,
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

        self.alert_1 = Alert.objects.create(
            title="EDR suspicious process",
            severity="high",
            event_timestamp=timezone.now(),
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

        self.alert_2 = Alert.objects.create(
            title="Firewall unusual traffic",
            severity="medium",
            event_timestamp=timezone.now(),
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
            current_state=self.state,
            dedup_fingerprint="search-2",
        )

    def test_search_full_text_and_dynamic_filters(self):
        response = self.client.post(
            "/api/alerts/search/",
            data={
                "text": "ransomware",
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
            "/api/alerts/field-schemas/?source_name=edr-feed",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(response.status_code, 200)
        fields = response.data[0]["fields"]
        fields_map = {item["field"]: item["type"] for item in fields}
        self.assertEqual(fields_map.get("event.id"), "keyword")
        self.assertEqual(fields_map.get("event.risk"), "number")
        self.assertEqual(fields_map.get("event.success"), "boolean")
        self.assertEqual(fields_map.get("event.timestamp"), "date")

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
