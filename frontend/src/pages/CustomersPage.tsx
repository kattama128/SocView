import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
  Alert,
  Box,
  Button,
  Chip,
  Grid,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useCustomer } from "../context/CustomerContext";
import { fetchCustomersOverview } from "../services/alertsApi";
import { surfaceCardSx } from "../styles/surfaces";
import { CustomerOverview } from "../types/alerts";

type OrderingOption = {
  value: string;
  label: string;
};

const orderingOptions: OrderingOption[] = [
  { value: "-active_alerts_total", label: "Piu allarmi attivi" },
  { value: "-active_alerts_critical", label: "Piu critical" },
  { value: "-active_alerts_high", label: "Piu high" },
  { value: "-active_alerts_medium", label: "Piu medium" },
  { value: "-active_alerts_low", label: "Piu low" },
  { value: "name", label: "Nome (A-Z)" },
  { value: "-name", label: "Nome (Z-A)" },
  { value: "code", label: "Codice (A-Z)" },
  { value: "-created_at", label: "Piu recenti" },
];

function severityChip(label: string, value: number, tone: "critical" | "high" | "medium" | "low") {
  if (tone === "critical") {
    return (
      <Chip
        size="small"
        label={`${label}: ${value}`}
        sx={{ color: "#fca5a5", border: "1px solid rgba(248,113,113,0.4)", background: "rgba(127,29,29,0.2)" }}
      />
    );
  }
  if (tone === "high") {
    return (
      <Chip
        size="small"
        label={`${label}: ${value}`}
        sx={{ color: "#fdba74", border: "1px solid rgba(249,115,22,0.35)", background: "rgba(124,45,18,0.2)" }}
      />
    );
  }
  if (tone === "medium") {
    return (
      <Chip
        size="small"
        label={`${label}: ${value}`}
        sx={{ color: "#fcd34d", border: "1px solid rgba(234,179,8,0.35)", background: "rgba(113,63,18,0.2)" }}
      />
    );
  }
  return (
    <Chip
      size="small"
      label={`${label}: ${value}`}
      sx={{ color: "#93c5fd", border: "1px solid rgba(59,130,246,0.35)", background: "rgba(30,64,175,0.2)" }}
    />
  );
}

