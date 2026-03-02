from datetime import timedelta
from copy import deepcopy
import json

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone
from django_tenants.utils import get_tenant_domain_model, get_tenant_model, schema_context

from accounts.models import UserDashboardPreference

DEFAULT_STATES = [
    {"name": "Nuovo", "order": 0, "is_final": False, "is_enabled": True},
    {"name": "In lavorazione", "order": 1, "is_final": False, "is_enabled": True},
    {"name": "Risolto", "order": 2, "is_final": True, "is_enabled": True},
    {"name": "Falso positivo", "order": 3, "is_final": True, "is_enabled": True},
]

DEFAULT_TAGS = [
    {"name": "network", "scope": "alert", "color": "#1976d2", "metadata": {}},
    {"name": "malware", "scope": "alert", "color": "#d32f2f", "metadata": {}},
    {"name": "phishing", "scope": "alert", "color": "#ed6c02", "metadata": {}},
    {"name": "critical", "scope": "alert", "color": "#7b1fa2", "metadata": {}},
]

DEFAULT_ALERTS = [
    {
        "title": "Tentativi login anomali su VPN",
        "severity": "high",
        "source_name": "vpn-gateway",
        "source_id": "vpn-001",
        "raw_payload": {"failed_logins": 45, "ip": "203.0.113.10"},
        "parsed_payload": {"country": "IT", "username": "ops.user"},
        "state": "Nuovo",
        "tags": ["network", "critical"],
        "assigned_to": "analyst",
        "comment": "Verificare blocco IP e MFA account coinvolto.",
    },
    {
        "title": "Possibile malware rilevato endpoint",
        "severity": "critical",
        "source_name": "edr",
        "source_id": "edr-992",
        "raw_payload": {"hash": "abc123", "host": "ws-finance-07"},
        "parsed_payload": {"family": "emotet", "score": 95},
        "state": "In lavorazione",
        "tags": ["malware", "critical"],
        "assigned_to": "manager",
        "comment": "Isolare host e avviare triage forense.",
    },
    {
        "title": "Segnalazione phishing da mailbox SOC",
        "severity": "medium",
        "source_name": "mail-sec",
        "source_id": "mail-442",
        "raw_payload": {"sender": "billing@example.net", "attachments": 1},
        "parsed_payload": {"url_reputation": "suspicious"},
        "state": "Risolto",
        "tags": ["phishing"],
        "assigned_to": "analyst",
        "comment": "Campagna bloccata e IOC aggiunti in deny-list.",
    },
]

DEFAULT_SOURCES = [
    {
        "name": "IMAP Demo Inbox",
        "type": "imap",
        "is_enabled": True,
        "severity_map": {
            "field": "severity",
            "default": "medium",
            "map": {"critical": "critical", "high": "high", "medium": "medium", "low": "low"},
        },
        "config": {
            "poll_interval_seconds": 60,
            "rate_limit_per_minute": 60,
            "config_json": {
                "use_mock": True,
                "mock_messages": [
                    {
                        "event_id": "imap-demo-1",
                        "subject": "IMAP suspicious login",
                        "from": "soc@example.local",
                        "date": "2026-01-10T10:30:00Z",
                        "severity": "high",
                        "body": "Tentativo di accesso sospetto su mailbox condivisa.",
                        "headers": {"x-priority": "1"},
                        "attachments": [],
                    },
                    {
                        "event_id": "imap-demo-2",
                        "subject": "IMAP parser failure demo",
                        "from": "soc@example.local",
                        "date": "2026-01-10T10:35:00Z",
                        "severity": "medium",
                        "body": "Messaggio con parse error simulato",
                        "force_parse_error": True,
                        "parse_error_message": "Errore parser simulato da IMAP mock",
                    },
                ],
            },
        },
        "dedup": {"fingerprint_fields": ["event_id", "subject"], "strategy": "increment_occurrence"},
    },
    {
        "name": "REST Demo Feed",
        "type": "rest",
        "is_enabled": True,
        "severity_map": {
            "field": "severity",
            "default": "medium",
            "map": {"critical": "critical", "high": "high", "medium": "medium", "low": "low"},
        },
        "config": {
            "poll_interval_seconds": 90,
            "rate_limit_per_minute": 60,
            "config_json": {
                "url": "http://backend:8000/api/ingestion/mock/rest-events/",
                "method": "GET",
                "headers": {},
                "pagination": {"type": "none"},
            },
        },
        "dedup": {"fingerprint_fields": ["event_id"], "strategy": "increment_occurrence"},
    },
    {
        "name": "Webhook Demo",
        "type": "webhook",
        "is_enabled": True,
        "severity_map": {
            "field": "severity",
            "default": "medium",
            "map": {"critical": "critical", "high": "high", "medium": "medium", "low": "low"},
        },
        "config": {
            "poll_interval_seconds": 300,
            "rate_limit_per_minute": 30,
            "config_json": {"example": "Webhook push source"},
        },
        "dedup": {"fingerprint_fields": ["event_id", "title"], "strategy": "increment_occurrence"},
    },
]

