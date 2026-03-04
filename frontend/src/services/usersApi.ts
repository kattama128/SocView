import api from "./api";
import { RoleDefinition, UserAccount, UserAccountPayload } from "../types/users";

export async function fetchUserAccounts(): Promise<UserAccount[]> {
  const response = await api.get<UserAccount[]>("/auth/users/");
  return response.data;
}

export async function createUserAccount(payload: UserAccountPayload): Promise<UserAccount> {
  const response = await api.post<UserAccount>("/auth/users/", payload);
  return response.data;
}

export async function updateUserAccount(userId: number, payload: Partial<UserAccountPayload>): Promise<UserAccount> {
  const response = await api.patch<UserAccount>(`/auth/users/${userId}/`, payload);
  return response.data;
}

export async function deactivateUserAccount(userId: number): Promise<UserAccount> {
  const response = await api.delete<UserAccount>(`/auth/users/${userId}/`);
  return response.data;
}

export async function fetchRoles(): Promise<RoleDefinition[]> {
  const response = await api.get<RoleDefinition[]>("/auth/roles/");
  return response.data;
}

export type SecurityAuditEvent = {
  id: number;
  created_at: string;
  actor: number | null;
  actor_username: string;
  action: string;
  object_type: string;
  object_id: string;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string;
};

export async function fetchSecurityAuditEvents(limit = 30): Promise<SecurityAuditEvent[]> {
  const response = await api.get<SecurityAuditEvent[]>("/auth/security-audit/", {
    params: { page_size: limit },
  });
  if (Array.isArray(response.data)) {
    return response.data.slice(0, limit);
  }
  const paginated = response.data as { results?: SecurityAuditEvent[] };
  return (paginated.results ?? []).slice(0, limit);
}
