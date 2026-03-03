import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";

import { mockAlarms, mockCustomers } from "../mocks/activeAlarmsData";
import { loadGlobalSourcesConfig } from "../mocks/sourceCatalog";

const storageKey = "socview_management_settings_v1";

type ManagementSettings = {
  orgName: string;
  region: string;
  timezone: string;
  dataResidency: string;
  mfaRequired: boolean;
  sessionTimeoutMinutes: number;
  passwordPolicy: string;
  ipAllowlist: string;
  ssoEnabled: boolean;
  ssoProvider: string;
  apiKeyRotationDays: number;
  auditRetentionDays: number;
  rawRetentionDays: number;
  parsedRetentionDays: number;
  exportAutoSchedule: string;
  notifyOnCritical: boolean;
  notifyOnHigh: boolean;
  notifyChannels: string;
  webhookEndpoint: string;
  pagerDutyKey: string;
  slackChannel: string;
  maintenanceWindow: string;
};

const defaultSettings: ManagementSettings = {
  orgName: "SocView Platform",
  region: "EU-West",
  timezone: "Europe/Rome",
  dataResidency: "EU",
  mfaRequired: true,
  sessionTimeoutMinutes: 120,
  passwordPolicy: "Strong",
  ipAllowlist: "",
  ssoEnabled: false,
  ssoProvider: "",
  apiKeyRotationDays: 90,
  auditRetentionDays: 365,
  rawRetentionDays: 90,
  parsedRetentionDays: 365,
  exportAutoSchedule: "Weekly",
  notifyOnCritical: true,
  notifyOnHigh: true,
  notifyChannels: "SOC Slack, Email, PagerDuty",
  webhookEndpoint: "https://socview.local/webhooks/notify",
  pagerDutyKey: "pd-key-xxxx",
  slackChannel: "#soc-alerts",
  maintenanceWindow: "Sunday 02:00 - 03:00",
};

function loadSettings(): ManagementSettings {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw) as ManagementSettings;
    return { ...defaultSettings, ...parsed };
  } catch {
    return defaultSettings;
  }
}

