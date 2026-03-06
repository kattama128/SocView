from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient


class CoreAdminEndpointsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = get_user_model().objects.create_user(
            username="core-super-admin",
            password="Admin123!",
            role=get_user_model().Role.SUPER_ADMIN,
            is_superuser=True,
            is_staff=True,
        )
        self.client.force_authenticate(user=self.admin)

    def test_tenants_list_and_domain_check_and_onboarding(self):
        tenants_response = self.client.get("/api/core/tenants/", HTTP_HOST="localhost")
        self.assertEqual(tenants_response.status_code, 200)
        self.assertTrue(isinstance(tenants_response.data, list))

        domain_response = self.client.get(
            "/api/core/tenants/check-domain/?domain=new-tenant.localhost",
            HTTP_HOST="localhost",
        )
        self.assertEqual(domain_response.status_code, 200)
        self.assertIn("available", domain_response.data)

        patch_response = self.client.patch(
            "/api/core/onboarding/tenant_test/",
            data={"value": {"step": 2, "completed": False}},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(patch_response.status_code, 200)
        get_response = self.client.get("/api/core/onboarding/tenant_test/", HTTP_HOST="localhost")
        self.assertEqual(get_response.status_code, 200)
        self.assertEqual(get_response.data["value"]["step"], 2)

    @patch("core.views.create_tenant_task")
    def test_create_tenant_and_task_status_endpoints(self, mocked_task):
        mocked_task.delay = Mock(return_value=Mock(id="task-123"))

        create_response = self.client.post(
            "/api/core/tenants/",
            data={
                "name": "Tenant Nuovo",
                "domain": "tenant-nuovo.localhost",
                "schema_name": "tenant_nuovo",
            },
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(create_response.status_code, 202)
        self.assertEqual(create_response.data["task_id"], "task-123")

        task_status_response = self.client.get("/api/core/tasks/task-123/status/", HTTP_HOST="localhost")
        self.assertEqual(task_status_response.status_code, 200)
        self.assertIn("status", task_status_response.data)

    @patch("core.views.schema_context")
    @patch("core.views.get_tenant_domain_model")
    @patch("core.views.get_tenant_model")
    def test_tenants_list_treats_null_paid_until_as_active(self, mocked_tenant_model, mocked_domain_model, mocked_schema_context):
        tenant = Mock()
        tenant.id = 99
        tenant.schema_name = "tenant_null"
        tenant.name = "Tenant Null"
        tenant.on_trial = False
        tenant.paid_until = None
        mocked_tenant_model.return_value.objects.all.return_value.order_by.return_value = [tenant]
        mocked_domain_model.return_value.objects.filter.return_value.only.return_value = []
        mocked_schema_context.return_value.__enter__.return_value = None
        mocked_schema_context.return_value.__exit__.return_value = False

        response = self.client.get("/api/core/tenants/", HTTP_HOST="localhost")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]["status"], "active")
