import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { Alert, Box, Button, Chip, LinearProgress, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../services/api";
import { fetchAlerts } from "../services/alertsApi";
import { fetchDashboardTenants } from "../services/dashboardApi";
import { fetchSources } from "../services/ingestionApi";
import { Alert as AlertModel } from "../types/alerts";
import { DashboardTenantSummary } from "../types/dashboard";
import { Source } from "../types/ingestion";

type ContextResponse = { tenant: string };

function buildTenantEntryUrl(tenant: DashboardTenantSummary): string {
  const path = "/active-alarms";
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

function severityColor(severity: AlertModel["severity"]) {
  if (severity === "critical") {
    return { fg: "#fca5a5", border: "rgba(248,113,113,0.35)", bg: "rgba(127,29,29,0.2)" };
  }
  if (severity === "high") {
    return { fg: "#fdba74", border: "rgba(249,115,22,0.35)", bg: "rgba(124,45,18,0.2)" };
  }
  if (severity === "medium") {
    return { fg: "#fcd34d", border: "rgba(234,179,8,0.35)", bg: "rgba(113,63,18,0.2)" };
  }
  return { fg: "#93c5fd", border: "rgba(59,130,246,0.35)", bg: "rgba(30,64,175,0.2)" };
}

export default function ActiveAlarmsPage() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [contextTenant, setContextTenant] = useState<string>("public");
  const [alerts, setAlerts] = useState<AlertModel[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [tenants, setTenants] = useState<DashboardTenantSummary[]>([]);

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const context = await api.get<ContextResponse>("/core/context/");
      const schemaName = context.data.tenant || "public";
      setContextTenant(schemaName);

      if (schemaName === "public") {
        const tenantData = await fetchDashboardTenants();
        setTenants(tenantData);
        setAlerts([]);
        setSources([]);
      } else {
        const [alertData, sourceData] = await Promise.all([
          fetchAlerts({ is_active: "true" }),
          fetchSources(),
        ]);
        setAlerts(alertData);
        setSources(sourceData);
        setTenants([]);
      }
    } catch {
      setError("Impossibile caricare la pagina Active Alarms.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const criticalCount = useMemo(
    () => alerts.filter((item) => item.severity === "critical").length,
    [alerts],
  );

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

      <Box>
        <Typography sx={{ color: "#f8fafc", fontSize: { xs: 26, md: 34 }, fontWeight: 700 }}>Active Alarms</Typography>
        <Typography sx={{ color: "#64748b" }}>
          {contextTenant === "public"
            ? "Seleziona un cliente per entrare nella vista allarmi attivi tenant."
            : `Schema tenant attivo: ${contextTenant}`}
        </Typography>
      </Box>

      {contextTenant === "public" ? (
        <Paper
          sx={{
            borderRadius: 3,
            border: "1px solid rgba(71,85,105,0.45)",
            background: "linear-gradient(180deg, rgba(15,23,42,0.95), rgba(8,17,37,0.9))",
            p: 2,
          }}
        >
          <Stack spacing={1}>
            {tenants.map((tenant) => (
              <Stack
                key={tenant.schema_name}
                direction={{ xs: "column", md: "row" }}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", md: "center" }}
                spacing={1}
                sx={{
                  p: 1.2,
                  borderRadius: 2,
                  border: "1px solid rgba(71,85,105,0.4)",
                  bgcolor: "rgba(15,23,42,0.55)",
                }}
              >
                <Box>
                  <Typography sx={{ color: "#e2e8f0", fontWeight: 600 }}>
                    {tenant.name} ({tenant.schema_name})
                  </Typography>
                  <Typography sx={{ color: "#64748b", fontSize: 12 }}>{tenant.domain}</Typography>
                </Box>

                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip
                    size="small"
                    label={`${tenant.active_alerts} alert attivi`}
                    sx={{ color: "#fca5a5", border: "1px solid rgba(248,113,113,0.4)", background: "rgba(127,29,29,0.2)" }}
                  />
                  <Button
                    size="small"
                    variant="outlined"
                    endIcon={<OpenInNewIcon fontSize="small" />}
                    sx={{ borderColor: "rgba(59,130,246,0.5)", color: "#93c5fd" }}
                    onClick={() => window.location.assign(buildTenantEntryUrl(tenant))}
                  >
                    Apri Active Alarms
                  </Button>
                </Stack>
              </Stack>
            ))}
          </Stack>
        </Paper>
      ) : (
        <>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.2}>
            <Chip
              label={`Alert attivi: ${alerts.length}`}
              sx={{ color: "#93c5fd", border: "1px solid rgba(59,130,246,0.4)", background: "rgba(30,64,175,0.2)" }}
            />
            <Chip
              label={`Critical: ${criticalCount}`}
              sx={{ color: "#fca5a5", border: "1px solid rgba(248,113,113,0.4)", background: "rgba(127,29,29,0.2)" }}
            />
            <Chip
              label={`Fonti: ${sources.length}`}
              sx={{ color: "#86efac", border: "1px solid rgba(74,222,128,0.35)", background: "rgba(20,83,45,0.2)" }}
            />
          </Stack>

          <Paper
            sx={{
              borderRadius: 3,
              border: "1px solid rgba(71,85,105,0.45)",
              background: "linear-gradient(180deg, rgba(15,23,42,0.95), rgba(8,17,37,0.9))",
              p: 0,
            }}
          >
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ color: "#64748b", borderBottomColor: "rgba(71,85,105,0.35)", fontWeight: 700 }}>Severity</TableCell>
                  <TableCell sx={{ color: "#64748b", borderBottomColor: "rgba(71,85,105,0.35)", fontWeight: 700 }}>Titolo</TableCell>
                  <TableCell sx={{ color: "#64748b", borderBottomColor: "rgba(71,85,105,0.35)", fontWeight: 700 }}>Fonte</TableCell>
                  <TableCell sx={{ color: "#64748b", borderBottomColor: "rgba(71,85,105,0.35)", fontWeight: 700 }}>Stato</TableCell>
                  <TableCell sx={{ color: "#64748b", borderBottomColor: "rgba(71,85,105,0.35)", fontWeight: 700 }}>Evento</TableCell>
                  <TableCell sx={{ color: "#64748b", borderBottomColor: "rgba(71,85,105,0.35)", fontWeight: 700 }}>Azione</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {alerts.map((alertItem) => {
                  const tone = severityColor(alertItem.severity);
                  return (
                    <TableRow key={alertItem.id}>
                      <TableCell sx={{ borderBottomColor: "rgba(71,85,105,0.25)" }}>
                        <Chip
                          size="small"
                          label={alertItem.severity.toUpperCase()}
                          sx={{ color: tone.fg, border: `1px solid ${tone.border}`, background: tone.bg }}
                        />
                      </TableCell>
                      <TableCell sx={{ color: "#e2e8f0", borderBottomColor: "rgba(71,85,105,0.25)" }}>{alertItem.title}</TableCell>
                      <TableCell sx={{ color: "#94a3b8", borderBottomColor: "rgba(71,85,105,0.25)" }}>{alertItem.source_name}</TableCell>
                      <TableCell sx={{ color: "#cbd5e1", borderBottomColor: "rgba(71,85,105,0.25)" }}>{alertItem.current_state_detail?.name ?? "-"}</TableCell>
                      <TableCell sx={{ color: "#94a3b8", borderBottomColor: "rgba(71,85,105,0.25)" }}>
                        {new Date(alertItem.event_timestamp).toLocaleString("it-IT")}
                      </TableCell>
                      <TableCell sx={{ borderBottomColor: "rgba(71,85,105,0.25)" }}>
                        <Button size="small" variant="text" sx={{ color: "#60a5fa" }} onClick={() => navigate(`/alerts/${alertItem.id}`)}>
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Paper>
        </>
      )}
    </Stack>
  );
}
