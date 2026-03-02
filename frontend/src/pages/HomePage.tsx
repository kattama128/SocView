import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  FormControlLabel,
  Grid,
  LinearProgress,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import SaveIcon from "@mui/icons-material/Save";
import { useEffect, useMemo, useState } from "react";

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

function renderWidgetContent(widget: DashboardWidget) {
  if (widget.key === "alert_trend") {
    const points = (widget.data.points as Array<{ day: string; count: number }>) || [];
    const max = Math.max(1, ...points.map((item) => item.count));

    return (
      <Stack spacing={1}>
        {points.map((item) => (
          <Box key={item.day}>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="caption">{item.day}</Typography>
              <Typography variant="caption">{item.count}</Typography>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={(item.count / max) * 100}
              sx={{ height: 10, borderRadius: 4 }}
            />
          </Box>
        ))}
      </Stack>
    );
  }

  if (widget.key === "top_sources") {
    const items =
      (widget.data.items as Array<{ source_name: string; count: number }>) || [];
    const max = Math.max(1, ...items.map((item) => item.count));

    return (
      <Stack spacing={1}>
        {items.map((item) => (
          <Box key={item.source_name}>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2">{item.source_name}</Typography>
              <Typography variant="body2">{item.count}</Typography>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={(item.count / max) * 100}
              sx={{ height: 10, borderRadius: 4 }}
            />
          </Box>
        ))}
      </Stack>
    );
  }

  if (widget.key === "state_distribution") {
    const items = (widget.data.items as Array<{ state: string; count: number }>) || [];
    const total = items.reduce((acc, item) => acc + item.count, 0) || 1;

    return (
      <Stack spacing={1}>
        {items.map((item) => (
          <Stack key={item.state} direction="row" justifyContent="space-between" alignItems="center">
            <Chip label={item.state} size="small" />
            <Typography variant="body2">{item.count} ({Math.round((item.count / total) * 100)}%)</Typography>
          </Stack>
        ))}
      </Stack>
    );
  }

  return <Typography color="text.secondary">Widget non supportato.</Typography>;
}

export default function HomePage() {
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

  const orderedWidgets = useMemo(() => {
    if (!dashboard) {
      return [];
    }
    return [...dashboard.widgets]
      .filter((item) => item.enabled)
      .sort((a, b) => a.order - b.order);
  }, [dashboard]);

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
    return <LinearProgress />;
  }

  return (
    <Stack spacing={2}>
      {error ? <Alert severity="error">{error}</Alert> : null}
      {success ? <Alert severity="success">{success}</Alert> : null}

      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Tenant (alert attivi)
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                Drag and drop per ordinamento manuale persistito.
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
                      border: "1px solid #e0e0e0",
                      borderRadius: 2,
                      p: 1,
                      bgcolor: dragState?.index === index ? "#f0f7ff" : "#fff",
                      cursor: "grab",
                    }}
                  >
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Stack direction="row" spacing={1} alignItems="center">
                        <DragIndicatorIcon fontSize="small" />
                        <Typography variant="body2">
                          {tenant.name} ({tenant.schema_name})
                        </Typography>
                      </Stack>
                      <Chip label={`${tenant.active_alerts} attivi`} color="error" size="small" />
                    </Stack>
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="h6">Configura widget dashboard</Typography>
                <Button
                  startIcon={<SaveIcon />}
                  variant="contained"
                  onClick={() => {
                    void saveLayout();
                  }}
                  disabled={saving}
                >
                  Salva layout
                </Button>
              </Stack>

              <Stack spacing={1}>
                {layoutDraft
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((item, index) => {
                    const metadata = dashboard?.available_widgets.find((w) => w.key === item.key);
                    return (
                      <Box key={item.key} sx={{ border: "1px solid #e0e0e0", borderRadius: 2, p: 1 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Box>
                            <Typography variant="body2">{metadata?.title ?? item.key}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {metadata?.description}
                            </Typography>
                          </Box>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <FormControlLabel
                              control={
                                <Switch
                                  checked={item.enabled}
                                  onChange={(event) => updateLayoutItem(item.key, { enabled: event.target.checked })}
                                />
                              }
                              label="Visibile"
                            />
                            <Button
                              size="small"
                              onClick={() => moveLayoutItem(item.key, -1)}
                              disabled={index === 0}
                            >
                              <ArrowUpwardIcon fontSize="small" />
                            </Button>
                            <Button
                              size="small"
                              onClick={() => moveLayoutItem(item.key, 1)}
                              disabled={index === layoutDraft.length - 1}
                            >
                              <ArrowDownwardIcon fontSize="small" />
                            </Button>
                          </Stack>
                        </Stack>
                      </Box>
                    );
                  })}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Divider />

      <Grid container spacing={2}>
        {orderedWidgets.map((widget) => (
          <Grid item xs={12} md={4} key={widget.key}>
            <Card sx={{ height: "100%" }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  {widget.title}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                  {widget.description}
                </Typography>
                {renderWidgetContent(widget)}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Stack>
  );
}
