from rest_framework.permissions import SAFE_METHODS, BasePermission


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
