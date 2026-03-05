from django.urls import include, path
from rest_framework.routers import SimpleRouter

from .views import (
    CSRFTokenView,
    CurrentUserView,
    CustomTokenObtainPairView,
    CustomTokenRefreshView,
    LogoutView,
    RolesView,
    SecurityAuditEventViewSet,
    TokenCookieMigrationView,
    UsersManagementViewSet,
    WebSocketTokenView,
)

router = SimpleRouter()
router.register("users", UsersManagementViewSet, basename="users")
router.register("security-audit", SecurityAuditEventViewSet, basename="security-audit")

urlpatterns = [
    path("csrf/", CSRFTokenView.as_view(), name="csrf_token"),
    path("token/", CustomTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("token/refresh/", CustomTokenRefreshView.as_view(), name="token_refresh"),
    path("token/migrate/", TokenCookieMigrationView.as_view(), name="token_cookie_migrate"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("me/", CurrentUserView.as_view(), name="current_user"),
    path("ws-token/", WebSocketTokenView.as_view(), name="ws_token"),
    path("roles/", RolesView.as_view(), name="roles_list"),
    path("", include(router.urls)),
]
