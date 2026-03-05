from __future__ import annotations

from urllib.parse import parse_qs

from asgiref.sync import sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import AccessToken

User = get_user_model()


def _extract_tenant_from_scope(scope, query_params: dict[str, list[str]]) -> str:
    tenant = (query_params.get("tenant") or [None])[0]
    if tenant:
        return tenant.strip().lower()

    path = (scope.get("path") or "").strip()
    if path.startswith("/t/"):
        pieces = path.split("/")
        if len(pieces) > 2 and pieces[2]:
            return pieces[2].strip().lower()

    host = ""
    for name, value in scope.get("headers", []):
        if name == b"host":
            host = value.decode("utf-8", errors="ignore").split(":")[0].strip().lower()
            break
    if host and host not in {"localhost", "127.0.0.1", "0.0.0.0"} and "." in host:
        subdomain = host.split(".")[0]
        if subdomain:
            return subdomain
    return "public"


@sync_to_async
def _validate_user_from_token(raw_token: str):
    token = AccessToken(raw_token)
    user_id = token.get("user_id")
    if not user_id:
        return None
    user = User.objects.filter(id=user_id, is_active=True).first()
    return user


class NotificationConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        query_string = self.scope.get("query_string", b"").decode("utf-8")
        query_params = parse_qs(query_string)
        token = (query_params.get("token") or [None])[0]
        if not token:
            await self.close(code=4401)
            return

        user = await _validate_user_from_token(token)
        if user is None:
            await self.close(code=4401)
            return

        tenant = _extract_tenant_from_scope(self.scope, query_params)
        self.user_group_name = f"notifications_user_{user.id}"
        self.tenant_group_name = f"notifications_tenant_{tenant}"

        await self.channel_layer.group_add(self.user_group_name, self.channel_name)
        await self.channel_layer.group_add(self.tenant_group_name, self.channel_name)
        await self.accept()
        await self.send_json({"type": "connected", "tenant": tenant, "user_id": user.id})

    async def disconnect(self, close_code):
        if getattr(self, "user_group_name", None):
            await self.channel_layer.group_discard(self.user_group_name, self.channel_name)
        if getattr(self, "tenant_group_name", None):
            await self.channel_layer.group_discard(self.tenant_group_name, self.channel_name)

    async def notification_message(self, event):
        await self.send_json({"type": "notification", "payload": event.get("payload", {})})
