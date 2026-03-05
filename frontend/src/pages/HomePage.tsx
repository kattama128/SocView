import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import SaveIcon from "@mui/icons-material/Save";
import TuneIcon from "@mui/icons-material/Tune";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Collapse,
  Grid,
  IconButton,
  LinearProgress,
  Paper,
  Popover,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
  TableContainer,
  TextField,
  Typography,
} from "@mui/material";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import TimeRangeSelector from "../components/TimeRangeSelector";
import { useCustomer } from "../context/CustomerContext";
import { useTimeRange } from "../contexts/TimeRangeContext";
import { fetchAlert, searchAlerts } from "../services/alertsApi";
import { fetchDashboardTenants, fetchDashboardWidgets, updateDashboardWidgetsLayout } from "../services/dashboardApi";
import { surfaceCardSx } from "../styles/surfaces";
import { Alert as AlertModel } from "../types/alerts";
import { DashboardTenantSummary, DashboardWidgetLayoutItem, DashboardWidgetsPayload } from "../types/dashboard";
import { widgetRegistry } from "../widgets/widgetRegistry";

type SourceItem = { source_name: string; count: number };
type TrendPoint = { day: string; count: number };
type StateItem = { state: string; count: number };
type DragState = { index: number } | null;
type RowSeverity = "Critical" | "Warning" | "Info";
type SortDirection = "asc" | "desc";
type AlarmColumnKey = "severity" | "timestamp" | "description" | "source" | "tenant" | "status";

type RecentRow = {
  id: string;
  alertId: number;
  severity: RowSeverity;
  timestamp: string;
  timestampRaw: number;
  description: string;
  source: string;
  tenant: string;
  status: string;
  parsedFields: Record<string, unknown>;
};

type AlarmDetailState = {
  loading: boolean;
  error: string | null;
  fields: Record<string, unknown> | null;
};

type AlarmColumn = {
  key: AlarmColumnKey;
  label: string;
  minWidth?: number;
};

const panelSx = {
  ...surfaceCardSx,
  backdropFilter: "blur(6px)",
} as const;

const alarmColumns: AlarmColumn[] = [
  { key: "severity", label: "Severity" },
  { key: "timestamp", label: "Timestamp", minWidth: 170 },
  { key: "description", label: "Description", minWidth: 260 },
  { key: "source", label: "Source" },
  { key: "tenant", label: "Cliente", minWidth: 180 },
  { key: "status", label: "Status" },
];

const tableColumnStorageKey = "socview_dashboard_alarm_columns";
const rowLimitStorageKey = "socview_dashboard_alarm_row_limit";
const defaultDashboardLayout: DashboardWidgetLayoutItem[] = [
  { key: "alert_trend", enabled: true, order: 0 },
  { key: "top_sources", enabled: true, order: 1 },
  { key: "state_distribution", enabled: true, order: 2 },
  { key: "kpi_alert_aperti", enabled: true, order: 3 },
  { key: "kpi_mttr", enabled: true, order: 4 },
  { key: "kpi_severity_trend", enabled: true, order: 5 },
];

const defaultAvailableWidgets = [
  { key: "alert_trend", title: "Trend alert nel tempo", description: "Numero alert giornalieri (ultimi 7 giorni)" },
  { key: "top_sources", title: "Top fonti", description: "Fonti con piu alert" },
  { key: "state_distribution", title: "Distribuzione stati workflow", description: "Distribuzione alert per stato corrente" },
  { key: "kpi_alert_aperti", title: "Alert Aperti Oggi", description: "Alert aperti oggi e delta vs ieri" },
  { key: "kpi_mttr", title: "MTTR Medio (ultimi 7gg)", description: "Tempo medio chiusura alert" },
  { key: "kpi_severity_trend", title: "Trend per Severita", description: "Conteggio alert per severita" },
];

function shortDayLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
}