DEFAULT_PARSER_CONFIGS = {
    "imap": {
        "extract": [
            {"type": "jsonpath", "name": "event_id", "path": "$.event_id"},
            {"type": "jsonpath", "name": "subject", "path": "$.subject"},
            {"type": "jsonpath", "name": "severity", "path": "$.severity"},
            {"type": "jsonpath", "name": "timestamp", "path": "$.date"},
            {"type": "jsonpath", "name": "source_email", "path": "$.from"},
            {"type": "jsonpath", "name": "message", "path": "$.body"},
        ],
        "transform": [
            {
                "type": "concat",
                "target": "summary",
                "fields": ["subject", "message"],
                "separator": " | ",
            }
        ],
        "normalize": {
            "ecs": {
                "event.id": "event_id",
                "event.severity": "severity",
                "event.original": "message",
                "source.email": "source_email",
                "@timestamp": "timestamp",
                "event.summary": "summary",
            }
        },
        "output": {
            "mode": "normalized",
        },
    },
    "rest": {
        "extract": [
            {"type": "jsonpath", "name": "event_id", "path": "$.event_id"},
            {"type": "jsonpath", "name": "title", "path": "$.title"},
            {"type": "jsonpath", "name": "severity", "path": "$.severity"},
            {"type": "jsonpath", "name": "timestamp", "path": "$.timestamp"},
            {"type": "jsonpath", "name": "message", "path": "$.message"},
        ],
        "transform": [
            {
                "type": "map_values",
                "field": "severity",
                "map": {"warn": "medium", "crit": "critical"},
                "default": "medium",
            },
            {"type": "concat", "target": "summary", "fields": ["title", "message"], "separator": " - "},
        ],
        "normalize": {
            "ecs": {
                "event.id": "event_id",
                "event.severity": "severity",
                "event.original": "message",
                "@timestamp": "timestamp",
                "event.summary": "summary",
            }
        },
        "output": {"mode": "normalized"},
    },
    "webhook": {
        "extract": [
            {"type": "jsonpath", "name": "event_id", "path": "$.event_id"},
            {"type": "jsonpath", "name": "title", "path": "$.title"},
            {"type": "jsonpath", "name": "severity", "path": "$.severity"},
            {"type": "jsonpath", "name": "timestamp", "path": "$.timestamp"},
            {"type": "jsonpath", "name": "message", "path": "$.message"},
            {
                "type": "grok",
                "source": "message",
                "pattern": "user=%{WORD:user} ip=%{IPV4:ip}",
            },
        ],
        "transform": [
            {"type": "map_values", "field": "severity", "map": {"sev1": "low", "sev2": "medium", "sev3": "high"}}
        ],
        "normalize": {
            "ecs": {
                "event.id": "event_id",
                "event.severity": "severity",
                "event.original": "message",
                "source.ip": "ip",
                "user.name": "user",
                "@timestamp": "timestamp",
            }
        },
        "output": {"mode": "normalized"},
    },
}


