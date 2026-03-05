import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "socview.settings")

django_asgi_app = get_asgi_application()

try:
    from channels.routing import ProtocolTypeRouter, URLRouter

    from tenant_data.routing import websocket_urlpatterns

    application = ProtocolTypeRouter(
        {
            "http": django_asgi_app,
            "websocket": URLRouter(websocket_urlpatterns),
        }
    )
except Exception:
    # Fallback mode: keep HTTP fully functional when channels dependencies are unavailable.
    application = django_asgi_app
