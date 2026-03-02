from rest_framework.permissions import SAFE_METHODS, BasePermission


class TenantSchemaAccessPermission(BasePermission):
    message = "Endpoint disponibile solo su dominio tenant (es. tenant1.localhost)."

    def has_permission(self, request, view):
        tenant = getattr(request, "tenant", None)
        schema_name = getattr(tenant, "schema_name", "")
        return bool(schema_name and schema_name != "public")


class RoleBasedWritePermission(BasePermission):
    """Allow read to any authenticated user; writes only to configured roles."""

    write_roles = ()

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False

        if request.method in SAFE_METHODS:
            return True

        allowed = getattr(view, "write_roles", self.write_roles)
        if user.is_superuser:
            return True

        return user.role in allowed
