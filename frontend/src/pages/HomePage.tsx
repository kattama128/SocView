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
  TextField,
  Typography,
} from "@mui/material";
import { Fragment, useEffect, useMemo, useState } from "react";

import { useCustomer } from "../context/CustomerContext";
import { mockAlarms, mockCustomers, mockSources } from "../mocks/activeAlarmsData";
import { isSourceEnabledForCustomer, loadCustomerSourcePreferences, loadGlobalSourcesConfig, resolveAlarmSeverity } from "../mocks/sourceCatalog";
import { fetchDashboardWidgets, updateDashboardWidgetsLayout } from "../services/dashboardApi";
import { DashboardTenantSummary, DashboardWidgetLayoutItem, DashboardWidgetsPayload } from "../types/dashboard";

type SourceItem = { source_name: string; count: number };
type TrendPoint = { day: string; count: number };
type DragState = { index: number } | null;
type RowSeverity = "Critical" | "Warning" | "Info";
type SortDirection = "asc" | "desc";
type AlarmColumnKey = "severity" | "timestamp" | "description" | "source" | "tenant" | "status";

type RecentRow = {
  id: string;
  severity: RowSeverity;
  timestamp: string;
  timestampRaw: number;
  description: string;
  source: string;
  tenant: DashboardTenantSummary | null;
  status: string;
  parsedFields: Record<string, unknown>;
};

type AlarmColumn = {
  key: AlarmColumnKey;
  label: string;
  minWidth?: number;
};

const panelSx = {
  borderRadius: 3,
  border: "1px solid rgba(148,163,184,0.24)",
  background: "linear-gradient(180deg, rgba(15,23,42,0.88), rgba(15,23,42,0.72))",
  backdropFilter: "blur(4px)",
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
];

const defaultAvailableWidgets = [
  { key: "alert_trend", title: "Threat Traffic Analysis", description: "Trend temporale allarmi" },
  { key: "top_sources", title: "Alarm Sources", description: "Distribuzione per fonte" },
  { key: "state_distribution", title: "State Distribution", description: "Distribuzione stati" },
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

function toDashboardTenant(customer: (typeof mockCustomers)[number]): DashboardTenantSummary {
  return {
    schema_name: customer.code.toLowerCase(),
    name: customer.name,
    on_trial: false,
    active_alerts: mockAlarms.filter((item) => item.customerId === customer.id).length,
    domain: `${customer.code.toLowerCase()}.localhost`,
    entry_url: `http://${customer.code.toLowerCase()}.localhost/tenant`,
  };
}

function mockTrendPoints(alarms: typeof mockAlarms): TrendPoint[] {
  const today = new Date();
  const counts = new Map<string, number>();
  alarms.forEach((alarm) => {
    const day = alarm.detectedAt.slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  });

  return Array.from({ length: 7 }, (_, idx) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - idx));
    const day = d.toISOString().slice(0, 10);
    return { day, count: counts.get(day) ?? 0 };
  });
}