function chartPath(values: number[], width: number, height: number, padding: number): string {
  if (!values.length) {
    return "";
  }
  const max = Math.max(...values, 1);
  const stepX = values.length > 1 ? (width - padding * 2) / (values.length - 1) : 0;
  return values
    .map((value, index) => {
      const x = padding + index * stepX;
      const y = height - padding - (value / max) * (height - padding * 2);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function loadStoredColumns(): AlarmColumnKey[] {
  try {
    const raw = localStorage.getItem(tableColumnStorageKey);
    if (!raw) {
      return alarmColumns.map((item) => item.key);
    }
    const parsed = JSON.parse(raw) as AlarmColumnKey[];
    const valid = parsed.filter((key) => alarmColumns.some((item) => item.key === key));
    return valid.length ? valid : alarmColumns.map((item) => item.key);
  } catch {
    return alarmColumns.map((item) => item.key);
  }
}

function loadStoredRowLimit(): number {
  const raw = localStorage.getItem(rowLimitStorageKey);
  const parsed = raw ? Number(raw) : 20;
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 20;
  }
  return Math.min(200, Math.floor(parsed));
}

function severityTone(severity: RowSeverity) {
  if (severity === "Critical") {
    return "#fca5a5";
  }
  if (severity === "Warning") {
    return "#fcd34d";
  }
  return "#93c5fd";
}

function normalizeSeverity(value: string): RowSeverity {
  if (value === "critical" || value === "high") {
    return "Critical";
  }
  if (value === "medium") {
    return "Warning";
  }
  return "Info";
}

function columnValue(row: RecentRow, key: AlarmColumnKey): string {
  if (key === "severity") return row.severity;
  if (key === "timestamp") return row.timestamp;
  if (key === "description") return row.description;
  if (key === "source") return row.source;
  if (key === "tenant") return row.tenant;
  return row.status;
}

function toggleSelection(values: string[], target: string): string[] {
  if (values.includes(target)) {
    return values.filter((item) => item !== target);
  }
  return [...values, target];
}

function toDisplayValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "-";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function flattenObject(value: unknown, prefix = ""): Array<[string, unknown]> {
  if (value === null || value === undefined) {
    return prefix ? [[prefix, value]] : [];
  }

  if (Array.isArray(value)) {
    if (!value.length) {
      return prefix ? [[prefix, []]] : [];
    }
    return value.flatMap((item, index) => flattenObject(item, prefix ? `${prefix}[${index}]` : `[${index}]`));
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.length) {
      return prefix ? [[prefix, {}]] : [];
    }
    return entries.flatMap(([key, nested]) => flattenObject(nested, prefix ? `${prefix}.${key}` : key));
  }

  return prefix ? [[prefix, value]] : [];
}

function baseParsedFields(alert: AlertModel): Record<string, unknown> {
  return {
    alert_id: alert.id,
    dedup_fingerprint: alert.dedup_fingerprint,
    source_id: alert.source_id,
    source_name: alert.source_name,
    customer_id: alert.customer ?? null,
    customer_code: alert.customer_detail?.code ?? null,
    state: alert.current_state_detail?.name ?? null,
    parse_error_detail: alert.parse_error_detail || null,
    assignment: alert.assignment?.assigned_to_detail?.username ?? null,
  };
}

function fieldsFromDetail(alert: AlertModel): Record<string, unknown> {
  const flattened = flattenObject(alert.parsed_payload ?? {});
  const parsedFields = Object.fromEntries(flattened);
  if (!Object.keys(parsedFields).length && alert.parsed_payload && typeof alert.parsed_payload !== "object") {
    parsedFields.parsed_payload = alert.parsed_payload;
  }
  return {
    ...baseParsedFields(alert),
    ...parsedFields,
  };
}

function ensureLayout(layout: DashboardWidgetLayoutItem[]): DashboardWidgetLayoutItem[] {
  if (layout.length) {
    return layout.slice().sort((a, b) => a.order - b.order);
  }
  return defaultDashboardLayout;
}

function asTrendPoints(raw: unknown): TrendPoint[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const row = item as Record<string, unknown>;
      return {
        day: String(row.day ?? ""),
        count: Number(row.count ?? 0),
      };
    })
    .filter((item) => item.day);
}

function asSourceItems(raw: unknown): SourceItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const row = item as Record<string, unknown>;
      return {
        source_name: String(row.source_name ?? ""),
        count: Number(row.count ?? 0),
      };
    })
    .filter((item) => item.source_name);
}

function asStateItems(raw: unknown): StateItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const row = item as Record<string, unknown>;
      return {
        state: String(row.state ?? ""),
        count: Number(row.count ?? 0),
      };
    })
    .filter((item) => item.state);
}

