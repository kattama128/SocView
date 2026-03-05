import api from "./api";
import {
  DashboardTenantSummary,
  DashboardWidgetLayoutItem,
  DashboardWidgetsPayload,
} from "../types/dashboard";

type DashboardTimeWindow = {
  from: string;
  to: string;
};

function customerParams(customerId?: number | null) {
  return customerId ? { customer_id: customerId } : undefined;
}

export async function fetchDashboardWidgets(
  customerId?: number | null,
  timeWindow?: DashboardTimeWindow,
): Promise<DashboardWidgetsPayload> {
  const response = await api.get<DashboardWidgetsPayload>("/core/dashboard/widgets/", {
    params: {
      ...(customerParams(customerId) ?? {}),
      ...(timeWindow ? { from: timeWindow.from, to: timeWindow.to } : {}),
    },
  });
  return response.data;
}

export async function updateDashboardWidgetsLayout(
  widgetsLayout: DashboardWidgetLayoutItem[],
  customerId?: number | null,
  timeWindow?: DashboardTimeWindow,
): Promise<DashboardWidgetsPayload> {
  const response = await api.put<DashboardWidgetsPayload>("/core/dashboard/widgets/", {
    widgets_layout: widgetsLayout,
  }, {
    params: {
      ...(customerParams(customerId) ?? {}),
      ...(timeWindow ? { from: timeWindow.from, to: timeWindow.to } : {}),
    },
  });
  return response.data;
}

export async function fetchDashboardTenants(): Promise<DashboardTenantSummary[]> {
  const response = await api.get<DashboardTenantSummary[]>("/core/dashboard/tenants/");
  return response.data;
}

export async function reorderDashboardTenants(schemaOrder: string[]): Promise<string[]> {
  const response = await api.post<{ schema_order: string[] }>("/core/dashboard/tenants/reorder/", {
    schema_order: schemaOrder,
  });
  return response.data.schema_order;
}
