import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { Alert, Box, Button, Chip, Paper, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";

import { fetchDashboardTenants } from "../services/dashboardApi";
import { DashboardTenantSummary } from "../types/dashboard";

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

export default function CostumersPage() {
  const [tenants, setTenants] = useState<DashboardTenantSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchDashboardTenants();
        setTenants(data);
      } catch {
        setError("Impossibile caricare la lista costumers.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  return (
    <Stack spacing={2}>
      <Box>
        <Typography sx={{ color: "#f8fafc", fontSize: { xs: 26, md: 34 }, fontWeight: 700 }}>Costumers</Typography>
        <Typography sx={{ color: "#64748b" }}>Elenco tenant disponibili con accesso rapido.</Typography>
      </Box>

      {error ? (
        <Alert severity="error" sx={{ bgcolor: "rgba(127,29,29,0.2)", color: "#fecaca", border: "1px solid rgba(220,38,38,0.35)" }}>
          {error}
        </Alert>
      ) : null}

      <Paper
        sx={{
          borderRadius: 3,
          border: "1px solid rgba(71,85,105,0.45)",
          background: "linear-gradient(180deg, rgba(15,23,42,0.95), rgba(8,17,37,0.9))",
          p: 2,
        }}
      >
        {loading ? (
          <Typography sx={{ color: "#64748b" }}>Caricamento...</Typography>
        ) : (
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
                    Apri
                  </Button>
                </Stack>
              </Stack>
            ))}
          </Stack>
        )}
      </Paper>
    </Stack>
  );
}
