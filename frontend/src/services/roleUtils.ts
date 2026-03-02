export function canWriteAlerts(role?: string): boolean {
  return role === "SUPER_ADMIN" || role === "SOC_MANAGER" || role === "SOC_ANALYST";
}

export function canManageStates(role?: string): boolean {
  return role === "SUPER_ADMIN" || role === "SOC_MANAGER";
}

export function canManageTags(role?: string): boolean {
  return role === "SUPER_ADMIN" || role === "SOC_MANAGER" || role === "SOC_ANALYST";
}
