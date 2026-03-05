import type { ComponentType } from "react";

import { TimeRangeWindow } from "../contexts/TimeRangeContext";
import KpiAlertAperti from "./KpiAlertAperti";
import KpiMttr from "./KpiMttr";
import KpiSeverityTrend from "./KpiSeverityTrend";

export type WidgetComponentProps = {
  customerId?: number | null;
  timeWindow: TimeRangeWindow;
};

export const widgetRegistry: Record<string, ComponentType<WidgetComponentProps>> = {
  kpi_alert_aperti: KpiAlertAperti,
  kpi_mttr: KpiMttr,
  kpi_severity_trend: KpiSeverityTrend,
};
