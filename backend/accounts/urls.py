from django.urls import include, path
from rest_framework.routers import SimpleRouter

from .views import (
    CurrentUserView,
    CustomTokenObtainPairView,
    CustomTokenRefreshView,
    RolesView,
    SecurityAuditEventViewSet,
    UsersManagementViewSet,
)

router = SimpleRouter()
router.register("users", UsersManagementViewSet, basename="users")
router.register("security-audit", SecurityAuditEventViewSet, basename="security-audit")

urlpatterns = [
    path("token/", CustomTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("token/refresh/", CustomTokenRefreshView.as_view(), name="token_refresh"),
    path("me/", CurrentUserView.as_view(), name="current_user"),
    path("roles/", RolesView.as_view(), name="roles_list"),
    path("", include(router.urls)),
]
