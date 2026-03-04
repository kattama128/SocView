from __future__ import annotations

import copy

from tenant_data.models import Source


STATUS_GA = "ga"
STATUS_BETA = "beta"
STATUS_PLANNED = "planned"


SOURCE_TYPE_CAPABILITY_MATRIX: dict[str, dict] = {
    Source.Type.IMAP: {
        "label": "IMAP Mailbox",
        "status": STATUS_GA,
        "is_operational": True,
        "create_enabled": True,
        "supports_test_connection": True,
        "supports_run_now": True,
        "supports_polling": True,
        "supports_push": False,
        "notes": "Polling mailbox IMAP con parsing email/headers/attachments.",
    },
    Source.Type.REST: {
        "label": "REST Poll/Push",
        "status": STATUS_GA,
        "is_operational": True,
        "create_enabled": True,
        "supports_test_connection": True,
        "supports_run_now": True,
        "supports_polling": True,
        "supports_push": False,
        "notes": "Ingestion REST via polling API con auth headers/token/basic e paginazione.",
    },
    Source.Type.WEBHOOK: {
        "label": "Webhook HTTP",
        "status": STATUS_GA,
        "is_operational": True,
        "create_enabled": True,
        "supports_test_connection": True,
        "supports_run_now": False,
        "supports_polling": False,
        "supports_push": True,
        "notes": "Push ingestion HTTP autenticato con API key e rate limiting.",
    },
    Source.Type.SYSLOG_UDP: {
        "label": "Syslog UDP",
        "status": STATUS_PLANNED,
        "is_operational": False,
        "create_enabled": False,
        "supports_test_connection": False,
        "supports_run_now": False,
        "supports_polling": False,
        "supports_push": False,
        "notes": "Planned: collector listener UDP non ancora implementato.",
    },
    Source.Type.SYSLOG_TCP: {
        "label": "Syslog TCP",
        "status": STATUS_PLANNED,
        "is_operational": False,
        "create_enabled": False,
        "supports_test_connection": False,
        "supports_run_now": False,
        "supports_polling": False,
        "supports_push": False,
        "notes": "Planned: collector listener TCP non ancora implementato.",
    },
    Source.Type.KAFKA_TOPIC: {
        "label": "Kafka Topic",
        "status": STATUS_PLANNED,
        "is_operational": False,
        "create_enabled": False,
        "supports_test_connection": False,
        "supports_run_now": False,
        "supports_polling": False,
        "supports_push": False,
        "notes": "Planned: consumer Kafka non ancora implementato.",
    },
    Source.Type.S3_BUCKET: {
        "label": "S3 Bucket",
        "status": STATUS_PLANNED,
        "is_operational": False,
        "create_enabled": False,
        "supports_test_connection": False,
        "supports_run_now": False,
        "supports_polling": False,
        "supports_push": False,
        "notes": "Planned: scanner bucket S3 non ancora implementato.",
    },
    Source.Type.AZURE_EVENT_HUB: {
        "label": "Azure Event Hub",
        "status": STATUS_PLANNED,
        "is_operational": False,
        "create_enabled": False,
        "supports_test_connection": False,
        "supports_run_now": False,
        "supports_polling": False,
        "supports_push": False,
        "notes": "Planned: consumer Event Hub non ancora implementato.",
    },
    Source.Type.GCP_PUBSUB: {
        "label": "GCP Pub/Sub",
        "status": STATUS_PLANNED,
        "is_operational": False,
        "create_enabled": False,
        "supports_test_connection": False,
        "supports_run_now": False,
        "supports_polling": False,
        "supports_push": False,
        "notes": "Planned: subscriber Pub/Sub non ancora implementato.",
    },
    Source.Type.SFTP_DROP: {
        "label": "SFTP Drop",
        "status": STATUS_PLANNED,
        "is_operational": False,
        "create_enabled": False,
        "supports_test_connection": False,
        "supports_run_now": False,
        "supports_polling": False,
        "supports_push": False,
        "notes": "Planned: polling directory SFTP non ancora implementato.",
    },
}


