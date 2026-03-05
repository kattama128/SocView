import re

from django.conf import settings

TENANT_HEADER_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]*$")


class PathTenantRoutingMiddleware:
    """Resolve tenant from X-Tenant header when path routing mode is enabled."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if getattr(settings, "TENANT_ROUTING_MODE", "subdomain") == "path":
            tenant_name = (request.META.get("HTTP_X_TENANT") or "").strip().lower()
            if tenant_name and TENANT_HEADER_PATTERN.match(tenant_name):
                public_domain = getattr(settings, "PUBLIC_SCHEMA_DOMAIN", "localhost") or "localhost"
                host = f"{tenant_name}.{public_domain}"
                request.META["HTTP_HOST"] = host
                request.META["SERVER_NAME"] = host
        return self.get_response(request)


class JWTCookieMiddleware:
    """Inject Authorization header from access_token cookie for SimpleJWT auth."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not request.META.get("HTTP_AUTHORIZATION"):
            cookie_name = getattr(settings, "AUTH_ACCESS_COOKIE_NAME", "access_token")
            token = request.COOKIES.get(cookie_name)
            if token:
                request.META["HTTP_AUTHORIZATION"] = f"Bearer {token}"
        return self.get_response(request)
