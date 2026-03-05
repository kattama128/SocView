from django.urls import path

from .views import (
    CheckTenantDomainView,
    CurrentContextView,
    DashboardTenantsReorderView,
    DashboardTenantsView,
    DashboardWidgetsView,
    OnboardingPreferenceView,
    TaskStatusView,
    TenantsAdminView,
)

urlpatterns = [
    path("context/", CurrentContextView.as_view(), name="current-context"),
    path("dashboard/widgets/", DashboardWidgetsView.as_view(), name="dashboard-widgets"),
    path("dashboard/tenants/", DashboardTenantsView.as_view(), name="dashboard-tenants"),
    path("dashboard/tenants/reorder/", DashboardTenantsReorderView.as_view(), name="dashboard-tenants-reorder"),
    path("tenants/", TenantsAdminView.as_view(), name="core-tenants"),
    path("tenants/check-domain/", CheckTenantDomainView.as_view(), name="core-tenants-check-domain"),
    path("tasks/<str:task_id>/status/", TaskStatusView.as_view(), name="core-task-status"),
    path("onboarding/<str:tenant_key>/", OnboardingPreferenceView.as_view(), name="core-onboarding-preference"),
]
