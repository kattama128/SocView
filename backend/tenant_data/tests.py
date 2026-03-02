from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import RequestFactory
from django.utils import timezone
from django_tenants.test.cases import TenantTestCase

from tenant_data.audit import create_audit_log
from tenant_data.models import Alert, AlertState


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
