from rest_framework.routers import DefaultRouter

from django.urls import path

from tenant_data.views import (
    AlertDetailFieldConfigViewSet,
    AlertSearchView,
    AlertStateViewSet,
    AlertViewSet,
    AttachmentDownloadView,
    AuditLogViewSet,
    CustomerViewSet,
    NotificationViewSet,
    SavedSearchViewSet,
    SourceFieldSchemaView,
    TagViewSet,
)

router = DefaultRouter()
router.register("alerts", AlertViewSet, basename="alert")
router.register("customers", CustomerViewSet, basename="customer")
router.register("states", AlertStateViewSet, basename="alert-state")
router.register("tags", TagViewSet, basename="tag")
router.register("audit-logs", AuditLogViewSet, basename="audit-log")
router.register("saved-searches", SavedSearchViewSet, basename="saved-search")
router.register("notifications", NotificationViewSet, basename="notification")
router.register("detail-field-configs", AlertDetailFieldConfigViewSet, basename="alert-detail-field-config")

urlpatterns = router.urls + [
    path("search/", AlertSearchView.as_view(), name="alert-search"),
    path("field-schemas/", SourceFieldSchemaView.as_view(), name="source-field-schema"),
    path("attachments/<int:pk>/download/", AttachmentDownloadView.as_view(), name="attachment-download"),
]
