export type DashboardWidgetDefinition = {
  key: string;
  title: string;
  description: string;
};

export type DashboardWidgetLayoutItem = {
  key: string;
  enabled: boolean;
  order: number;
};

export type DashboardWidget = {
  key: string;
  title: string;
  description: string;
  enabled: boolean;
  order: number;
  data: Record<string, unknown>;
};

export type DashboardWidgetsPayload = {
  available_widgets: DashboardWidgetDefinition[];
  widgets_layout: DashboardWidgetLayoutItem[];
  widgets: DashboardWidget[];
};

export type DashboardTenantSummary = {
  schema_name: string;
  name: string;
  on_trial: boolean;
  active_alerts: number;
  domain: string;
  entry_url: string;
};