export default function HomePage() {
  const { selectedCustomer, selectedCustomerId } = useCustomer();
  const navigate = useNavigate();
  const { window: timeWindow } = useTimeRange();

  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [dashboard, setDashboard] = useState<DashboardWidgetsPayload | null>(null);
  const [tenants, setTenants] = useState<DashboardTenantSummary[]>([]);
  const [alerts, setAlerts] = useState<AlertModel[]>([]);
  const [totalAlerts, setTotalAlerts] = useState(0);
  const [layoutDraft, setLayoutDraft] = useState<DashboardWidgetLayoutItem[]>(defaultDashboardLayout);

  const [configAnchor, setConfigAnchor] = useState<HTMLElement | null>(null);
  const [filtersAnchor, setFiltersAnchor] = useState<HTMLElement | null>(null);
  const [widgetDragState, setWidgetDragState] = useState<DragState>(null);
  const [visibleAlarmColumns, setVisibleAlarmColumns] = useState<AlarmColumnKey[]>(loadStoredColumns);
  const [rowLimit, setRowLimit] = useState<number>(loadStoredRowLimit);
  const [sortBy, setSortBy] = useState<AlarmColumnKey>("timestamp");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [severityFilters, setSeverityFilters] = useState<string[]>([]);
  const [sourceFilters, setSourceFilters] = useState<string[]>([]);
  const [tenantFilters, setTenantFilters] = useState<string[]>([]);
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [descriptionFilter, setDescriptionFilter] = useState<string>("");
  const [timestampFrom, setTimestampFrom] = useState<string>("");
  const [timestampTo, setTimestampTo] = useState<string>("");
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [alertDetails, setAlertDetails] = useState<Record<number, AlarmDetailState>>({});

  const loadDashboard = useCallback(async () => {
    setDashboardLoading(true);
    setDashboardError(null);
    try {
      const widgetsData = await fetchDashboardWidgets(selectedCustomerId, timeWindow);
      const nextLayout = widgetsData.widgets_layout.length ? widgetsData.widgets_layout : defaultDashboardLayout;
      setDashboard({
        ...widgetsData,
        available_widgets: widgetsData.available_widgets.length ? widgetsData.available_widgets : defaultAvailableWidgets,
        widgets_layout: nextLayout,
      });
      setLayoutDraft(nextLayout);
    } catch {
      setDashboard(null);
      setLayoutDraft(defaultDashboardLayout);
      setDashboardError("Impossibile caricare i widget dashboard.");
    } finally {
      setDashboardLoading(false);
    }
  }, [selectedCustomerId, timeWindow]);

  const loadRecentAlerts = useCallback(async () => {
    setAlertsLoading(true);
    setAlertsError(null);
    try {
      const response = await searchAlerts(
        {
          ordering: "-event_timestamp",
          page: 1,
          page_size: 100,
          event_timestamp_from: timeWindow.from,
          event_timestamp_to: timeWindow.to,
        },
        selectedCustomerId,
      );
      setAlerts(response.results);
      setTotalAlerts(response.count);
    } catch {
      setAlerts([]);
      setTotalAlerts(0);
      setAlertsError("Impossibile caricare gli ultimi allarmi.");
    } finally {
      setAlertsLoading(false);
    }
  }, [selectedCustomerId, timeWindow]);

  const loadTenants = useCallback(async () => {
    try {
      const payload = await fetchDashboardTenants();
      setTenants(payload);
    } catch {
      setTenants([]);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
    void loadRecentAlerts();
  }, [loadDashboard, loadRecentAlerts]);

  useEffect(() => {
    void loadTenants();
  }, [loadTenants]);

  useEffect(() => {
    setExpandedRows({});
    setAlertDetails({});
  }, [selectedCustomerId]);

  useEffect(() => {
    localStorage.setItem(tableColumnStorageKey, JSON.stringify(visibleAlarmColumns));
  }, [visibleAlarmColumns]);

  useEffect(() => {
    localStorage.setItem(rowLimitStorageKey, String(rowLimit));
  }, [rowLimit]);

  const widgetsByKey = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    dashboard?.widgets.forEach((item) => map.set(item.key, item.data));
    return map;
  }, [dashboard]);

  const trendPoints = useMemo(() => asTrendPoints(widgetsByKey.get("alert_trend")?.points), [widgetsByKey]);
  const sourceItems = useMemo(() => asSourceItems(widgetsByKey.get("top_sources")?.items), [widgetsByKey]);
  const stateItems = useMemo(() => asStateItems(widgetsByKey.get("state_distribution")?.items), [widgetsByKey]);

  const orderedLayout = useMemo(() => ensureLayout(layoutDraft), [layoutDraft]);
  const visibleChartWidgets = useMemo(() => orderedLayout.filter((item) => item.enabled), [orderedLayout]);

  const chartWidth = 760;
  const chartHeight = 280;
  const chartPadding = 28;
  const trendSeries = trendPoints.map((item) => item.count);
  const trendPath = chartPath(trendSeries, chartWidth, chartHeight, chartPadding);

  const sourceTotal = sourceItems.reduce((acc, item) => acc + item.count, 0) || 1;
  const sourceColors = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4"];
  const sourceGradient = sourceItems
    .reduce<{ color: string; start: number; end: number }[]>((acc, item, index) => {
      const prev = acc.length ? acc[acc.length - 1].end : 0;
      const end = prev + (item.count / sourceTotal) * 100;
      acc.push({ color: sourceColors[index % sourceColors.length], start: prev, end });
      return acc;
    }, [])
    .map((segment) => `${segment.color} ${segment.start.toFixed(2)}% ${segment.end.toFixed(2)}%`)
    .join(", ");

  const recentRowsBase = useMemo<RecentRow[]>(() => {
    return alerts.map((alert) => {
      const timestampRaw = new Date(alert.event_timestamp).getTime();
      return {
        id: `alert-${alert.id}`,
        alertId: alert.id,
        severity: normalizeSeverity(alert.severity),
        timestamp: Number.isFinite(timestampRaw) ? new Date(timestampRaw).toLocaleString("it-IT") : alert.event_timestamp,
        timestampRaw: Number.isFinite(timestampRaw) ? timestampRaw : 0,
        description: alert.title,
        source: alert.source_name,
        tenant: alert.customer_detail?.name ?? "-",
        status: alert.current_state_detail?.name ?? "N/A",
        parsedFields: baseParsedFields(alert),
      };
    });
  }, [alerts]);

  const availableSeverityLabels = useMemo(() => Array.from(new Set(recentRowsBase.map((row) => row.severity))), [recentRowsBase]);
  const availableSourceLabels = useMemo(
    () => Array.from(new Set(recentRowsBase.map((row) => row.source))).sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" })),
    [recentRowsBase],
  );
  const availableTenantLabels = useMemo(
    () => Array.from(new Set(recentRowsBase.map((row) => row.tenant))).sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" })),
    [recentRowsBase],
  );
  const availableStatusLabels = useMemo(
    () => Array.from(new Set(recentRowsBase.map((row) => row.status))).sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" })),
    [recentRowsBase],
  );

  const recentRowsFilteredSorted = useMemo(() => {
    const fromMs = timestampFrom ? new Date(timestampFrom).getTime() : null;
    const toMs = timestampTo ? new Date(timestampTo).getTime() : null;
    const descriptionNeedle = descriptionFilter.trim().toLowerCase();

    const filtered = recentRowsBase.filter((row) => {
      if (severityFilters.length && !severityFilters.includes(row.severity)) {
        return false;
      }
      if (sourceFilters.length && !sourceFilters.includes(row.source)) {
        return false;
      }
      if (tenantFilters.length && !tenantFilters.includes(row.tenant)) {
        return false;
      }
      if (statusFilters.length && !statusFilters.includes(row.status)) {
        return false;
      }
      if (descriptionNeedle && !row.description.toLowerCase().includes(descriptionNeedle)) {
        return false;
      }
      if (fromMs !== null && Number.isFinite(fromMs) && row.timestampRaw < fromMs) {
        return false;
      }
      if (toMs !== null && Number.isFinite(toMs) && row.timestampRaw > toMs) {
        return false;
      }
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      let av: string | number = columnValue(a, sortBy);
      let bv: string | number = columnValue(b, sortBy);
      if (sortBy === "timestamp") {
        av = a.timestampRaw;
        bv = b.timestampRaw;
      }
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv), "it", { sensitivity: "base" })
        : String(bv).localeCompare(String(av), "it", { sensitivity: "base" });
    });

    return sorted;
  }, [recentRowsBase, severityFilters, sourceFilters, tenantFilters, statusFilters, descriptionFilter, timestampFrom, timestampTo, sortBy, sortDir]);

  const visibleTableColumns = useMemo(() => alarmColumns.filter((item) => visibleAlarmColumns.includes(item.key)), [visibleAlarmColumns]);
  const visibleRows = useMemo(() => recentRowsFilteredSorted.slice(0, rowLimit), [recentRowsFilteredSorted, rowLimit]);

  const updateLayoutItem = (widgetKey: string, partial: Partial<DashboardWidgetLayoutItem>) => {
    setLayoutDraft((current) => current.map((item) => (item.key === widgetKey ? { ...item, ...partial } : item)));
  };

  const reorderWidgetLayout = (fromIndex: number, toIndex: number) => {
    setLayoutDraft((current) => {
      const ordered = ensureLayout(current);
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= ordered.length || toIndex >= ordered.length) {
        return current;
      }
      const next = [...ordered];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next.map((item, index) => ({ ...item, order: index }));
    });
  };

  const toggleAlarmColumn = (key: AlarmColumnKey) => {
    setVisibleAlarmColumns((current) => {
      if (current.includes(key)) {
        if (current.length === 1) {
          return current;
        }
        return current.filter((item) => item !== key);
      }
      return [...current, key];
    });
  };

  const toggleSort = (key: AlarmColumnKey) => {
    if (sortBy === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(key);
    setSortDir("asc");
  };

  const ensureAlertDetails = useCallback(async (alertId: number) => {
    let shouldFetch = false;
    setAlertDetails((current) => {
      const existing = current[alertId];
      if (existing?.loading || existing?.fields) {
        return current;
      }
      shouldFetch = true;
      return {
        ...current,
        [alertId]: { loading: true, error: null, fields: null },
      };
    });

    if (!shouldFetch) {
      return;
    }

    try {
      const detail = await fetchAlert(String(alertId));
      setAlertDetails((current) => ({
        ...current,
        [alertId]: { loading: false, error: null, fields: fieldsFromDetail(detail) },
      }));
    } catch {
      setAlertDetails((current) => ({
        ...current,
        [alertId]: { loading: false, error: "Impossibile caricare i campi parsati.", fields: null },
      }));
    }
  }, []);

  const toggleExpand = (row: RecentRow) => {
    const nextOpen = !expandedRows[row.id];
    setExpandedRows((current) => ({ ...current, [row.id]: nextOpen }));
    if (nextOpen) {
      void ensureAlertDetails(row.alertId);
    }
  };

  const clearFilters = () => {
    setSeverityFilters([]);
    setSourceFilters([]);
    setTenantFilters([]);
    setStatusFilters([]);
    setDescriptionFilter("");
    setTimestampFrom("");
    setTimestampTo("");
  };

  const saveLayout = async () => {
    setSaving(true);
    setActionError(null);
    setSuccess(null);
    try {
      const payload = ensureLayout(layoutDraft).map((item, index) => ({ ...item, order: index }));
      const updated = await updateDashboardWidgetsLayout(payload, selectedCustomerId, timeWindow);
      setDashboard({
        ...updated,
        available_widgets: updated.available_widgets.length ? updated.available_widgets : defaultAvailableWidgets,
        widgets_layout: updated.widgets_layout.length ? updated.widgets_layout : defaultDashboardLayout,
      });
      setLayoutDraft(updated.widgets_layout.length ? updated.widgets_layout : defaultDashboardLayout);
      setSuccess("Configurazione dashboard salvata.");
    } catch {
      setActionError("Salvataggio configurazione non riuscito.");
    } finally {
      setSaving(false);
    }
  };

  const renderTrendWidget = () => (
    <Paper sx={{ ...panelSx, p: 2.2, minHeight: { xs: 300, md: 340 } }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
        <Typography sx={{ color: "#f8fafc", fontWeight: 600, fontSize: 22 }}>Trend alert nel tempo</Typography>
        <Chip label="Ultimi 7 giorni" size="small" sx={{ color: "#cbd5e1", border: "1px solid rgba(71,85,105,0.5)", background: "rgba(15,23,42,0.7)" }} />
      </Stack>
      {!trendPoints.length ? (
        <Box sx={{ display: "grid", placeItems: "center", minHeight: 240 }}>
          <Typography sx={{ color: "#94a3b8" }}>Nessun dato disponibile.</Typography>
        </Box>
      ) : (
        <Box sx={{ width: "100%", overflowX: "auto" }}>
          <svg width="100%" viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
            {[0.2, 0.4, 0.6, 0.8].map((ratio) => {
              const y = chartHeight - chartPadding - ratio * (chartHeight - chartPadding * 2);
              return <line key={ratio} x1={chartPadding} y1={y} x2={chartWidth - chartPadding} y2={y} stroke="rgba(51,65,85,0.6)" strokeWidth="1" />;
            })}
            <path d={trendPath} fill="none" stroke="#3b82f6" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
            {trendPoints.map((item, index) => {
              const stepX = trendPoints.length > 1 ? (chartWidth - chartPadding * 2) / (trendPoints.length - 1) : 0;
              const x = chartPadding + index * stepX;
              return (
                <text key={item.day} x={x} y={chartHeight - 6} textAnchor="middle" fill="#64748b" fontSize="11">
                  {shortDayLabel(item.day)}
                </text>
              );
            })}
          </svg>
        </Box>
      )}
    </Paper>
  );

  const renderSourceWidget = () => (
    <Paper sx={{ ...panelSx, p: 2.2, minHeight: { xs: 300, md: 340 } }}>
      <Typography sx={{ color: "#f8fafc", fontWeight: 600, fontSize: 22, mb: 2 }}>Top fonti</Typography>
      {!sourceItems.length ? (
        <Box sx={{ display: "grid", placeItems: "center", minHeight: 240 }}>
          <Typography sx={{ color: "#94a3b8" }}>Nessun dato disponibile.</Typography>
        </Box>
      ) : (
        <>
          <Stack alignItems="center" justifyContent="center" sx={{ py: 2 }}>
            <Box sx={{ width: 182, height: 182, borderRadius: "50%", background: sourceGradient ? `conic-gradient(${sourceGradient})` : "conic-gradient(#334155 0 100%)", display: "grid", placeItems: "center" }}>
              <Box sx={{ width: 92, height: 92, borderRadius: "50%", background: "#0b1731", border: "1px solid rgba(71,85,105,0.4)" }} />
            </Box>
          </Stack>
          <Stack spacing={1}>
            {sourceItems.map((item, index) => (
              <Stack key={item.source_name} direction="row" justifyContent="space-between" alignItems="center">
                <Stack direction="row" spacing={1} alignItems="center">
                  <Box sx={{ width: 10, height: 10, borderRadius: 0.6, bgcolor: sourceColors[index % sourceColors.length] }} />
                  <Typography sx={{ color: "#94a3b8", fontSize: 13 }}>{item.source_name}</Typography>
                </Stack>
                <Typography sx={{ color: "#e2e8f0", fontSize: 13 }}>{item.count}</Typography>
              </Stack>
            ))}
          </Stack>
        </>
      )}
    </Paper>
  );

  const renderStateWidget = () => {
    const total = stateItems.reduce((acc, item) => acc + item.count, 0) || 1;
    return (
      <Paper sx={{ ...panelSx, p: 2.2, minHeight: { xs: 300, md: 340 } }}>
        <Typography sx={{ color: "#f8fafc", fontWeight: 600, fontSize: 22, mb: 2 }}>Distribuzione stati workflow</Typography>
        {!stateItems.length ? (
          <Box sx={{ display: "grid", placeItems: "center", minHeight: 240 }}>
            <Typography sx={{ color: "#94a3b8" }}>Nessun dato disponibile.</Typography>
          </Box>
        ) : (
          <Stack spacing={1.2}>
            {stateItems.map((item, index) => {
              const width = Math.max(6, Math.round((item.count / total) * 100));
              const color = sourceColors[index % sourceColors.length];
              return (
                <Box key={item.state}>
                  <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                    <Typography sx={{ color: "#94a3b8", fontSize: 13 }}>{item.state}</Typography>
                    <Typography sx={{ color: "#e2e8f0", fontSize: 13 }}>{item.count}</Typography>
                  </Stack>
                  <Box sx={{ width: "100%", height: 10, borderRadius: 99, background: "rgba(30,41,59,0.8)" }}>
                    <Box sx={{ width: `${width}%`, height: "100%", borderRadius: 99, background: color }} />
                  </Box>
                </Box>
              );
            })}
          </Stack>
        )}
      </Paper>
    );
  };

  const renderChartWidget = (key: string) => {
    const DynamicWidget = widgetRegistry[key];
    if (DynamicWidget) {
      return <DynamicWidget customerId={selectedCustomerId} timeWindow={timeWindow} />;
    }
    if (key === "alert_trend") return renderTrendWidget();
    if (key === "top_sources") return renderSourceWidget();
    if (key === "state_distribution") return renderStateWidget();
    return null;
  };

  if (dashboardLoading && alertsLoading && !dashboard && !alerts.length) {
    return <LinearProgress sx={{ borderRadius: 2 }} />;
  }

  return (
    <Stack spacing={2} sx={{ minHeight: "calc(100vh - 148px)" }}>
      {dashboardError ? <Alert severity="error" sx={{ bgcolor: "rgba(127,29,29,0.2)", color: "#fecaca", border: "1px solid rgba(220,38,38,0.35)" }}>{dashboardError}</Alert> : null}
      {alertsError ? <Alert severity="error" sx={{ bgcolor: "rgba(127,29,29,0.2)", color: "#fecaca", border: "1px solid rgba(220,38,38,0.35)" }}>{alertsError}</Alert> : null}
      {actionError ? <Alert severity="error" sx={{ bgcolor: "rgba(127,29,29,0.2)", color: "#fecaca", border: "1px solid rgba(220,38,38,0.35)" }}>{actionError}</Alert> : null}
      {success ? <Alert severity="success" sx={{ bgcolor: "rgba(22,101,52,0.2)", color: "#bbf7d0", border: "1px solid rgba(34,197,94,0.35)" }}>{success}</Alert> : null}

      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
        <Box>
          <Typography sx={{ fontSize: { xs: 28, md: 36 }, fontWeight: 700, color: "#f8fafc" }}>Dashboard</Typography>
          <Typography sx={{ color: "#64748b" }}>Grafici configurabili e ultimi allarmi ricevuti.</Typography>
          <Chip
            size="small"
            label={selectedCustomer ? `Cliente selezionato: ${selectedCustomer.name}` : "Cliente selezionato: Tutti"}
            sx={{ mt: 1, color: "#93c5fd", border: "1px solid rgba(59,130,246,0.35)", background: "rgba(30,64,175,0.18)" }}
          />
        </Box>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2} alignItems={{ xs: "stretch", sm: "center" }}>
          <TimeRangeSelector />
          <Button variant="outlined" startIcon={<TuneIcon />} sx={{ borderColor: "rgba(71,85,105,0.55)", color: "#cbd5e1" }} onClick={(event) => setConfigAnchor(event.currentTarget)}>
            Configura
          </Button>
        </Stack>
      </Stack>

      <Popover
        open={Boolean(configAnchor)}
        anchorEl={configAnchor}
        onClose={() => setConfigAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        PaperProps={{ sx: { width: 430, p: 1.5, bgcolor: "#0b1731", border: "1px solid rgba(71,85,105,0.55)", color: "#e2e8f0" } }}
      >
        <Stack spacing={1.5}>
          <Typography sx={{ fontWeight: 700, fontSize: 16 }}>Configura Dashboard</Typography>

          <TextField
            label="Numero allarmi in tabella"
            type="number"
            size="small"
            value={rowLimit}
            onChange={(event) => {
              const n = Number(event.target.value);
              if (!Number.isFinite(n)) return;
              setRowLimit(Math.max(1, Math.min(200, Math.floor(n))));
            }}
            inputProps={{ min: 1, max: 200 }}
            sx={{ input: { color: "#e2e8f0" }, label: { color: "#94a3b8" } }}
          />

          <Box>
            <Typography sx={{ color: "#94a3b8", fontSize: 12, mb: 1 }}>Grafici visibili e ordine (drag and drop)</Typography>
            <Stack spacing={0.8}>
              {orderedLayout.map((item, index) => {
                const title = dashboard?.available_widgets.find((w) => w.key === item.key)?.title ?? item.key;
                return (
                  <Box
                    key={item.key}
                    draggable
                    onDragStart={() => setWidgetDragState({ index })}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (!widgetDragState) return;
                      reorderWidgetLayout(widgetDragState.index, index);
                      setWidgetDragState(null);
                    }}
                    sx={{ borderRadius: 2, border: "1px solid rgba(71,85,105,0.4)", px: 1, py: 0.8, bgcolor: "rgba(15,23,42,0.65)", cursor: "grab" }}
                  >
                    <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <DragIndicatorIcon sx={{ color: "#64748b", fontSize: 18 }} />
                        <Typography sx={{ fontSize: 13 }}>{title}</Typography>
                      </Stack>
                      <Switch
                        size="small"
                        checked={item.enabled}
                        onChange={(event) => updateLayoutItem(item.key, { enabled: event.target.checked })}
                        data-testid="widget-toggle-button"
                      />
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          </Box>

          <Box>
            <Typography sx={{ color: "#94a3b8", fontSize: 12, mb: 0.5 }}>Colonne tabella ultimi allarmi</Typography>
            <Grid container spacing={0.5}>
              {alarmColumns.map((column) => (
                <Grid item xs={6} key={column.key}>
                  <Stack direction="row" alignItems="center" spacing={0.3}>
                    <Checkbox size="small" checked={visibleAlarmColumns.includes(column.key)} onChange={() => toggleAlarmColumn(column.key)} sx={{ color: "#93c5fd", p: 0.5 }} />
                    <Typography sx={{ fontSize: 12 }}>{column.label}</Typography>
                  </Stack>
                </Grid>
              ))}
            </Grid>
          </Box>

          <Button startIcon={<SaveIcon />} variant="contained" disabled={saving} onClick={() => void saveLayout()} sx={{ background: "linear-gradient(180deg,#3b82f6,#1d4ed8)" }}>
            Salva configurazione
          </Button>
        </Stack>
      </Popover>

      <Paper sx={{ ...panelSx, p: 2.2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
          <Typography sx={{ color: "#f8fafc", fontWeight: 600, fontSize: 22 }}>Grafici</Typography>
          <Chip label={`${visibleChartWidgets.length} attivi`} size="small" sx={{ color: "#93c5fd", border: "1px solid rgba(59,130,246,0.35)", background: "rgba(30,64,175,0.18)" }} />
        </Stack>
        {dashboardLoading ? <LinearProgress sx={{ mb: 1.8, borderRadius: 2 }} data-testid="loading-spinner" /> : null}
        <Grid container spacing={2}>
          {!dashboardLoading && !visibleChartWidgets.length ? (
            <Grid item xs={12}>
              <Alert severity="info" sx={{ bgcolor: "rgba(30,64,175,0.2)", color: "#bfdbfe", border: "1px solid rgba(59,130,246,0.3)" }}>
                Nessun widget attivo. Abilitane almeno uno dal menu Configura.
              </Alert>
            </Grid>
          ) : null}
          {visibleChartWidgets.map((item) => (
            <Grid
              key={item.key}
              item
              xs={12}
              md={item.key === "alert_trend" ? 12 : 6}
              lg={item.key === "alert_trend" ? 8 : 4}
              data-testid={item.key === "kpi_alert_aperti" ? "widget-kpi-open-alerts" : `widget-${item.key}`}
            >
              {renderChartWidget(item.key)}
            </Grid>
          ))}
        </Grid>
      </Paper>

      {tenants.length ? (
        <Paper sx={{ ...panelSx, p: 2.2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
            <Typography sx={{ color: "#f8fafc", fontWeight: 600, fontSize: 22 }}>Tenant disponibili</Typography>
            <Chip label={`${tenants.length} tenant`} size="small" sx={{ color: "#93c5fd", border: "1px solid rgba(59,130,246,0.35)", background: "rgba(30,64,175,0.18)" }} />
          </Stack>
          <Grid container spacing={1.2}>
            {tenants.map((tenant) => (
              <Grid key={tenant.schema_name} item xs={12} md={6} lg={4}>
                <Paper
                  variant="outlined"
                  sx={{ p: 1.2, borderColor: "rgba(71,85,105,0.4)", bgcolor: "rgba(15,23,42,0.45)" }}
                  data-testid="tenant-card"
                >
                  <Stack spacing={0.6}>
                    <Typography sx={{ color: "#f8fafc", fontWeight: 600 }}>{tenant.name}</Typography>
                    <Typography sx={{ color: "#94a3b8", fontSize: 12 }}>{tenant.schema_name}</Typography>
                    <Typography sx={{ color: "#93c5fd", fontSize: 12 }}>Alert attivi: {tenant.active_alerts}</Typography>
                    <Button
                      size="small"
                      variant="outlined"
                      data-testid="open-tenant-button"
                      onClick={() => {
                        if (tenant.entry_url) {
                          window.open(tenant.entry_url, "_blank", "noopener,noreferrer");
                          return;
                        }
                        void navigate("/");
                      }}
                    >
                      Apri
                    </Button>
                  </Stack>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Paper>
      ) : null}

      <Paper sx={{ ...panelSx, p: 0, display: "flex", flexDirection: "column", minHeight: { xs: 420, lg: 520 } }}>
        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }} sx={{ px: 2.2, py: 1.8, borderBottom: "1px solid rgba(71,85,105,0.35)" }}>
          <Typography sx={{ color: "#f8fafc", fontWeight: 600, fontSize: 22 }}>Ultimi allarmi ricevuti</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Button size="small" variant="outlined" startIcon={<FilterAltIcon />} sx={{ borderColor: "rgba(71,85,105,0.55)", color: "#cbd5e1" }} onClick={(event) => setFiltersAnchor(event.currentTarget)}>
              Filtri
            </Button>
            <Chip label={`${visibleRows.length}/${recentRowsFilteredSorted.length} righe`} size="small" sx={{ color: "#93c5fd", border: "1px solid rgba(59,130,246,0.35)", background: "rgba(30,64,175,0.18)" }} />
            <Chip label={`Totale backend: ${totalAlerts}`} size="small" sx={{ color: "#bfdbfe", border: "1px solid rgba(59,130,246,0.35)", background: "rgba(15,23,42,0.65)" }} />
          </Stack>
        </Stack>

        <Popover
          open={Boolean(filtersAnchor)}
          anchorEl={filtersAnchor}
          onClose={() => setFiltersAnchor(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
          PaperProps={{ sx: { width: 480, p: 1.5, bgcolor: "#0b1731", border: "1px solid rgba(71,85,105,0.55)", color: "#e2e8f0" } }}
        >
          <Stack spacing={1.5}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography sx={{ fontWeight: 700, fontSize: 16 }}>Filtri tabella</Typography>
              <Button size="small" onClick={clearFilters} sx={{ color: "#93c5fd" }}>
                Reset
              </Button>
            </Stack>

            <Grid container spacing={1}>
              <Grid item xs={12} md={6}>
                <Typography sx={{ color: "#94a3b8", fontSize: 12, mb: 0.5 }}>Severity (etichette)</Typography>
                <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                  {availableSeverityLabels.map((label) => (
                    <Chip key={label} label={label} size="small" clickable color={severityFilters.includes(label) ? "primary" : "default"} onClick={() => setSeverityFilters((current) => toggleSelection(current, label))} />
                  ))}
                </Stack>
              </Grid>

              <Grid item xs={12} md={6}>
                <Typography sx={{ color: "#94a3b8", fontSize: 12, mb: 0.5 }}>Status (etichette)</Typography>
                <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                  {availableStatusLabels.map((label) => (
                    <Chip key={label} label={label} size="small" clickable color={statusFilters.includes(label) ? "primary" : "default"} onClick={() => setStatusFilters((current) => toggleSelection(current, label))} />
                  ))}
                </Stack>
              </Grid>

              <Grid item xs={12} md={6}>
                <Typography sx={{ color: "#94a3b8", fontSize: 12, mb: 0.5 }}>Source (etichette)</Typography>
                <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                  {availableSourceLabels.map((label) => (
                    <Chip key={label} label={label} size="small" clickable color={sourceFilters.includes(label) ? "primary" : "default"} onClick={() => setSourceFilters((current) => toggleSelection(current, label))} />
                  ))}
                </Stack>
              </Grid>

              <Grid item xs={12} md={6}>
                <Typography sx={{ color: "#94a3b8", fontSize: 12, mb: 0.5 }}>Cliente (etichette)</Typography>
                <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                  {availableTenantLabels.map((label) => (
                    <Chip key={label} label={label} size="small" clickable color={tenantFilters.includes(label) ? "primary" : "default"} onClick={() => setTenantFilters((current) => toggleSelection(current, label))} />
                  ))}
                </Stack>
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label="Description (testo libero)"
                  size="small"
                  value={descriptionFilter}
                  onChange={(event) => setDescriptionFilter(event.target.value)}
                  fullWidth
                  sx={{
                    input: { color: "#e2e8f0" },
                    label: { color: "#94a3b8" },
                    "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(148,163,184,0.24)" },
                  }}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  label="Timestamp da"
                  type="datetime-local"
                  size="small"
                  value={timestampFrom}
                  onChange={(event) => setTimestampFrom(event.target.value)}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  sx={{
                    input: { color: "#e2e8f0" },
                    label: { color: "#94a3b8" },
                    "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(148,163,184,0.24)" },
                  }}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  label="Timestamp a"
                  type="datetime-local"
                  size="small"
                  value={timestampTo}
                  onChange={(event) => setTimestampTo(event.target.value)}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  sx={{
                    input: { color: "#e2e8f0" },
                    label: { color: "#94a3b8" },
                    "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(148,163,184,0.24)" },
                  }}
                />
              </Grid>
            </Grid>
          </Stack>
        </Popover>

        {alertsLoading ? <LinearProgress sx={{ borderRadius: 0 }} /> : null}
        <TableContainer sx={{ overflowX: "auto", overflowY: "auto", maxHeight: { xs: 480, xl: 620 } }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 44, borderBottomColor: "rgba(71,85,105,0.35)" }} />
                {visibleTableColumns.map((column) => (
                  <TableCell key={column.key} sx={{ color: "#64748b", borderBottomColor: "rgba(71,85,105,0.35)", fontWeight: 700, minWidth: column.minWidth }}>
                    <TableSortLabel
                      active={sortBy === column.key}
                      direction={sortBy === column.key ? sortDir : "asc"}
                      onClick={() => toggleSort(column.key)}
                      sx={{ color: "inherit", "& .MuiTableSortLabel-icon": { color: "#64748b !important" } }}
                    >
                      {column.label}
                    </TableSortLabel>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {!alertsLoading && !visibleRows.length ? (
                <TableRow>
                  <TableCell colSpan={visibleTableColumns.length + 1} sx={{ borderBottomColor: "rgba(71,85,105,0.25)", color: "#94a3b8", py: 3 }}>
                    Nessun allarme disponibile per i filtri correnti.
                  </TableCell>
                </TableRow>
              ) : null}

              {visibleRows.map((row) => {
                const detail = alertDetails[row.alertId];
                const effectiveFields = detail?.fields ?? row.parsedFields;
                const parsedEntries = Object.entries(effectiveFields);
                return (
                  <Fragment key={row.id}>
                    <TableRow>
                      <TableCell sx={{ borderBottomColor: "rgba(71,85,105,0.25)" }}>
                        <IconButton size="small" sx={{ color: "#93c5fd" }} onClick={() => toggleExpand(row)}>
                          {expandedRows[row.id] ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
                        </IconButton>
                      </TableCell>
                      {visibleTableColumns.map((column) => (
                        <TableCell key={`${row.id}-${column.key}`} sx={{ borderBottomColor: "rgba(71,85,105,0.25)", color: "#e2e8f0" }}>
                          {column.key === "severity" ? <Chip size="small" label={row.severity} sx={{ height: 22, color: severityTone(row.severity), border: "1px solid rgba(148,163,184,0.24)", background: "rgba(15,23,42,0.85)" }} /> : null}
                          {column.key === "timestamp" ? row.timestamp : null}
                          {column.key === "description" ? row.description : null}
                          {column.key === "source" ? row.source : null}
                          {column.key === "tenant" ? row.tenant : null}
                          {column.key === "status" ? row.status : null}
                        </TableCell>
                      ))}
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ p: 0, borderBottomColor: "rgba(71,85,105,0.25)" }} colSpan={visibleTableColumns.length + 1}>
                        <Collapse in={Boolean(expandedRows[row.id])} timeout="auto" unmountOnExit>
                          <Box sx={{ p: 1.5, bgcolor: "rgba(2,6,23,0.55)" }}>
                            <Typography sx={{ color: "#cbd5e1", fontWeight: 600, mb: 1 }}>Campi parsati</Typography>
                            {detail?.loading ? <LinearProgress sx={{ mb: 1.2, borderRadius: 2 }} /> : null}
                            {detail?.error ? (
                              <Alert severity="error" sx={{ mb: 1.2, bgcolor: "rgba(127,29,29,0.2)", color: "#fecaca", border: "1px solid rgba(220,38,38,0.35)" }}>
                                {detail.error}
                              </Alert>
                            ) : null}
                            {!detail?.loading && !parsedEntries.length ? (
                              <Typography sx={{ color: "#94a3b8" }}>Nessun campo parsato disponibile.</Typography>
                            ) : null}
                            <Grid container spacing={1}>
                              {parsedEntries.map(([key, value]) => (
                                <Grid item xs={12} md={6} key={`${row.id}-${key}`}>
                                  <Box sx={{ border: "1px solid rgba(71,85,105,0.35)", borderRadius: 1.5, px: 1, py: 0.8 }}>
                                    <Typography sx={{ color: "#64748b", fontSize: 11 }}>{key}</Typography>
                                    <Typography sx={{ color: "#e2e8f0", fontSize: 13, wordBreak: "break-word" }}>{toDisplayValue(value)}</Typography>
                                  </Box>
                                </Grid>
                              ))}
                            </Grid>
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Stack>
  );
}
