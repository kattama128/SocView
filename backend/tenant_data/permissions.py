from rest_framework.permissions import SAFE_METHODS, BasePermission

from accounts.rbac import CAP_TRIAGE, CAP_VIEW, has_capability


class TenantSchemaAccessPermission(BasePermission):
    message = "Endpoint disponibile solo su dominio tenant (es. tenant1.localhost)."

    def has_permission(self, request, view):
        tenant = getattr(request, "tenant", None)
        schema_name = getattr(tenant, "schema_name", "")
        return bool(schema_name and schema_name != "public")


class RoleBasedWritePermission(BasePermission):
    """
    Capability-aware permission gate.

    Backward compatibility:
    - `read_capability` defaults to `view`.
    - `write_capability` defaults to `None` and falls back to `write_roles` if present.
    """

    write_roles = ()
    read_capability = CAP_VIEW
    write_capability = None

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False

        read_capability = getattr(view, "read_capability", self.read_capability)
        write_capability = getattr(view, "write_capability", self.write_capability)

        if request.method in SAFE_METHODS:
            return True if not read_capability else has_capability(user, read_capability)

        if write_capability:
            return has_capability(user, write_capability)

        allowed = getattr(view, "write_roles", self.write_roles)
        if user.is_superuser:
            return True

        return user.role in allowed
