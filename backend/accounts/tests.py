from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.tokens import AccessToken
from django_tenants.test.cases import TenantTestCase


class AuthCookieEndpointsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(
            username="cookie-user",
            password="Cookie123!",
            role=get_user_model().Role.SOC_ANALYST,
        )

    def test_login_sets_http_only_auth_cookies(self):
        response = self.client.post(
            "/api/auth/token/",
            {"username": "cookie-user", "password": "Cookie123!"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("user", response.data)
        self.assertNotIn("access", response.data)
        self.assertNotIn("refresh", response.data)

        access_cookie_name = settings.AUTH_ACCESS_COOKIE_NAME
        refresh_cookie_name = settings.AUTH_REFRESH_COOKIE_NAME
        self.assertIn(access_cookie_name, response.cookies)
        self.assertIn(refresh_cookie_name, response.cookies)
        self.assertTrue(response.cookies[access_cookie_name]["httponly"])
        self.assertTrue(response.cookies[refresh_cookie_name]["httponly"])

    def test_me_endpoint_accepts_access_cookie_via_middleware(self):
        login_response = self.client.post(
            "/api/auth/token/",
            {"username": "cookie-user", "password": "Cookie123!"},
            format="json",
        )
        self.assertEqual(login_response.status_code, status.HTTP_200_OK)

        response = self.client.get("/api/auth/me/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], "cookie-user")

    def test_csrf_endpoint_returns_token_and_sets_cookie(self):
        response = self.client.get("/api/auth/csrf/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("csrfToken", response.data)
        self.assertIn(settings.CSRF_COOKIE_NAME, response.cookies)

    def test_token_migration_endpoint_sets_cookie_from_legacy_tokens(self):
        refresh = RefreshToken.for_user(self.user)
        access = str(refresh.access_token)

        response = self.client.post(
            "/api/auth/token/migrate/",
            {"access": access, "refresh": str(refresh)},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(settings.AUTH_ACCESS_COOKIE_NAME, response.cookies)
        self.assertIn(settings.AUTH_REFRESH_COOKIE_NAME, response.cookies)

        me_response = self.client.get("/api/auth/me/")
        self.assertEqual(me_response.status_code, status.HTTP_200_OK)
        self.assertEqual(me_response.data["username"], "cookie-user")

    def test_ws_token_endpoint_returns_access_token_for_authenticated_user(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/auth/ws-token/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        token = AccessToken(response.data["access"])
        self.assertEqual(token.get("user_id"), self.user.id)


class UserAdminActionsTests(TenantTestCase):
    @classmethod
    def setup_tenant(cls, tenant):
        tenant.name = "Accounts Tenant"
        tenant.paid_until = timezone.now().date()
        tenant.on_trial = True
        return tenant

    @classmethod
    def setup_domain(cls, domain):
        domain.domain = "test.localhost"
        domain.is_primary = True
        return domain

    def setUp(self):
        self.client = APIClient()
        self.manager = get_user_model().objects.create_user(
            username="accounts-manager",
            password="Manager123!",
            role=get_user_model().Role.SUPER_ADMIN,
            is_superuser=True,
            is_staff=True,
        )
        self.target = get_user_model().objects.create_user(
            username="accounts-target",
            password="Target123!",
            role=get_user_model().Role.SOC_ANALYST,
            is_active=True,
        )
        self.client.force_authenticate(user=self.manager)

    def test_set_active_endpoint_updates_status(self):
        response = self.client.post(
            f"/api/auth/users/{self.target.id}/set-active/",
            {"is_active": False},
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.target.refresh_from_db()
        self.assertFalse(self.target.is_active)

    def test_reset_password_endpoint_changes_password(self):
        response = self.client.post(
            f"/api/auth/users/{self.target.id}/reset-password/",
            {"temporary_password": "NuovaPass123!"},
            format="json",
            HTTP_HOST="test.localhost",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.target.refresh_from_db()
        self.assertTrue(self.target.check_password("NuovaPass123!"))