CANARY_TOOLS_PARSER_CONFIG = """{
  "extract": [
    { "type": "jsonpath", "name": "event_id", "path": "$.id" },
    { "type": "jsonpath", "name": "title", "path": "$.memo" },
    { "type": "jsonpath", "name": "severity", "path": "$.severity" },
    { "type": "jsonpath", "name": "token_name", "path": "$.canarytoken" },
    { "type": "jsonpath", "name": "src_ip", "path": "$.src_host" },
    { "type": "jsonpath", "name": "event_timestamp", "path": "$.created" }
  ],
  "transform": [
    {
      "type": "map_values",
      "field": "severity",
      "map": {
        "critical": "critical",
        "high": "high",
        "medium": "medium",
        "low": "low",
        "info": "low",
        "informational": "low"
      }
    }
  ],
  "normalize": {
    "ecs": {
      "event.id": "event_id",
      "event.summary": "title",
      "event.severity": "severity",
      "event.created": "event_timestamp",
      "threat.indicator": "token_name",
      "source.ip": "src_ip",
      "severity": "severity",
      "event_timestamp": "event_timestamp"
    }
  },
  "output": { "mode": "normalized" }
}"""


SENTINEL_ONE_PARSER_CONFIG = """{
  "extract": [
    { "type": "jsonpath", "name": "event_id", "path": "$.id" },
    { "type": "jsonpath", "name": "classification", "path": "$.threatInfo.classification" },
    { "type": "jsonpath", "name": "confidence", "path": "$.threatInfo.confidenceLevel" },
    { "type": "jsonpath", "name": "agent_name", "path": "$.agentComputerName" },
    { "type": "jsonpath", "name": "site_name", "path": "$.siteName" },
    { "type": "jsonpath", "name": "mitigation_status", "path": "$.mitigationStatus" },
    { "type": "jsonpath", "name": "event_timestamp", "path": "$.createdAt" }
  ],
  "transform": [
    {
      "type": "map_values",
      "field": "confidence",
      "map": {
        "malicious": "critical",
        "suspicious": "high",
        "true_positive": "high",
        "benign": "low"
      }
    },
    {
      "type": "concat",
      "target": "title",
      "fields": ["classification", "agent_name"],
      "separator": " @ "
    },
    {
      "type": "rename",
      "from": "confidence",
      "to": "severity"
    }
  ],
  "normalize": {
    "ecs": {
      "event.id": "event_id",
      "event.summary": "title",
      "event.severity": "severity",
      "event.created": "event_timestamp",
      "host.name": "agent_name",
      "observer.name": "site_name",
      "event.outcome": "mitigation_status",
      "severity": "severity",
      "event_timestamp": "event_timestamp"
    }
  },
  "output": { "mode": "normalized" }
}"""


