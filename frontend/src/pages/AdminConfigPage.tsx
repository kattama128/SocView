import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useMemo, useState } from "react";

import { mockAlarms, mockCustomers } from "../mocks/activeAlarmsData";
import { loadGlobalSourcesConfig } from "../mocks/sourceCatalog";

const policyDefaults = [
  { key: "autoAssignCritical", label: "Auto-assegna allarmi critical", description: "Instrada automaticamente ai SOC Manager." },
  { key: "notifyOnHigh", label: "Notifiche immediate per high", description: "Invia alert real-time ai canali principali." },
  { key: "enforceMfa", label: "MFA obbligatoria", description: "Richiedi MFA per tutti gli utenti SOC." },
  { key: "retainRaw", label: "Retention raw payload", description: "Conserva i payload grezzi per 90 giorni." },
];

const roles = [
  { role: "SUPER_ADMIN", users: 1, scope: "Gestione globale piattaforma" },
  { role: "SOC_MANAGER", users: 3, scope: "Policy, fonti, severity" },
  { role: "SOC_ANALYST", users: 12, scope: "Gestione allarmi e triage" },
];

export default function AdminConfigPage() {
  const [policies, setPolicies] = useState<Record<string, boolean>>({
    autoAssignCritical: true,
    notifyOnHigh: true,
    enforceMfa: false,
    retainRaw: true,
  });

  const sources = useMemo(() => loadGlobalSourcesConfig(), []);
  const totalAlerts = mockAlarms.length;
  const activeAlerts = mockAlarms.filter((alarm) => alarm.status !== "closed").length;

  return (
    <Stack spacing={2}>
      <Box>
        <Typography sx={{ color: "#f8fafc", fontSize: { xs: 26, md: 34 }, fontWeight: 700 }}>Management</Typography>
        <Typography sx={{ color: "#64748b" }}>
          Console di gestione globale della piattaforma: policy, ruoli, integrazioni e stato.
        </Typography>
      </Box>

      <Grid container spacing={2}>
        <Grid item xs={12} md={3}>
          <Card sx={{ borderRadius: 3, border: "1px solid rgba(148,163,184,0.24)", background: "linear-gradient(180deg, rgba(15,23,42,0.88), rgba(15,23,42,0.72))" }}>
            <CardContent>
              <Typography sx={{ color: "#94a3b8" }}>Clienti attivi</Typography>
              <Typography sx={{ color: "#f8fafc", fontSize: 28, fontWeight: 700 }}>{mockCustomers.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card sx={{ borderRadius: 3, border: "1px solid rgba(148,163,184,0.24)", background: "linear-gradient(180deg, rgba(15,23,42,0.88), rgba(15,23,42,0.72))" }}>
            <CardContent>
              <Typography sx={{ color: "#94a3b8" }}>Fonti globali</Typography>
              <Typography sx={{ color: "#f8fafc", fontSize: 28, fontWeight: 700 }}>{sources.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card sx={{ borderRadius: 3, border: "1px solid rgba(148,163,184,0.24)", background: "linear-gradient(180deg, rgba(15,23,42,0.88), rgba(15,23,42,0.72))" }}>
            <CardContent>
              <Typography sx={{ color: "#94a3b8" }}>Allarmi attivi</Typography>
              <Typography sx={{ color: "#f8fafc", fontSize: 28, fontWeight: 700 }}>{activeAlerts}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card sx={{ borderRadius: 3, border: "1px solid rgba(148,163,184,0.24)", background: "linear-gradient(180deg, rgba(15,23,42,0.88), rgba(15,23,42,0.72))" }}>
            <CardContent>
              <Typography sx={{ color: "#94a3b8" }}>Allarmi totali</Typography>
              <Typography sx={{ color: "#f8fafc", fontSize: 28, fontWeight: 700 }}>{totalAlerts}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card sx={{ borderRadius: 3, border: "1px solid rgba(148,163,184,0.24)", background: "linear-gradient(180deg, rgba(15,23,42,0.88), rgba(15,23,42,0.72))" }}>
        <CardContent>
          <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>Policy globali</Typography>
          <Divider sx={{ mb: 2, borderColor: "rgba(148,163,184,0.2)" }} />
          <Stack spacing={1.2}>
            {policyDefaults.map((policy) => (
              <Stack key={policy.key} direction={{ xs: "column", md: "row" }} spacing={1} alignItems={{ xs: "flex-start", md: "center" }} justifyContent="space-between">
                <Box>
                  <Typography sx={{ color: "#f8fafc" }}>{policy.label}</Typography>
                  <Typography sx={{ color: "#64748b", fontSize: 13 }}>{policy.description}</Typography>
                </Box>
                <Switch
                  checked={policies[policy.key]}
                  onChange={(event) => setPolicies((current) => ({ ...current, [policy.key]: event.target.checked }))}
                />
              </Stack>
            ))}
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ borderRadius: 3, border: "1px solid rgba(148,163,184,0.24)", background: "linear-gradient(180deg, rgba(15,23,42,0.88), rgba(15,23,42,0.72))" }}>
        <CardContent>
          <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>Ruoli e accessi</Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ color: "#94a3b8" }}>Ruolo</TableCell>
                <TableCell sx={{ color: "#94a3b8" }}>Utenti</TableCell>
                <TableCell sx={{ color: "#94a3b8" }}>Ambito</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {roles.map((role) => (
                <TableRow key={role.role}>
                  <TableCell sx={{ color: "#e2e8f0" }}>{role.role}</TableCell>
                  <TableCell sx={{ color: "#cbd5e1" }}>{role.users}</TableCell>
                  <TableCell sx={{ color: "#94a3b8" }}>{role.scope}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card sx={{ borderRadius: 3, border: "1px solid rgba(148,163,184,0.24)", background: "linear-gradient(180deg, rgba(15,23,42,0.88), rgba(15,23,42,0.72))" }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography sx={{ color: "#e2e8f0", fontWeight: 700 }}>Integrazioni globali</Typography>
            <Chip
              size="small"
              label={`Attive: ${sources.filter((item) => item.enabled).length}/${sources.length}`}
              sx={{ color: "#86efac", border: "1px solid rgba(74,222,128,0.35)", background: "rgba(20,83,45,0.2)" }}
            />
          </Stack>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ color: "#94a3b8" }}>Fonte</TableCell>
                <TableCell sx={{ color: "#94a3b8" }}>Metodo</TableCell>
                <TableCell sx={{ color: "#94a3b8" }}>Auth</TableCell>
                <TableCell sx={{ color: "#94a3b8" }}>Stato</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sources.map((source) => (
                <TableRow key={source.id}>
                  <TableCell sx={{ color: "#e2e8f0" }}>{source.name}</TableCell>
                  <TableCell sx={{ color: "#cbd5e1" }}>{source.method}</TableCell>
                  <TableCell sx={{ color: "#94a3b8" }}>{source.authType}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={source.enabled ? "Attiva" : "Disattiva"}
                      sx={{
                        color: source.enabled ? "#86efac" : "#fca5a5",
                        border: `1px solid ${source.enabled ? "rgba(74,222,128,0.35)" : "rgba(248,113,113,0.4)"}`,
                        background: source.enabled ? "rgba(20,83,45,0.2)" : "rgba(127,29,29,0.2)",
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Stack>
  );
}
