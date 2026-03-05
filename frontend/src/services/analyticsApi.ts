import api from "./api";
import {
  AnalyticsByCustomerItem,
  AnalyticsBySourceItem,
  AnalyticsHeatmapResponse,
  AnalyticsOverviewResponse,
} from "../types/analytics";

type RangeParams = {
  from: string;
  to: string;
};

export async function fetchAnalyticsOverview(params: RangeParams): Promise<AnalyticsOverviewResponse> {
  const response = await api.get<AnalyticsOverviewResponse>("/alerts/analytics/overview/", { params });
  return response.data;
}

export async function fetchAnalyticsBySource(params: RangeParams): Promise<AnalyticsBySourceItem[]> {
  const response = await api.get<AnalyticsBySourceItem[]>("/alerts/analytics/by-source/", { params });
  return response.data;
}

export async function fetchAnalyticsByCustomer(params: RangeParams): Promise<AnalyticsByCustomerItem[]> {
  const response = await api.get<AnalyticsByCustomerItem[]>("/alerts/analytics/by-customer/", { params });
  return response.data;
}

export async function fetchAnalyticsHeatmap(params: RangeParams): Promise<AnalyticsHeatmapResponse> {
  const response = await api.get<AnalyticsHeatmapResponse>("/alerts/analytics/heatmap/", { params });
  return response.data;
}