export default function CustomersPage() {
  const navigate = useNavigate();
  const { selectedCustomerId, setSelectedCustomerId, loading: customersLoading, error: customersError, refreshCustomers } = useCustomer();
  const [ordering, setOrdering] = useState("-active_alerts_total");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<CustomerOverview[]>([]);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCustomersOverview(ordering, true);
      setRows(data);
      await refreshCustomers();
      setError(null);
    } catch {
      setRows([]);
      setError("Impossibile caricare lista clienti con statistiche.");
    } finally {
      setLoading(false);
    }
  }, [ordering, refreshCustomers]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadOverview();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [loadOverview]);

  const selectedName = useMemo(
    () => rows.find((item) => item.id === selectedCustomerId)?.name ?? null,
    [rows, selectedCustomerId],
  );
  const totalActiveAlerts = useMemo(
    () => rows.reduce((sum, item) => sum + item.active_alerts_total, 0),
    [rows],
  );

  return (
    <Stack spacing={2} sx={{ minHeight: "calc(100vh - 148px)" }}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }} spacing={1.2}>
        <Box>
          <Typography sx={{ color: "#f8fafc", fontSize: { xs: 26, md: 34 }, fontWeight: 700 }}>Customers</Typography>
          <Typography sx={{ color: "#64748b" }}>
            Elenco clienti con conteggio allarmi attivi per severita, aggiornato via API.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <TextField
            select
            size="small"
            label="Ordina per"
            value={ordering}
            onChange={(event) => setOrdering(event.target.value)}
            sx={{ minWidth: 230 }}
          >
            {orderingOptions.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => void loadOverview()}
            sx={{ borderColor: "rgba(71,85,105,0.55)", color: "#cbd5e1" }}
          >
            Aggiorna
          </Button>
        </Stack>
      </Stack>

      {selectedName ? (
        <Chip
          label={`Cliente selezionato: ${selectedName}`}
          sx={{ width: "fit-content", color: "#93c5fd", border: "1px solid rgba(59,130,246,0.35)", background: "rgba(30,64,175,0.2)" }}
        />
      ) : null}
      {customersError ? <Alert severity="warning">{customersError}</Alert> : null}
      {error ? <Alert severity="error">{error}</Alert> : null}

      <Paper sx={{ ...surfaceCardSx, p: 1.3 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1} justifyContent="space-between">
          <Chip label={`Clienti visibili: ${rows.length}`} sx={{ color: "#bfdbfe", border: "1px solid rgba(59,130,246,0.35)", background: "rgba(30,64,175,0.16)" }} />
          <Chip label={`Allarmi attivi totali: ${totalActiveAlerts}`} sx={{ color: "#fecaca", border: "1px solid rgba(248,113,113,0.35)", background: "rgba(127,29,29,0.16)" }} />
        </Stack>
      </Paper>

      <Paper sx={{ ...surfaceCardSx, p: 0, display: "flex", flexDirection: "column", minHeight: { xs: 420, lg: 520 } }}>
        {loading || customersLoading ? <LinearProgress /> : null}
        <Box sx={{ p: 1.5, overflowY: "auto", maxHeight: { xs: 520, lg: 640 } }}>
          {!loading && !rows.length ? (
            <Typography sx={{ color: "#94a3b8" }}>Nessun cliente disponibile.</Typography>
          ) : null}
          <Grid container spacing={1.2}>
            {rows.map((customer) => (
              <Grid item xs={12} md={6} xl={4} key={customer.id}>
                <Box
                  onClick={() => {
                    setSelectedCustomerId(customer.id);
                    navigate(`/customers/${customer.id}`);
                  }}
                  sx={{
                    p: 1.2,
                    borderRadius: 2,
                    height: "100%",
                    border:
                      selectedCustomerId === customer.id
                        ? "1px solid rgba(59,130,246,0.6)"
                        : "1px solid var(--border-subtle)",
                    bgcolor:
                      selectedCustomerId === customer.id
                        ? "rgba(59,130,246,0.12)"
                        : "var(--surface-3)",
                    cursor: "pointer",
                  }}
                >
                  <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }} spacing={1}>
                    <Box>
                      <Typography sx={{ color: "#e2e8f0", fontWeight: 600 }}>
                        {customer.name} {customer.code ? `(${customer.code})` : ""}
                      </Typography>
                      <Typography sx={{ color: "#64748b", fontSize: 12 }}>
                        ID {customer.id} • Stato: {customer.is_enabled ? "attivo" : "disabilitato"}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={0.8} alignItems="center" useFlexGap flexWrap="wrap">
                      <Chip
                        size="small"
                        label={`Tot: ${customer.active_alerts_total}`}
                        sx={{ color: "#e2e8f0", border: "1px solid rgba(148,163,184,0.4)", background: "rgba(15,23,42,0.8)" }}
                      />
                      {severityChip("C", customer.active_alerts_by_severity.critical, "critical")}
                      {severityChip("H", customer.active_alerts_by_severity.high, "high")}
                      {severityChip("M", customer.active_alerts_by_severity.medium, "medium")}
                      {severityChip("L", customer.active_alerts_by_severity.low, "low")}
                      <Chip
                        size="small"
                        icon={<OpenInNewIcon />}
                        label="Apri"
                        sx={{ color: "#93c5fd", border: "1px solid rgba(59,130,246,0.45)", background: "rgba(30,64,175,0.18)" }}
                      />
                    </Stack>
                  </Stack>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Box>
      </Paper>
    </Stack>
  );
}
