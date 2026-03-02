from rest_framework.routers import DefaultRouter

from django.urls import path

from tenant_data.views import (
    AlertSearchView,
    AlertStateViewSet,
    AlertViewSet,
    AuditLogViewSet,
    NotificationViewSet,
    SavedSearchViewSet,
    SourceFieldSchemaView,
    TagViewSet,
)

router = DefaultRouter()
router.register("alerts", AlertViewSet, basename="alert")
router.register("states", AlertStateViewSet, basename="alert-state")
router.register("tags", TagViewSet, basename="tag")
router.register("audit-logs", AuditLogViewSet, basename="audit-log")
router.register("saved-searches", SavedSearchViewSet, basename="saved-search")
router.register("notifications", NotificationViewSet, basename="notification")

urlpatterns = router.urls + [
    path("search/", AlertSearchView.as_view(), name="alert-search"),
    path("field-schemas/", SourceFieldSchemaView.as_view(), name="source-field-schema"),
]
