from django.urls import path

from .views import TenantContextView, TenantsListView

urlpatterns = [
    path("tenant-context/", TenantContextView.as_view(), name="tenant-context"),
    path("tenants/", TenantsListView.as_view(), name="tenants-list"),
]