function mockSourceItems(alarms: typeof mockAlarms): SourceItem[] {
  const counts = new Map<number, number>();
  alarms.forEach((alarm) => counts.set(alarm.sourceId, (counts.get(alarm.sourceId) ?? 0) + 1));
  return [...counts.entries()]
    .map(([sourceId, count]) => ({
      source_name: mockSources.find((s) => s.id === sourceId)?.name ?? `Source ${sourceId}`,
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

function mockStateItems(alarms: typeof mockAlarms): Array<{ state: string; count: number }> {
  const labels: Record<string, string> = {
    new: "Nuovo",
    triage: "In lavorazione",
    investigating: "Investigating",
  };
  const counts = new Map<string, number>();
  alarms.forEach((alarm) => {
    const state = labels[alarm.status] ?? alarm.status;
    counts.set(state, (counts.get(state) ?? 0) + 1);
  });
  return [...counts.entries()].map(([state, count]) => ({ state, count }));
}

function columnValue(row: RecentRow, key: AlarmColumnKey): string {
  if (key === "severity") return row.severity;
  if (key === "timestamp") return row.timestamp;
  if (key === "description") return row.description;
  if (key === "source") return row.source;
  if (key === "tenant") return row.tenant ? row.tenant.name : "";
  return row.status;
}

function toggleSelection(values: string[], target: string): string[] {
  if (values.includes(target)) {
    return values.filter((item) => item !== target);
  }
  return [...values, target];
}

export default function HomePage() {
  const { selectedCustomer, selectedCustomerId } = useCustomer();
  const globalSources = useMemo(() => loadGlobalSourcesConfig(), []);
  const sourcePreferences = useMemo(() => loadCustomerSourcePreferences(), []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [dashboard, setDashboard] = useState<DashboardWidgetsPayload | null>(null);
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

  const loadData = async () => {
    setLoading(true);
    setError(null);
    const fallback: DashboardWidgetsPayload = {
      available_widgets: defaultAvailableWidgets,
      widgets_layout: defaultDashboardLayout,
      widgets: [],
    };
    try {
      const widgetsData = await fetchDashboardWidgets();
      const nextLayout = widgetsData.widgets_layout.length ? widgetsData.widgets_layout : defaultDashboardLayout;
      setDashboard({
        ...widgetsData,
        available_widgets: widgetsData.available_widgets.length ? widgetsData.available_widgets : defaultAvailableWidgets,
        widgets_layout: nextLayout,
      });
      setLayoutDraft(nextLayout);
    } catch {
      setDashboard(fallback);
      setLayoutDraft(fallback.widgets_layout);
      setError(null);
    } finally {
      setLoading(false);
    }
  };

  const scopedAlarms = useMemo(
    () =>
      (selectedCustomerId ? mockAlarms.filter((item) => item.customerId === selectedCustomerId) : mockAlarms).filter((item) =>
        isSourceEnabledForCustomer(item.customerId, item.sourceId, sourcePreferences),
      ),
    [selectedCustomerId, sourcePreferences],
  );

  const effectiveTenants = useMemo(
    () =>
      (selectedCustomerId
        ? mockCustomers.filter((customer) => customer.id === selectedCustomerId)
        : mockCustomers
      ).map((customer) => toDashboardTenant(customer)),
    [selectedCustomerId],
  );

  useEffect(() => {
    void loadData();
  }, []);

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

  const trendPointsRaw = useMemo(() => {
    const raw = widgetsByKey.get("alert_trend")?.points as TrendPoint[] | undefined;
    return raw ?? [];
  }, [widgetsByKey]);

  const sourceItemsRaw = useMemo(() => {
    const raw = widgetsByKey.get("top_sources")?.items as SourceItem[] | undefined;
    return raw ?? [];
  }, [widgetsByKey]);

  const stateItemsRaw = useMemo(() => {
    const raw = widgetsByKey.get("state_distribution")?.items as Array<{ state: string; count: number }> | undefined;
    return raw ?? [];
  }, [widgetsByKey]);

  const hasRealData = trendPointsRaw.length > 0 || sourceItemsRaw.length > 0 || stateItemsRaw.length > 0;

  const trendPoints = useMemo(() => (trendPointsRaw.length ? trendPointsRaw : mockTrendPoints(scopedAlarms)), [trendPointsRaw, scopedAlarms]);
  const sourceItems = useMemo(() => (sourceItemsRaw.length ? sourceItemsRaw : mockSourceItems(scopedAlarms)), [sourceItemsRaw, scopedAlarms]);
  const stateItems = useMemo(() => (stateItemsRaw.length ? stateItemsRaw : mockStateItems(scopedAlarms)), [stateItemsRaw, scopedAlarms]);

  const orderedLayout = useMemo(
    () => (layoutDraft.length ? layoutDraft.slice().sort((a, b) => a.order - b.order) : defaultDashboardLayout),
    [layoutDraft],
  );
  const visibleChartWidgets = useMemo(() => orderedLayout.filter((item) => item.enabled), [orderedLayout]);

  const chartWidth = 760;
  const chartHeight = 280;
  const chartPadding = 28;
  const trafficSeries = trendPoints.map((item) => item.count);
  const threatSeries = trendPoints.map((item, index) => Math.max(1, Math.round(item.count * 0.22) + (index % 3) * 2));
  const normalPath = chartPath(trafficSeries.length ? trafficSeries : [0, 0, 0, 0], chartWidth, chartHeight, chartPadding);
  const threatPath = chartPath(threatSeries.length ? threatSeries : [0, 0, 0, 0], chartWidth, chartHeight, chartPadding);

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
    if (hasRealData && sourceItems.length) {
      const severities: RowSeverity[] = ["Critical", "Critical", "Warning", "Info", "Warning"];
      const statuses = ["Investigating", "New", "Resolved", "Ack", "In Corso"];
      return sourceItems.slice(0, 30).map((item, index) => {
        const tenant = effectiveTenants[index % Math.max(effectiveTenants.length, 1)] ?? null;
        const timestampRaw = Date.now() - index * 2 * 60 * 60 * 1000;
        return {
          id: `real-${item.source_name}-${index}`,
          severity: severities[index % severities.length],
          timestamp: new Date(timestampRaw).toLocaleString("it-IT"),
          timestampRaw,
          description: `${item.source_name} - anomalia operativa rilevata`,
          source: item.source_name,
          tenant,
          status: statuses[index % statuses.length],
          parsedFields: {
            source_name: item.source_name,
            hit_count: item.count,
            detection_engine: "socview-correlation",
            confidence: Math.max(40, 92 - index * 3),
            category: "anomaly",
            tenant_schema: tenant?.schema_name ?? "public",
          },
        };
      });
    }

    return scopedAlarms.map((alarm, index) => {
      const source = mockSources.find((item) => item.id === alarm.sourceId);
      const customer = mockCustomers.find((item) => item.id === alarm.customerId);
      const tenant = customer ? toDashboardTenant(customer) : null;
      const normalizedSeverity = resolveAlarmSeverity(alarm.sourceId, alarm.title, alarm.severity, globalSources);
      const parsedFields: Record<string, unknown> = {
        event_id: alarm.eventId,
        customer_code: customer?.code ?? null,
        customer_sector: customer?.sector ?? null,
        source_type: source?.type ?? null,
        source_status: source?.status ?? null,
        assignee: alarm.assignee,
        workflow_status: alarm.status,
        severity_raw: alarm.severity,
        severity_effective: normalizedSeverity,
      };
      return {
        id: `mock-${alarm.id}`,
        severity: normalizeSeverity(normalizedSeverity),
        timestamp: new Date(alarm.detectedAt).toLocaleString("it-IT"),
        timestampRaw: new Date(alarm.detectedAt).getTime(),
        description: alarm.title,
        source: source?.name ?? `Source ${alarm.sourceId}`,
        tenant,
        status: alarm.status,
        parsedFields,
      };
    });
  }, [hasRealData, sourceItems, effectiveTenants, scopedAlarms, globalSources]);

  const availableSeverityLabels = useMemo(
    () => Array.from(new Set(recentRowsBase.map((row) => row.severity))),
    [recentRowsBase],
  );
  const availableSourceLabels = useMemo(
    () => Array.from(new Set(recentRowsBase.map((row) => row.source))).sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" })),
    [recentRowsBase],
  );
  const availableTenantLabels = useMemo(
    () =>
      Array.from(new Set(recentRowsBase.map((row) => (row.tenant ? row.tenant.name : "-")))).sort((a, b) =>
        a.localeCompare(b, "it", { sensitivity: "base" }),
      ),
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
      const tenantName = row.tenant ? row.tenant.name : "-";
      if (tenantFilters.length && !tenantFilters.includes(tenantName)) {
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
      const ordered = current.slice().sort((a, b) => a.order - b.order);
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

  const toggleExpand = (rowId: string) => {
    setExpandedRows((current) => ({ ...current, [rowId]: !current[rowId] }));
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
    setError(null);
    setSuccess(null);
    try {
      const payload = layoutDraft.slice().sort((a, b) => a.order - b.order).map((item, index) => ({ ...item, order: index }));
      const updated = await updateDashboardWidgetsLayout(payload);
      setDashboard(updated);
      setLayoutDraft(updated.widgets_layout);
      setSuccess("Configurazione dashboard salvata.");
    } catch {
      setError("Salvataggio configurazione non riuscito.");
    } finally {
      setSaving(false);
    }
  };

  const renderTrendWidget = () => (
    <Paper sx={{ ...panelSx, p: 2.2, minHeight: 360 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
        <Typography sx={{ color: "#f8fafc", fontWeight: 600, fontSize: 22 }}>Threat Traffic Analysis</Typography>
        <Chip label="Last 24h" size="small" sx={{ color: "#cbd5e1", border: "1px solid rgba(71,85,105,0.5)", background: "rgba(15,23,42,0.7)" }} />
      </Stack>
      <Stack direction="row" spacing={2} sx={{ mb: 1 }}>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Box sx={{ width: 20, height: 2, bgcolor: "#3b82f6" }} />
          <Typography sx={{ fontSize: 12, color: "#94a3b8" }}>Normal Traffic</Typography>
        </Stack>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Box sx={{ width: 20, height: 2, bgcolor: "#ef4444" }} />
          <Typography sx={{ fontSize: 12, color: "#94a3b8" }}>Threats</Typography>
        </Stack>
      </Stack>
      <Box sx={{ width: "100%", overflowX: "auto" }}>
        <svg width="100%" viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
          {[0.2, 0.4, 0.6, 0.8].map((ratio) => {
            const y = chartHeight - chartPadding - ratio * (chartHeight - chartPadding * 2);
            return <line key={ratio} x1={chartPadding} y1={y} x2={chartWidth - chartPadding} y2={y} stroke="rgba(51,65,85,0.6)" strokeWidth="1" />;
          })}
          <path d={normalPath} fill="none" stroke="#3b82f6" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          <path d={threatPath} fill="none" stroke="#ef4444" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
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
    </Paper>
  );

  const renderSourceWidget = () => (
    <Paper sx={{ ...panelSx, p: 2.2, minHeight: 360 }}>
      <Typography sx={{ color: "#f8fafc", fontWeight: 600, fontSize: 22, mb: 2 }}>Alarm Sources</Typography>
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
    </Paper>
  );

  const renderStateWidget = () => {
    const total = stateItems.reduce((acc, item) => acc + item.count, 0) || 1;
    return (
      <Paper sx={{ ...panelSx, p: 2.2, minHeight: 360 }}>
        <Typography sx={{ color: "#f8fafc", fontWeight: 600, fontSize: 22, mb: 2 }}>State Distribution</Typography>
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
      </Paper>
    );
  };

  const renderChartWidget = (key: string) => {
    if (key === "alert_trend") return renderTrendWidget();
    if (key === "top_sources") return renderSourceWidget();
    if (key === "state_distribution") return renderStateWidget();
    return null;
  };

  if (loading) {
    return <LinearProgress sx={{ borderRadius: 2 }} />;
  }

  return (
    <Stack spacing={2}>
      {error ? <Alert severity="error" sx={{ bgcolor: "rgba(127,29,29,0.2)", color: "#fecaca", border: "1px solid rgba(220,38,38,0.35)" }}>{error}</Alert> : null}
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
        <Button variant="outlined" startIcon={<TuneIcon />} sx={{ borderColor: "rgba(71,85,105,0.55)", color: "#cbd5e1" }} onClick={(event) => setConfigAnchor(event.currentTarget)}>
          Configura
        </Button>
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
                      <Switch size="small" checked={item.enabled} onChange={(event) => updateLayoutItem(item.key, { enabled: event.target.checked })} />
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
        <Grid container spacing={2}>
          {visibleChartWidgets.map((item) => (
            <Grid key={item.key} item xs={12} lg={item.key === "alert_trend" ? 8 : 4}>
              {renderChartWidget(item.key)}
            </Grid>
          ))}
        </Grid>
      </Paper>

      <Paper sx={{ ...panelSx, p: 0 }}>
        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }} sx={{ px: 2.2, py: 1.8, borderBottom: "1px solid rgba(71,85,105,0.35)" }}>
          <Typography sx={{ color: "#f8fafc", fontWeight: 600, fontSize: 22 }}>Ultimi allarmi ricevuti</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Button size="small" variant="outlined" startIcon={<FilterAltIcon />} sx={{ borderColor: "rgba(71,85,105,0.55)", color: "#cbd5e1" }} onClick={(event) => setFiltersAnchor(event.currentTarget)}>
              Filtri
            </Button>
            <Chip label={`${visibleRows.length}/${recentRowsFilteredSorted.length} righe`} size="small" sx={{ color: "#93c5fd", border: "1px solid rgba(59,130,246,0.35)", background: "rgba(30,64,175,0.18)" }} />
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

        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
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
              {visibleRows.map((row) => (
                <Fragment key={row.id}>
                  <TableRow key={row.id}>
                    <TableCell sx={{ borderBottomColor: "rgba(71,85,105,0.25)" }}>
                      <IconButton size="small" sx={{ color: "#93c5fd" }} onClick={() => toggleExpand(row.id)}>
                        {expandedRows[row.id] ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
                      </IconButton>
                    </TableCell>
                    {visibleTableColumns.map((column) => (
                      <TableCell key={`${row.id}-${column.key}`} sx={{ borderBottomColor: "rgba(71,85,105,0.25)", color: "#e2e8f0" }}>
                        {column.key === "severity" ? <Chip size="small" label={row.severity} sx={{ height: 22, color: severityTone(row.severity), border: "1px solid rgba(148,163,184,0.24)", background: "rgba(15,23,42,0.85)" }} /> : null}
                        {column.key === "timestamp" ? row.timestamp : null}
                        {column.key === "description" ? row.description : null}
                        {column.key === "source" ? row.source : null}
                        {column.key === "tenant" ? (row.tenant ? row.tenant.name : "-") : null}
                        {column.key === "status" ? row.status : null}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell sx={{ p: 0, borderBottomColor: "rgba(71,85,105,0.25)" }} colSpan={visibleTableColumns.length + 1}>
                      <Collapse in={Boolean(expandedRows[row.id])} timeout="auto" unmountOnExit>
                        <Box sx={{ p: 1.5, bgcolor: "rgba(2,6,23,0.55)" }}>
                          <Typography sx={{ color: "#cbd5e1", fontWeight: 600, mb: 1 }}>Campi parsati</Typography>
                          <Grid container spacing={1}>
                            {Object.entries(row.parsedFields).map(([key, value]) => (
                              <Grid item xs={12} md={6} key={`${row.id}-${key}`}>
                                <Box sx={{ border: "1px solid rgba(71,85,105,0.35)", borderRadius: 1.5, px: 1, py: 0.8 }}>
                                  <Typography sx={{ color: "#64748b", fontSize: 11 }}>{key}</Typography>
                                  <Typography sx={{ color: "#e2e8f0", fontSize: 13, wordBreak: "break-word" }}>{String(value)}</Typography>
                                </Box>
                              </Grid>
                            ))}
                          </Grid>
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Paper>
    </Stack>
  );
}
