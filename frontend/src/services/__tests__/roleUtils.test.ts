import { describe, expect, it } from "vitest";
import {
  canExport,
  canManageSources,
  canManageUsers,
  canWriteAlerts,
} from "../roleUtils";
import { PermissionMap } from "../../types/users";

const nonePermissions: PermissionMap = {
  view: false,
  triage: false,
  manage_sources: false,
  manage_customers: false,
  manage_users: false,
  export: false,
  admin: false,
};

describe("roleUtils", () => {
  it("uses explicit permission map over role fallback", () => {
    expect(canManageUsers("SUPER_ADMIN", nonePermissions)).toBe(false);
    expect(canWriteAlerts("SOC_ANALYST", nonePermissions)).toBe(false);
  });

  it("falls back to role-based permissions when map is missing", () => {
    expect(canWriteAlerts("SOC_ANALYST")).toBe(true);
    expect(canManageSources("SOC_MANAGER")).toBe(true);
    expect(canManageUsers("SOC_ANALYST")).toBe(false);
    expect(canExport("READ_ONLY")).toBe(true);
  });
});
