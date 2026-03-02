from django.urls import path
from rest_framework.routers import DefaultRouter

from tenant_data.ingestion_views import IngestionRunViewSet, MockRestEventsView, SourceViewSet, WebhookIngestionView

router = DefaultRouter()
router.register("sources", SourceViewSet, basename="ingestion-source")
router.register("runs", IngestionRunViewSet, basename="ingestion-run")

urlpatterns = router.urls + [
    path("webhook/<int:source_id>/", WebhookIngestionView.as_view(), name="ingestion-webhook"),
    path("mock/rest-events/", MockRestEventsView.as_view(), name="mock-rest-events"),
]