export default function AdminConfigPage() {
  const [settings, setSettings] = useState<ManagementSettings>(() => loadSettings());

  const sources = useMemo(() => loadGlobalSourcesConfig(), []);
  const totalAlerts = mockAlarms.length;
  const activeAlerts = mockAlarms.filter((alarm) => alarm.status !== "closed").length;

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(settings));
  }, [settings]);

  const update = (partial: Partial<ManagementSettings>) => {
    setSettings((current) => ({ ...current, ...partial }));
  };

  return (
    <Stack spacing={2}>
      <Box>
        <Typography sx={{ color: "#f8fafc", fontSize: { xs: 26, md: 34 }, fontWeight: 700 }}>Management</Typography>
        <Typography sx={{ color: "#64748b" }}>
          Console di gestione globale della piattaforma: policy, sicurezza, retention e integrazioni.
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

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Card sx={{ borderRadius: 3, border: "1px solid rgba(148,163,184,0.24)", background: "linear-gradient(180deg, rgba(15,23,42,0.88), rgba(15,23,42,0.72))" }}>
            <CardContent>
              <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>Profilo piattaforma</Typography>
              <Divider sx={{ mb: 2, borderColor: "rgba(148,163,184,0.2)" }} />
              <Stack spacing={1.2}>
                <TextField label="Organization" value={settings.orgName} onChange={(event) => update({ orgName: event.target.value })} />
                <Stack direction={{ xs: "column", md: "row" }} spacing={1.2}>
                  <TextField label="Region" value={settings.region} onChange={(event) => update({ region: event.target.value })} />
                  <TextField label="Timezone" value={settings.timezone} onChange={(event) => update({ timezone: event.target.value })} />
                  <TextField label="Data residency" value={settings.dataResidency} onChange={(event) => update({ dataResidency: event.target.value })} />
                </Stack>
                <TextField label="Maintenance window" value={settings.maintenanceWindow} onChange={(event) => update({ maintenanceWindow: event.target.value })} />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card sx={{ borderRadius: 3, border: "1px solid rgba(148,163,184,0.24)", background: "linear-gradient(180deg, rgba(15,23,42,0.88), rgba(15,23,42,0.72))" }}>
            <CardContent>
              <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>Sicurezza & Accesso</Typography>
              <Divider sx={{ mb: 2, borderColor: "rgba(148,163,184,0.2)" }} />
              <Stack spacing={1.2}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography sx={{ color: "#e2e8f0" }}>MFA obbligatoria</Typography>
                  <Switch checked={settings.mfaRequired} onChange={(event) => update({ mfaRequired: event.target.checked })} />
                </Stack>
                <TextField
                  label="Session timeout (min)"
                  type="number"
                  value={settings.sessionTimeoutMinutes}
                  onChange={(event) => update({ sessionTimeoutMinutes: Number(event.target.value) })}
                />
                <TextField
                  select
                  label="Password policy"
                  value={settings.passwordPolicy}
                  onChange={(event) => update({ passwordPolicy: event.target.value })}
                >
                  {[
                    "Standard",
                    "Strong",
                    "SOC High",
                  ].map((item) => (
                    <MenuItem key={item} value={item}>{item}</MenuItem>
                  ))}
                </TextField>
                <TextField label="IP allowlist" value={settings.ipAllowlist} onChange={(event) => update({ ipAllowlist: event.target.value })} />
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography sx={{ color: "#e2e8f0" }}>SSO attiva</Typography>
                  <Switch checked={settings.ssoEnabled} onChange={(event) => update({ ssoEnabled: event.target.checked })} />
                </Stack>
                <TextField label="SSO provider" value={settings.ssoProvider} onChange={(event) => update({ ssoProvider: event.target.value })} />
                <TextField
                  label="API key rotation (days)"
                  type="number"
                  value={settings.apiKeyRotationDays}
                  onChange={(event) => update({ apiKeyRotationDays: Number(event.target.value) })}
                />
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Card sx={{ borderRadius: 3, border: "1px solid rgba(148,163,184,0.24)", background: "linear-gradient(180deg, rgba(15,23,42,0.88), rgba(15,23,42,0.72))" }}>
            <CardContent>
              <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>Retention & Compliance</Typography>
              <Divider sx={{ mb: 2, borderColor: "rgba(148,163,184,0.2)" }} />
              <Stack spacing={1.2}>
                <TextField
                  label="Audit retention (days)"
                  type="number"
                  value={settings.auditRetentionDays}
                  onChange={(event) => update({ auditRetentionDays: Number(event.target.value) })}
                />
                <TextField
                  label="Raw payload retention (days)"
                  type="number"
                  value={settings.rawRetentionDays}
                  onChange={(event) => update({ rawRetentionDays: Number(event.target.value) })}
                />
                <TextField
                  label="Parsed payload retention (days)"
                  type="number"
                  value={settings.parsedRetentionDays}
                  onChange={(event) => update({ parsedRetentionDays: Number(event.target.value) })}
                />
                <TextField
                  select
                  label="Export schedule"
                  value={settings.exportAutoSchedule}
                  onChange={(event) => update({ exportAutoSchedule: event.target.value })}
                >
                  {[
                    "Daily",
                    "Weekly",
                    "Monthly",
                  ].map((item) => (
                    <MenuItem key={item} value={item}>{item}</MenuItem>
                  ))}
                </TextField>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card sx={{ borderRadius: 3, border: "1px solid rgba(148,163,184,0.24)", background: "linear-gradient(180deg, rgba(15,23,42,0.88), rgba(15,23,42,0.72))" }}>
            <CardContent>
              <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>Notifiche & Integrations</Typography>
              <Divider sx={{ mb: 2, borderColor: "rgba(148,163,184,0.2)" }} />
              <Stack spacing={1.2}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography sx={{ color: "#e2e8f0" }}>Notifica critical</Typography>
                  <Switch checked={settings.notifyOnCritical} onChange={(event) => update({ notifyOnCritical: event.target.checked })} />
                </Stack>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography sx={{ color: "#e2e8f0" }}>Notifica high</Typography>
                  <Switch checked={settings.notifyOnHigh} onChange={(event) => update({ notifyOnHigh: event.target.checked })} />
                </Stack>
                <TextField label="Canali principali" value={settings.notifyChannels} onChange={(event) => update({ notifyChannels: event.target.value })} />
                <TextField label="Webhook endpoint" value={settings.webhookEndpoint} onChange={(event) => update({ webhookEndpoint: event.target.value })} />
                <TextField label="PagerDuty key" value={settings.pagerDutyKey} onChange={(event) => update({ pagerDutyKey: event.target.value })} />
                <TextField label="Slack channel" value={settings.slackChannel} onChange={(event) => update({ slackChannel: event.target.value })} />
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

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
          <Divider sx={{ mb: 2, borderColor: "rgba(148,163,184,0.2)" }} />
          <Grid container spacing={1.5}>
            {sources.map((source) => (
              <Grid item xs={12} md={4} key={source.id}>
                <Card sx={{ borderRadius: 2, border: "1px solid rgba(71,85,105,0.35)", bgcolor: "rgba(15,23,42,0.6)" }}>
                  <CardContent>
                    <Typography sx={{ color: "#e2e8f0", fontWeight: 600 }}>{source.name}</Typography>
                    <Typography sx={{ color: "#94a3b8", fontSize: 12 }}>{source.method} • {source.authType}</Typography>
                    <Stack direction="row" spacing={0.5} sx={{ mt: 1 }}>
                      <Chip size="small" label={source.enabled ? "Attiva" : "Disattiva"} sx={{ color: source.enabled ? "#86efac" : "#fca5a5", border: "1px solid rgba(148,163,184,0.24)" }} />
                      <Chip size="small" label={`Parser ${source.parserEntries.length}`} sx={{ color: "#c4b5fd", border: "1px solid rgba(167,139,250,0.35)" }} />
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>
    </Stack>
  );
}
