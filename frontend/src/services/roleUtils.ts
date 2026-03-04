import { PermissionMap } from "../types/users";

function resolvePermission(
  permissions: PermissionMap | undefined,
  role: string | undefined,
  capability: keyof PermissionMap,
): boolean {
  if (permissions) {
    return Boolean(permissions[capability]);
  }
  if (capability === "triage") {
    return role === "SUPER_ADMIN" || role === "SOC_MANAGER" || role === "SOC_ANALYST";
  }
  if (capability === "manage_sources" || capability === "manage_customers" || capability === "manage_users") {
    return role === "SUPER_ADMIN" || role === "SOC_MANAGER";
  }
  if (capability === "view" || capability === "export") {
    return Boolean(role);
  }
  if (capability === "admin") {
    return role === "SUPER_ADMIN";
  }
  return false;
}

export function canWriteAlerts(role?: string, permissions?: PermissionMap): boolean {
  return resolvePermission(permissions, role, "triage");
}

export function canManageStates(role?: string, permissions?: PermissionMap): boolean {
  return resolvePermission(permissions, role, "manage_customers");
}

export function canManageTags(role?: string, permissions?: PermissionMap): boolean {
  return resolvePermission(permissions, role, "triage");
}

export function canManageSources(role?: string, permissions?: PermissionMap): boolean {
  return resolvePermission(permissions, role, "manage_sources");
}

export function canManageUsers(role?: string, permissions?: PermissionMap): boolean {
  return resolvePermission(permissions, role, "manage_users");
}

export function canExport(role?: string, permissions?: PermissionMap): boolean {
  return resolvePermission(permissions, role, "export");
}
