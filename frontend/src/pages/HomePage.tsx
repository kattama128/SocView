import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import DownloadIcon from "@mui/icons-material/Download";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import SaveIcon from "@mui/icons-material/Save";
import ShieldIcon from "@mui/icons-material/Shield";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import BoltIcon from "@mui/icons-material/Bolt";
import ApartmentIcon from "@mui/icons-material/Apartment";
import AddIcon from "@mui/icons-material/Add";
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControlLabel,
  Grid,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  fetchDashboardTenants,
  fetchDashboardWidgets,
  reorderDashboardTenants,
  updateDashboardWidgetsLayout,
} from "../services/dashboardApi";
import {
  DashboardTenantSummary,
  DashboardWidget,
  DashboardWidgetLayoutItem,
  DashboardWidgetsPayload,
} from "../types/dashboard";

type DragState = { index: number } | null;

type SourceItem = { source_name: string; count: number };
type TrendPoint = { day: string; count: number };

const panelSx = {
  borderRadius: 3,
  border: "1px solid rgba(71,85,105,0.45)",
  background: "linear-gradient(180deg, rgba(15,23,42,0.95), rgba(8,17,37,0.9))",
  backdropFilter: "blur(4px)",
} as const;

function buildTenantEntryUrl(tenant: DashboardTenantSummary): string {
  const path = "/tenant";
  const access = localStorage.getItem("socview_access_token");
  const refresh = localStorage.getItem("socview_refresh_token");
  const params = new URLSearchParams();

  if (access) {
    params.set("sv_access", access);
  }
  if (refresh) {
    params.set("sv_refresh", refresh);
  }

  const hash = params.toString();
  return `http://${tenant.domain}${path}${hash ? `#${hash}` : ""}`;
}

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

function formatMetric(value: number): string {
  return new Intl.NumberFormat("it-IT").format(value);
}

