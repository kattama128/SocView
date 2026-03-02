from rest_framework.permissions import BasePermission


class RolePermission(BasePermission):
    allowed_roles = ()

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        return request.user.role in self.allowed_roles


class IsSuperAdmin(RolePermission):
    allowed_roles = ("SUPER_ADMIN",)


class IsSocManager(RolePermission):
    allowed_roles = ("SUPER_ADMIN", "SOC_MANAGER")


class IsSocAnalyst(RolePermission):
    allowed_roles = ("SUPER_ADMIN", "SOC_MANAGER", "SOC_ANALYST")