SOURCE_PRESETS: dict[str, dict] = {
    "canary_tools_rest": {
        "key": "canary_tools_rest",
        "label": "Canary Tools (REST Poll)",
        "description": "Preset REST reale per incident feed Canary Tools + parser dedicato.",
        "type": Source.Type.REST,
        "status": STATUS_GA,
        "auto_parser": True,
        "source_payload": {
            "name": "Canary Tools Incident Feed",
            "description": "Polling incidenti Canary Tools (API v1 incidents).",
            "type": Source.Type.REST,
            "is_enabled": True,
            "severity_map": {
                "field": "severity",
                "default": "medium",
                "map": {
                    "critical": "critical",
                    "high": "high",
                    "medium": "medium",
                    "low": "low",
                    "info": "low",
                },
            },
            "config": {
                "config_json": {
                    "vendor": "canary_tools",
                    "url": "https://EXAMPLE.canary.tools/api/v1/incidents/unacknowledged",
                    "method": "GET",
                    "timeout": 20,
                    "results_path": "incidents",
                    "headers": {"Accept": "application/json"},
                    "auth": {"type": "token", "prefix": "Token", "token": "REPLACE_WITH_CANARY_API_TOKEN"},
                    "pagination": {
                        "type": "page",
                        "param": "page",
                        "start": 1,
                        "max_pages": 10,
                        "results_path": "incidents",
                    },
                    "healthcheck_url": "https://EXAMPLE.canary.tools/api/v1/incidents?count=1",
                    "healthcheck_method": "GET",
                },
                "poll_interval_seconds": 120,
                "rate_limit_per_minute": 30,
            },
            "dedup_policy": {"fingerprint_fields": ["event_id"], "strategy": "increment_occurrence"},
            "alert_type_rules": [],
        },
        "parser": {
            "name": "Canary Tools Parser",
            "description": "Parser normalizzazione eventi Canary Tools.",
            "config_text": CANARY_TOOLS_PARSER_CONFIG,
        },
    },
    "sentinelone_rest": {
        "key": "sentinelone_rest",
        "label": "SentinelOne (REST Poll)",
        "description": "Preset REST reale per SentinelOne API threats/activities + parser dedicato.",
        "type": Source.Type.REST,
        "status": STATUS_GA,
        "auto_parser": True,
        "source_payload": {
            "name": "SentinelOne Threat Feed",
            "description": "Polling SentinelOne /web/api/v2.1 threats.",
            "type": Source.Type.REST,
            "is_enabled": True,
            "severity_map": {
                "field": "severity",
                "default": "medium",
                "map": {
                    "critical": "critical",
                    "high": "high",
                    "medium": "medium",
                    "low": "low",
                    "malicious": "critical",
                    "suspicious": "high",
                },
            },
            "config": {
                "config_json": {
                    "vendor": "sentinelone",
                    "url": "https://YOUR-S1-CONSOLE/web/api/v2.1/threats?limit=200",
                    "method": "GET",
                    "timeout": 20,
                    "results_path": "data",
                    "headers": {"Accept": "application/json"},
                    "auth": {"type": "token", "prefix": "ApiToken", "token": "REPLACE_WITH_SENTINELONE_APITOKEN"},
                    "healthcheck_url": "https://YOUR-S1-CONSOLE/web/api/v2.1/users?limit=1",
                    "healthcheck_method": "GET",
                },
                "poll_interval_seconds": 60,
                "rate_limit_per_minute": 60,
            },
            "dedup_policy": {"fingerprint_fields": ["event_id"], "strategy": "increment_occurrence"},
            "alert_type_rules": [],
        },
        "parser": {
            "name": "SentinelOne Parser",
            "description": "Parser normalizzazione eventi SentinelOne.",
            "config_text": SENTINEL_ONE_PARSER_CONFIG,
        },
    },
}


def source_type_capability(source_type: str) -> dict | None:
    capability = SOURCE_TYPE_CAPABILITY_MATRIX.get(source_type)
    if not capability:
        return None
    payload = dict(capability)
    payload["type"] = source_type
    return payload


def list_source_type_capabilities() -> list[dict]:
    payload = []
    for source_type, _label in Source.Type.choices:
        capability = source_type_capability(source_type)
        if not capability:
            continue
        payload.append(capability)
    return payload


def is_source_type_create_enabled(source_type: str) -> bool:
    capability = source_type_capability(source_type)
    if not capability:
        return False
    return bool(capability.get("create_enabled"))


def list_source_presets() -> list[dict]:
    payload = []
    for preset in SOURCE_PRESETS.values():
        payload.append(
            {
                "key": preset["key"],
                "label": preset["label"],
                "description": preset["description"],
                "source_type": preset["type"],
                "status": preset["status"],
                "auto_parser": bool(preset.get("auto_parser", False)),
            }
        )
    return payload


def get_source_preset(preset_key: str) -> dict | None:
    preset = SOURCE_PRESETS.get(preset_key)
    if not preset:
        return None
    return copy.deepcopy(preset)