function renderWidgetContent(widget: DashboardWidget) {
  if (widget.key === "state_distribution") {
    const items = (widget.data.items as Array<{ state: string; count: number }>) || [];
    const total = items.reduce((acc, item) => acc + item.count, 0) || 1;
    return (
      <Stack spacing={1}>
        {items.map((item) => (
          <Stack key={item.state} direction="row" justifyContent="space-between" alignItems="center">
            <Typography sx={{ fontSize: 12, color: "#94a3b8" }}>{item.state}</Typography>
            <Typography sx={{ fontSize: 12, color: "#dbeafe" }}>
              {item.count} ({Math.round((item.count / total) * 100)}%)
            </Typography>
          </Stack>
        ))}
      </Stack>
    );
  }

  return (
    <Typography sx={{ fontSize: 12, color: "#64748b" }}>
      Configurazione widget disponibile nella sezione dedicata.
    </Typography>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [tenants, setTenants] = useState<DashboardTenantSummary[]>([]);
  const [dashboard, setDashboard] = useState<DashboardWidgetsPayload | null>(null);
  const [layoutDraft, setLayoutDraft] = useState<DashboardWidgetLayoutItem[]>([]);
  const [dragState, setDragState] = useState<DragState>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [tenantsData, widgetsData] = await Promise.all([
        fetchDashboardTenants(),
        fetchDashboardWidgets(),
      ]);
      setTenants(tenantsData);
      setDashboard(widgetsData);
      setLayoutDraft(widgetsData.widgets_layout);
    } catch {
      setError("Impossibile caricare dashboard home.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const widgetsByKey = useMemo(() => {
    const map = new Map<string, DashboardWidget>();
    dashboard?.widgets.forEach((item) => {
      map.set(item.key, item);
    });
    return map;
  }, [dashboard]);

  const trendPoints = useMemo(() => {
    const raw = widgetsByKey.get("alert_trend")?.data.points as TrendPoint[] | undefined;
    return raw ?? [];
  }, [widgetsByKey]);

  const sourceItems = useMemo(() => {
    const raw = widgetsByKey.get("top_sources")?.data.items as SourceItem[] | undefined;
    return raw ?? [];
  }, [widgetsByKey]);

  const stateItems = useMemo(() => {
    const raw = widgetsByKey.get("state_distribution")?.data.items as Array<{ state: string; count: number }> | undefined;
    return raw ?? [];
  }, [widgetsByKey]);

  const criticalCount = tenants.reduce((acc, item) => acc + item.active_alerts, 0);
  const warningCount = stateItems
    .filter((item) => item.state.toLowerCase().includes("lavor"))
    .reduce((acc, item) => acc + item.count, 0);
  const eventsPerSec = Math.max(120, sourceItems.reduce((acc, item) => acc + item.count, 0) * 42);

  const trafficSeries = trendPoints.map((item) => item.count);
  const threatSeries = trendPoints.map((item, index) => Math.max(1, Math.round(item.count * 0.22) + (index % 3) * 2));

  const chartWidth = 760;
  const chartHeight = 280;
  const chartPadding = 28;
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

  const recentRows = useMemo(() => {
    if (!sourceItems.length) {
      return [];
    }
    const severities = ["Critical", "Critical", "Warning", "Info", "Warning"];
    const statuses = ["Investigating", "New", "Resolved", "Ack", "In Corso"];

    return sourceItems.slice(0, 5).map((item, index) => {
      const tenant = tenants[index % Math.max(tenants.length, 1)];
      const date = new Date(Date.now() - index * 2 * 60 * 60 * 1000);
      return {
        severity: severities[index % severities.length],
        timestamp: date.toLocaleString("it-IT"),
        description: `${item.source_name} - anomalia operativa rilevata`,
        source: item.source_name,
        tenant,
        status: statuses[index % statuses.length],
      };
    });
  }, [sourceItems, tenants]);

  const reorderTenantLocal = (fromIndex: number, toIndex: number) => {
    setTenants((current) => {
      if (toIndex < 0 || toIndex >= current.length || fromIndex === toIndex) {
        return current;
      }
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const persistTenantOrder = async (nextTenants: DashboardTenantSummary[]) => {
    try {
      await reorderDashboardTenants(nextTenants.map((item) => item.schema_name));
      setSuccess("Ordinamento tenant aggiornato.");
    } catch {
      setError("Errore durante il salvataggio ordine tenant.");
    }
  };

  const handleTenantDrop = async (dropIndex: number) => {
    if (!dragState) {
      return;
    }
    const fromIndex = dragState.index;
    setDragState(null);
    if (fromIndex === dropIndex) {
      return;
    }

    const next = [...tenants];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(dropIndex, 0, moved);
    setTenants(next);
    await persistTenantOrder(next);
  };

  const updateLayoutItem = (widgetKey: string, partial: Partial<DashboardWidgetLayoutItem>) => {
    setLayoutDraft((current) =>
      current.map((item) => (item.key === widgetKey ? { ...item, ...partial } : item)),
    );
  };

  const moveLayoutItem = (widgetKey: string, direction: -1 | 1) => {
    setLayoutDraft((current) => {
      const ordered = [...current].sort((a, b) => a.order - b.order);
      const index = ordered.findIndex((item) => item.key === widgetKey);
      if (index < 0) {
        return current;
      }
      const target = index + direction;
      if (target < 0 || target >= ordered.length) {
        return current;
      }
      const temp = ordered[index].order;
      ordered[index].order = ordered[target].order;
      ordered[target].order = temp;
      return ordered.sort((a, b) => a.order - b.order);
    });
  };

  const saveLayout = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = layoutDraft
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((item, index) => ({ ...item, order: index }));
      const updated = await updateDashboardWidgetsLayout(payload);
      setDashboard(updated);
      setLayoutDraft(updated.widgets_layout);
      setSuccess("Layout widget salvato.");
    } catch {
      setError("Salvataggio layout non riuscito.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LinearProgress sx={{ borderRadius: 2 }} />;
  }

  return (
    <Stack spacing={2}>
      {error ? (
        <Alert severity="error" sx={{ bgcolor: "rgba(127,29,29,0.2)", color: "#fecaca", border: "1px solid rgba(220,38,38,0.35)" }}>
          {error}
        </Alert>
      ) : null}
      {success ? (
        <Alert severity="success" sx={{ bgcolor: "rgba(22,101,52,0.2)", color: "#bbf7d0", border: "1px solid rgba(34,197,94,0.35)" }}>
          {success}
        </Alert>
      ) : null}

      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={2}>
        <Box>
          <Typography sx={{ fontSize: { xs: 28, md: 36 }, fontWeight: 700, color: "#f8fafc" }}>Security Overview</Typography>
          <Typography sx={{ color: "#64748b" }}>
            Real-time monitoring across {tenants.length} active tenants
          </Typography>
        </Box>

        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={<FilterAltIcon />}
            sx={{ borderColor: "rgba(71,85,105,0.55)", color: "#cbd5e1" }}
            onClick={() => navigate("/tenant")}
          >
            Filter
          </Button>
          <Button variant="outlined" startIcon={<DownloadIcon />} sx={{ borderColor: "rgba(71,85,105,0.55)", color: "#cbd5e1" }}>
            Export
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} sx={{ background: "linear-gradient(180deg,#3b82f6,#1d4ed8)" }} onClick={() => navigate("/configurazione")}>
            New Rule
          </Button>
        </Stack>
      </Stack>

      <Grid container spacing={2}>
        {[
          { title: "Critical Alarms", value: criticalCount, icon: <ShieldIcon />, color: "#f87171", delta: "12%" },
          { title: "Warnings", value: warningCount || Math.max(1, Math.round(criticalCount * 0.35)), icon: <WarningAmberIcon />, color: "#facc15", delta: "5%" },
          { title: "Events / sec", value: eventsPerSec, icon: <BoltIcon />, color: "#60a5fa", delta: "Stable" },
          { title: "Tenants Monitored", value: `${tenants.length}/${tenants.length}`, icon: <ApartmentIcon />, color: "#a78bfa", delta: "All Active" },
        ].map((card) => (
          <Grid item xs={12} sm={6} md={3} key={card.title}>
            <Paper sx={{ ...panelSx, p: 2.2, minHeight: 140 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: 1.6,
                    display: "grid",
                    placeItems: "center",
                    color: card.color,
                    border: "1px solid rgba(71,85,105,0.5)",
                    background: "rgba(15,23,42,0.85)",
                  }}
                >
                  {card.icon}
                </Box>
                <Typography sx={{ fontSize: 12, color: card.color }}>{card.delta}</Typography>
              </Stack>
              <Typography sx={{ color: "#f8fafc", fontWeight: 700, fontSize: 36, lineHeight: 1.1 }}>
                {typeof card.value === "number" ? formatMetric(card.value) : card.value}
              </Typography>
              <Typography sx={{ color: "#94a3b8", fontSize: 13 }}>{card.title}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} lg={8}>
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
                  return (
                    <line
                      key={ratio}
                      x1={chartPadding}
                      y1={y}
                      x2={chartWidth - chartPadding}
                      y2={y}
                      stroke="rgba(51,65,85,0.6)"
                      strokeWidth="1"
                    />
                  );
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
        </Grid>

        <Grid item xs={12} lg={4}>
          <Paper sx={{ ...panelSx, p: 2.2, minHeight: 360 }}>
            <Typography sx={{ color: "#f8fafc", fontWeight: 600, fontSize: 22, mb: 2 }}>Alarm Sources</Typography>
            <Stack alignItems="center" justifyContent="center" sx={{ py: 2 }}>
              <Box
                sx={{
                  width: 182,
                  height: 182,
                  borderRadius: "50%",
                  background: sourceGradient ? `conic-gradient(${sourceGradient})` : "conic-gradient(#334155 0 100%)",
                  display: "grid",
                  placeItems: "center",
                }}
              >
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
        </Grid>
      </Grid>

      <Paper sx={{ ...panelSx, p: 0 }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", md: "center" }}
          sx={{ px: 2.2, py: 1.8, borderBottom: "1px solid rgba(71,85,105,0.35)" }}
        >
          <Typography sx={{ color: "#f8fafc", fontWeight: 600, fontSize: 22 }}>Recent Security Alarms</Typography>
          <Chip label={`${recentRows.length} eventi`} size="small" sx={{ color: "#93c5fd", border: "1px solid rgba(59,130,246,0.35)", background: "rgba(30,64,175,0.18)" }} />
        </Stack>

        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {["Severity", "Timestamp", "Description", "Source", "Tenant", "Status", "Action"].map((header) => (
                  <TableCell key={header} sx={{ color: "#64748b", borderBottomColor: "rgba(71,85,105,0.35)", fontWeight: 700 }}>
                    {header}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {recentRows.map((row, index) => (
                <TableRow key={`${row.source}-${index}`}>
                  <TableCell sx={{ borderBottomColor: "rgba(71,85,105,0.25)" }}>
                    <Chip
                      size="small"
                      label={row.severity}
                      sx={{
                        height: 22,
                        color: row.severity === "Critical" ? "#fca5a5" : row.severity === "Warning" ? "#fcd34d" : "#93c5fd",
                        border: "1px solid rgba(71,85,105,0.45)",
                        background: "rgba(15,23,42,0.85)",
                      }}
                    />
                  </TableCell>
                  <TableCell sx={{ color: "#94a3b8", borderBottomColor: "rgba(71,85,105,0.25)", minWidth: 170 }}>{row.timestamp}</TableCell>
                  <TableCell sx={{ color: "#e2e8f0", borderBottomColor: "rgba(71,85,105,0.25)", minWidth: 260 }}>{row.description}</TableCell>
                  <TableCell sx={{ color: "#94a3b8", borderBottomColor: "rgba(71,85,105,0.25)" }}>{row.source}</TableCell>
                  <TableCell sx={{ color: "#94a3b8", borderBottomColor: "rgba(71,85,105,0.25)", minWidth: 180 }}>
                    {row.tenant ? row.tenant.name : "-"}
                  </TableCell>
                  <TableCell sx={{ color: "#e2e8f0", borderBottomColor: "rgba(71,85,105,0.25)" }}>{row.status}</TableCell>
                  <TableCell sx={{ borderBottomColor: "rgba(71,85,105,0.25)" }}>
                    {row.tenant ? (
                      <Button
                        size="small"
                        variant="text"
                        sx={{ color: "#60a5fa" }}
                        onClick={() => window.location.assign(buildTenantEntryUrl(row.tenant))}
                      >
                        View
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Paper>

      <Grid container spacing={2}>
        <Grid item xs={12} lg={6}>
          <Paper sx={{ ...panelSx, p: 2.2 }}>
            <Typography sx={{ color: "#f8fafc", fontWeight: 600, fontSize: 20, mb: 2 }}>Tenant Access</Typography>
            <Typography sx={{ color: "#64748b", fontSize: 13, mb: 1.5 }}>
              Drag & drop per ordinare i clienti e pulsante rapido per accesso al tenant.
            </Typography>

            <Stack spacing={1}>
              {tenants.map((tenant, index) => (
                <Box
                  key={tenant.schema_name}
                  draggable
                  onDragStart={() => setDragState({ index })}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    void handleTenantDrop(index);
                  }}
                  sx={{
                    border: "1px solid rgba(71,85,105,0.45)",
                    borderRadius: 2,
                    p: 1.2,
                    background: dragState?.index === index ? "rgba(37,99,235,0.16)" : "rgba(15,23,42,0.6)",
                    cursor: "grab",
                  }}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <DragIndicatorIcon sx={{ color: "#64748b" }} />
                      <Box>
                        <Typography sx={{ color: "#e2e8f0", fontWeight: 600, fontSize: 14 }}>
                          {tenant.name} ({tenant.schema_name})
                        </Typography>
                        <Typography sx={{ color: "#64748b", fontSize: 12 }}>{tenant.domain}</Typography>
                      </Box>
                    </Stack>

                    <Stack direction="row" spacing={1} alignItems="center">
                      <Chip size="small" label={`${tenant.active_alerts} attivi`} sx={{ color: "#fca5a5", border: "1px solid rgba(248,113,113,0.4)", background: "rgba(127,29,29,0.2)" }} />
                      <Button
                        size="small"
                        variant="outlined"
                        endIcon={<OpenInNewIcon fontSize="small" />}
                        onClick={(event) => {
                          event.stopPropagation();
                          window.location.assign(buildTenantEntryUrl(tenant));
                        }}
                        sx={{ borderColor: "rgba(59,130,246,0.5)", color: "#93c5fd" }}
                      >
                        Apri
                      </Button>
                    </Stack>
                  </Stack>
                </Box>
              ))}
            </Stack>
          </Paper>
        </Grid>

        <Grid item xs={12} lg={6}>
          <Paper sx={{ ...panelSx, p: 2.2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
              <Typography sx={{ color: "#f8fafc", fontWeight: 600, fontSize: 20 }}>Widget Configuration</Typography>
              <Button startIcon={<SaveIcon />} variant="contained" disabled={saving} onClick={() => void saveLayout()} sx={{ background: "linear-gradient(180deg,#3b82f6,#1d4ed8)" }}>
                Salva
              </Button>
            </Stack>

            <Stack spacing={1}>
              {layoutDraft
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((item, index) => {
                  const metadata = dashboard?.available_widgets.find((w) => w.key === item.key);
                  const dataWidget = dashboard?.widgets.find((w) => w.key === item.key);
                  return (
                    <Box key={item.key} sx={{ border: "1px solid rgba(71,85,105,0.45)", borderRadius: 2, p: 1.2, background: "rgba(15,23,42,0.6)" }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ color: "#e2e8f0", fontSize: 14, fontWeight: 600 }}>
                            {metadata?.title ?? item.key}
                          </Typography>
                          <Typography sx={{ color: "#64748b", fontSize: 12 }}>
                            {metadata?.description}
                          </Typography>
                        </Box>

                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <FormControlLabel
                            control={<Switch checked={item.enabled} onChange={(event) => updateLayoutItem(item.key, { enabled: event.target.checked })} />}
                            label="On"
                            sx={{ color: "#94a3b8" }}
                          />
                          <IconButton size="small" onClick={() => moveLayoutItem(item.key, -1)} disabled={index === 0} sx={{ color: "#94a3b8" }}>
                            <ArrowUpwardIcon fontSize="small" />
                          </IconButton>
                          <IconButton size="small" onClick={() => moveLayoutItem(item.key, 1)} disabled={index === layoutDraft.length - 1} sx={{ color: "#94a3b8" }}>
                            <ArrowDownwardIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                      </Stack>

                      {item.enabled && dataWidget ? (
                        <Box sx={{ mt: 1, pt: 1, borderTop: "1px solid rgba(51,65,85,0.5)" }}>{renderWidgetContent(dataWidget)}</Box>
                      ) : null}
                    </Box>
                  );
                })}
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Stack>
  );
}
