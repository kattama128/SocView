import api from "./api";

export type TenantAdminItem = {
  id: number;
  schema_name: string;
  name: string;
  domain: string;
  on_trial: boolean;
  status: string;
  alert_count: number;
};

export async function fetchTenantsAdmin(): Promise<TenantAdminItem[]> {
  const response = await api.get<TenantAdminItem[]>("/core/tenants/");
  return response.data;
}

export async function checkTenantDomain(domain: string): Promise<{ available: boolean }> {
  const response = await api.get<{ available: boolean }>("/core/tenants/check-domain/", {
    params: { domain },
  });
  return response.data;
}

export async function createTenantAsync(payload: {
  name: string;
  domain: string;
  schema_name: string;
}): Promise<{ task_id: string }> {
  const response = await api.post<{ task_id: string }>("/core/tenants/", payload);
  return response.data;
}

export async function fetchTaskStatus(taskId: string): Promise<{
  task_id: string;
  status: string;
  result?: Record<string, unknown>;
  error?: string;
}> {
  const response = await api.get<{
    task_id: string;
    status: string;
    result?: Record<string, unknown>;
    error?: string;
  }>(`/core/tasks/${taskId}/status/`);
  return response.data;
}

export async function fetchOnboardingPreference(tenantKey: string): Promise<{ key: string; value: Record<string, unknown> }> {
  const response = await api.get<{ key: string; value: Record<string, unknown> }>(`/core/onboarding/${tenantKey}/`);
  return response.data;
}

export async function updateOnboardingPreference(
  tenantKey: string,
  value: Record<string, unknown>,
): Promise<{ key: string; value: Record<string, unknown> }> {
  const response = await api.patch<{ key: string; value: Record<string, unknown> }>(`/core/onboarding/${tenantKey}/`, {
    value,
  });
  return response.data;
}