class Command(BaseCommand):
    help = "Crea tenant e utenti demo per bootstrap locale"

    def _upsert_users(self, users_payload):
        User = get_user_model()
        seeded = {}

        for payload in users_payload:
            user, _ = User.objects.get_or_create(username=payload["username"], defaults={"email": payload["email"]})
            user.email = payload["email"]
            user.role = payload["role"]
            user.is_superuser = payload["is_superuser"]
            user.is_staff = payload["is_staff"]
            user.is_active = True
            user.set_password(payload["password"])
            user.save()
            seeded[payload["username"]] = user

        return seeded

    def _upsert_dashboard_preferences(self, users_map):
        default_layout = [
            {"key": "alert_trend", "enabled": True, "order": 0},
            {"key": "top_sources", "enabled": True, "order": 1},
            {"key": "state_distribution", "enabled": True, "order": 2},
        ]
        default_order = ["tenant1", "tenant2"]

        for username in ["admin", "manager", "analyst", "readonly"]:
            user = users_map.get(username)
            if not user:
                continue
            UserDashboardPreference.objects.update_or_create(
                user=user,
                defaults={
                    "widgets_layout": default_layout,
                    "tenant_order": default_order,
                },
            )

    def _seed_tenant_core_data(self, schema_name, users_map):
        from tenant_data.models import (
            Alert,
            AlertOccurrence,
            AlertState,
            AlertTag,
            Assignment,
            Comment,
            DedupPolicy,
            ParserDefinition,
            ParserRevision,
            SavedSearch,
            Source,
            SourceConfig,
            Tag,
        )
        from tenant_data.ingestion.parser import validate_parser_config

        states_by_name = {}
        for state_payload in DEFAULT_STATES:
            state, _ = AlertState.objects.update_or_create(
                name=state_payload["name"],
                defaults={
                    "order": state_payload["order"],
                    "is_final": state_payload["is_final"],
                    "is_enabled": state_payload["is_enabled"],
                },
            )
            states_by_name[state.name] = state

        tags_by_name = {}
        for tag_payload in DEFAULT_TAGS:
            tag, _ = Tag.objects.update_or_create(
                name=tag_payload["name"],
                scope=tag_payload["scope"],
                defaults={
                    "color": tag_payload["color"],
                    "metadata": tag_payload["metadata"],
                },
            )
            tags_by_name[tag.name] = tag

        now = timezone.now()
        for index, alert_payload in enumerate(DEFAULT_ALERTS, start=1):
            fingerprint = f"{schema_name}-demo-{index}"
            alert, _ = Alert.objects.update_or_create(
                dedup_fingerprint=fingerprint,
                defaults={
                    "title": alert_payload["title"],
                    "severity": alert_payload["severity"],
                    "event_timestamp": now - timedelta(hours=index * 2),
                    "source_name": alert_payload["source_name"],
                    "source_id": alert_payload["source_id"],
                    "raw_payload": alert_payload["raw_payload"],
                    "parsed_payload": alert_payload["parsed_payload"],
                    "current_state": states_by_name[alert_payload["state"]],
                },
            )

            first_seen = alert.event_timestamp
            last_seen = now - timedelta(minutes=index * 5)
            AlertOccurrence.objects.update_or_create(
                alert=alert,
                defaults={"count": 1 + index, "first_seen": first_seen, "last_seen": last_seen},
            )

            AlertTag.objects.filter(alert=alert).exclude(tag__name__in=alert_payload["tags"]).delete()
            for tag_name in alert_payload["tags"]:
                AlertTag.objects.get_or_create(alert=alert, tag=tags_by_name[tag_name])

            assigned_to = users_map.get(alert_payload["assigned_to"])
            Assignment.objects.update_or_create(
                alert=alert,
                defaults={"assigned_to": assigned_to, "assigned_by": users_map.get("manager") or assigned_to},
            )

            Comment.objects.get_or_create(
                alert=alert,
                body=alert_payload["comment"],
                defaults={"author": users_map.get("manager") or assigned_to},
            )

        for source_payload in DEFAULT_SOURCES:
            config_json = deepcopy(source_payload["config"]["config_json"])
            if source_payload["type"] == "rest":
                headers = dict(config_json.get("headers", {}))
                headers.setdefault("Host", f"{schema_name}.localhost")
                config_json["headers"] = headers

            source, _ = Source.objects.update_or_create(
                name=source_payload["name"],
                type=source_payload["type"],
                defaults={
                    "is_enabled": source_payload["is_enabled"],
                    "severity_map": source_payload["severity_map"],
                },
            )

            SourceConfig.objects.update_or_create(
                source=source,
                defaults={
                    "config_json": config_json,
                    "poll_interval_seconds": source_payload["config"]["poll_interval_seconds"],
                    "rate_limit_per_minute": source_payload["config"]["rate_limit_per_minute"],
                    "secrets_ref": "",
                },
            )

            DedupPolicy.objects.update_or_create(
                source=source,
                defaults={
                    "fingerprint_fields": source_payload["dedup"]["fingerprint_fields"],
                    "strategy": source_payload["dedup"]["strategy"],
                },
            )

            parser_config = DEFAULT_PARSER_CONFIGS.get(source.type)
            if parser_config:
                validated_config = validate_parser_config(parser_config)
                config_text = json.dumps(validated_config, ensure_ascii=False, indent=2)
                parser_definition, _ = ParserDefinition.objects.update_or_create(
                    source=source,
                    defaults={
                        "name": f"{source.name} Parser",
                        "description": f"Parser demo per fonte {source.name}",
                        "is_enabled": True,
                    },
                )

                active_revision = parser_definition.active_revision
                if not active_revision or active_revision.config_text.strip() != config_text.strip():
                    latest = parser_definition.revisions.order_by("-version").first()
                    next_version = (latest.version if latest else 0) + 1
                    revision = ParserRevision.objects.create(
                        parser_definition=parser_definition,
                        version=next_version,
                        config_text=config_text,
                        config_data=validated_config,
                        created_by=users_map.get("manager"),
                    )
                    parser_definition.active_revision = revision
                    parser_definition.save(update_fields=["active_revision", "updated_at"])

        manager_user = users_map.get("manager")
        analyst_user = users_map.get("analyst")
        if manager_user:
            SavedSearch.objects.update_or_create(
                user=manager_user,
                name="Alert aperti critici",
                defaults={
                    "text_query": "",
                    "source_name": "",
                    "state_id": None,
                    "severity": "critical",
                    "is_active": True,
                    "dynamic_filters": [],
                    "ordering": "-event_timestamp",
                    "visible_columns": [
                        "title",
                        "severity",
                        "state",
                        "is_active",
                        "source_name",
                        "event_timestamp",
                    ],
                },
            )

        if analyst_user:
            SavedSearch.objects.update_or_create(
                user=analyst_user,
                name="VPN ad alta severita",
                defaults={
                    "text_query": "vpn",
                    "source_name": "vpn-gateway",
                    "state_id": None,
                    "severity": "high",
                    "is_active": True,
                    "dynamic_filters": [],
                    "ordering": "-event_timestamp",
                    "visible_columns": [
                        "title",
                        "severity",
                        "state",
                        "assignment",
                        "tags",
                        "event_timestamp",
                    ],
                },
            )

    def handle(self, *args, **options):
        User = get_user_model()
        TenantModel = get_tenant_model()
        DomainModel = get_tenant_domain_model()

        paid_until = timezone.now().date() + timedelta(days=365)

        if not TenantModel.objects.filter(schema_name="public").exists():
            public_tenant = TenantModel(
                schema_name="public",
                name="Public",
                paid_until=paid_until,
                on_trial=False,
            )
            public_tenant.auto_create_schema = False
            public_tenant.save()
            self.stdout.write(self.style.SUCCESS("Creato tenant public"))
        else:
            public_tenant = TenantModel.objects.get(schema_name="public")

        public_domain = getattr(settings, "PUBLIC_SCHEMA_DOMAIN", None) or "localhost"
        DomainModel.objects.get_or_create(
            domain=public_domain,
            defaults={"tenant": public_tenant, "is_primary": True},
        )

        demo_tenants = [
            {"schema_name": "tenant1", "name": "Tenant Demo 1", "domain": "tenant1.localhost"},
            {"schema_name": "tenant2", "name": "Tenant Demo 2", "domain": "tenant2.localhost"},
        ]

        for cfg in demo_tenants:
            tenant, created = TenantModel.objects.get_or_create(
                schema_name=cfg["schema_name"],
                defaults={
                    "name": cfg["name"],
                    "paid_until": paid_until,
                    "on_trial": True,
                },
            )
            if created:
                self.stdout.write(self.style.SUCCESS(f"Creato tenant: {cfg['schema_name']}"))
            else:
                tenant.name = cfg["name"]
                tenant.paid_until = paid_until
                tenant.on_trial = True
                tenant.save(update_fields=["name", "paid_until", "on_trial"])
                self.stdout.write(self.style.WARNING(f"Tenant aggiornato: {cfg['schema_name']}"))

            DomainModel.objects.get_or_create(
                domain=cfg["domain"],
                defaults={"tenant": tenant, "is_primary": True},
            )

        users_payload = [
            {
                "username": "admin",
                "password": "Admin123!",
                "email": "admin@socview.local",
                "role": User.Role.SUPER_ADMIN,
                "is_superuser": True,
                "is_staff": True,
            },
            {
                "username": "manager",
                "password": "Manager123!",
                "email": "manager@socview.local",
                "role": User.Role.SOC_MANAGER,
                "is_superuser": False,
                "is_staff": True,
            },
            {
                "username": "analyst",
                "password": "Analyst123!",
                "email": "analyst@socview.local",
                "role": User.Role.SOC_ANALYST,
                "is_superuser": False,
                "is_staff": False,
            },
            {
                "username": "readonly",
                "password": "ReadOnly123!",
                "email": "readonly@socview.local",
                "role": User.Role.READ_ONLY,
                "is_superuser": False,
                "is_staff": False,
            },
        ]

        for schema_name in ["public", "tenant1", "tenant2"]:
            with schema_context(schema_name):
                users_map = self._upsert_users(users_payload)
                if schema_name == "public":
                    self._upsert_dashboard_preferences(users_map)
                for payload in users_payload:
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"Utente pronto ({schema_name}): {payload['username']} ({payload['role']})"
                        )
                    )
                if schema_name != "public":
                    self._seed_tenant_core_data(schema_name, users_map)

        self.stdout.write(self.style.SUCCESS("Seed demo completato"))
