from rest_framework.routers import DefaultRouter

from tenant_data.views import AlertStateViewSet, AlertViewSet, AuditLogViewSet, TagViewSet

router = DefaultRouter()
router.register("alerts", AlertViewSet, basename="alert")
router.register("states", AlertStateViewSet, basename="alert-state")
router.register("tags", TagViewSet, basename="tag")
router.register("audit-logs", AuditLogViewSet, basename="audit-log")

urlpatterns = router.urls
