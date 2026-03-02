from django.urls import path

from .views import DashboardTenantsReorderView, DashboardTenantsView, DashboardWidgetsView, CurrentContextView

urlpatterns = [
    path("context/", CurrentContextView.as_view(), name="current-context"),
    path("dashboard/widgets/", DashboardWidgetsView.as_view(), name="dashboard-widgets"),
    path("dashboard/tenants/", DashboardTenantsView.as_view(), name="dashboard-tenants"),
    path("dashboard/tenants/reorder/", DashboardTenantsReorderView.as_view(), name="dashboard-tenants-reorder"),
]
