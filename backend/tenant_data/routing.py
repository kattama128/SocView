from django.urls import re_path

from tenant_data.consumers import NotificationConsumer

websocket_urlpatterns = [
    re_path(r"^ws/notifications/$", NotificationConsumer.as_asgi()),
    re_path(r"^t/(?P<tenant>[a-zA-Z0-9_-]+)/ws/notifications/$", NotificationConsumer.as_asgi()),
]
