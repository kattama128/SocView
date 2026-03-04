from rest_framework.permissions import BasePermission

from accounts.rbac import CAP_MANAGE_USERS, CAP_TRIAGE, has_capability


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


class HasCapability(BasePermission):
    required_capability = ""

    def has_permission(self, request, view):
        capability = getattr(view, "required_capability", self.required_capability)
        if not capability:
            return bool(request.user and request.user.is_authenticated)
        return has_capability(request.user, capability)


class CanManageUsers(HasCapability):
    required_capability = CAP_MANAGE_USERS


class CanTriage(HasCapability):
    required_capability = CAP_TRIAGE
