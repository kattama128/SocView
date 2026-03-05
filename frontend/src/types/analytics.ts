export type AnalyticsOverviewResponse = {
  kpis: {
    total_alerts: number;
    closure_rate: number;
    mttr_hours: number | null;
    critical_alerts: number;
  };
  alerts_by_day: Array<{
    day: string;
    critical: number;
    high: number;
    medium: number;
    low: number;
  }>;
  state_distribution: Array<{
    state: string;
    count: number;
  }>;
  mttr_daily: Array<{
    day: string;
    mttr_hours: number | null;
  }>;
};

export type AnalyticsBySourceItem = {
  source_name: string;
  source_id: number | null;
  alert_total: number;
  critical_percentage: number;
  mttr_hours: number | null;
  records_ingested_total: number;
};

export type AnalyticsByCustomerItem = {
  customer_id: number | null;
  customer_name: string;
  open_alerts: number;
  sla_compliance: number;
  assigned_analysts: number;
};

export type AnalyticsHeatmapResponse = {
  matrix: number[][];
};
