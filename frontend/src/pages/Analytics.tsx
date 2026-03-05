import PrintIcon from "@mui/icons-material/Print";
import { Alert, Button, GlobalStyles, Stack, Tab, Tabs, TextField, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "../context/AuthContext";
import {
  fetchAnalyticsByCustomer,
  fetchAnalyticsBySource,
  fetchAnalyticsHeatmap,
  fetchAnalyticsOverview,
} from "../services/analyticsApi";
import {
  AnalyticsByCustomerItem,
  AnalyticsBySourceItem,
  AnalyticsHeatmapResponse,
  AnalyticsOverviewResponse,
} from "../types/analytics";
import TabOverview from "./Analytics/TabOverview";
import TabPerCliente from "./Analytics/TabPerCliente";
import TabPerFonte from "./Analytics/TabPerFonte";

function toLocalDateTimeInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<AnalyticsOverviewResponse | null>(null);
  const [bySource, setBySource] = useState<AnalyticsBySourceItem[]>([]);
  const [byCustomer, setByCustomer] = useState<AnalyticsByCustomerItem[]>([]);
  const [heatmap, setHeatmap] = useState<AnalyticsHeatmapResponse>({ matrix: Array.from({ length: 7 }, () => Array(24).fill(0)) });

  const canViewAnalytics = Boolean(user?.permissions?.triage || user?.permissions?.manage_customers || user?.permissions?.admin);
  const canViewCustomer = Boolean(user?.permissions?.manage_customers);

  const defaultTo = useMemo(() => new Date(), []);
  const defaultFrom = useMemo(() => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), []);
  const [fromValue, setFromValue] = useState(toLocalDateTimeInput(defaultFrom));
  const [toValue, setToValue] = useState(toLocalDateTimeInput(defaultTo));

  const load = async () => {
    if (!canViewAnalytics) {
      return;
    }
    setLoading(true);
    setError(null);

    const params = {
      from: new Date(fromValue).toISOString(),
      to: new Date(toValue).toISOString(),
    };

    try {
      const [overviewPayload, sourcePayload, customerPayload, heatmapPayload] = await Promise.all([
        fetchAnalyticsOverview(params),
        fetchAnalyticsBySource(params),
        canViewCustomer ? fetchAnalyticsByCustomer(params) : Promise.resolve([] as AnalyticsByCustomerItem[]),
        canViewCustomer ? fetchAnalyticsHeatmap(params) : Promise.resolve({ matrix: Array.from({ length: 7 }, () => Array(24).fill(0)) }),
      ]);
      setOverview(overviewPayload);
      setBySource(sourcePayload);
      setByCustomer(customerPayload);
      setHeatmap(heatmapPayload);
    } catch {
      setError("Caricamento analytics non riuscito.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [canViewAnalytics]);

  if (!canViewAnalytics) {
    return <Alert severity="warning">Accesso analytics consentito solo ai ruoli analyst/manager/admin.</Alert>;
  }

  return (
    <Stack spacing={1.2} className="print-analytics" data-testid="analytics-page">
      <GlobalStyles
        styles={{
          "@media print": {
            ".MuiDrawer-root": { display: "none !important" },
            ".MuiAppBar-root": { display: "none !important" },
            ".print-analytics": { margin: 0, padding: 0 },
          },
        }}
      />
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Analytics
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={<PrintIcon />}
            onClick={() => {
              window.print();
            }}
          >
            Esporta Report PDF
          </Button>
          <Button variant="contained" disabled={loading} onClick={() => void load()}>
            Aggiorna
          </Button>
        </Stack>
      </Stack>

      <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
        <TextField
          label="Da"
          type="datetime-local"
          value={fromValue}
          onChange={(event) => setFromValue(event.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          label="A"
          type="datetime-local"
          value={toValue}
          onChange={(event) => setToValue(event.target.value)}
          InputLabelProps={{ shrink: true }}
        />
      </Stack>

      {error ? <Alert severity="error">{error}</Alert> : null}

      <Tabs value={tab} onChange={(_, value) => setTab(value)}>
        <Tab label="Panoramica" data-testid="analytics-tab-overview" />
        <Tab label="Per Fonte" data-testid="analytics-tab-source" />
        <Tab label="Per Cliente" data-testid="analytics-tab-customer" />
      </Tabs>

      {tab === 0 ? <TabOverview data={overview} /> : null}
      {tab === 1 ? <TabPerFonte data={bySource} /> : null}
      {tab === 2 ? <TabPerCliente canView={canViewCustomer} data={byCustomer} matrix={heatmap.matrix} /> : null}
    </Stack>
  );
}
