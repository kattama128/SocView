from django.urls import path

from .views import CurrentContextView

urlpatterns = [
    path("context/", CurrentContextView.as_view(), name="current-context"),
]
