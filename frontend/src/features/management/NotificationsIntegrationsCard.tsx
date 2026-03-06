import { useEffect, useState } from "react";

import {
  Alert,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";

import { surfaceCardSx } from "../../styles/surfaces";
import type { NotificationPreferences } from "../../types/alerts";
import type { ManagementSettings } from "./types";

const MIN_SEVERITY_OPTIONS = [
  { value: "all", label: "Tutte le severity" },
  { value: "low", label: "Low e superiori" },
  { value: "medium", label: "Medium e superiori" },
  { value: "high", label: "High e superiori" },
  { value: "critical", label: "Solo Critical" },
] as const;

type Props = {
  settings: ManagementSettings;
  onChange: (partial: Partial<ManagementSettings>) => void;
  notifPrefs: NotificationPreferences | null;
  onSaveNotifPrefs: (prefs: Partial<NotificationPreferences>) => Promise<void>;
};

export default function NotificationsIntegrationsCard({ settings, onChange, notifPrefs, onSaveNotifPrefs }: Props) {
  const [minSeverity, setMinSeverity] = useState<string>(notifPrefs?.min_severity ?? "all");
  const [channelUi, setChannelUi] = useState<boolean>(notifPrefs?.channels?.ui ?? true);
  const [channelEmail, setChannelEmail] = useState<boolean>(notifPrefs?.channels?.email ?? false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sync when backend prefs arrive
  useEffect(() => {
    if (notifPrefs) {
      setMinSeverity(notifPrefs.min_severity);
      setChannelUi(notifPrefs.channels?.ui ?? true);
      setChannelEmail(notifPrefs.channels?.email ?? false);
    }
  }, [notifPrefs]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await onSaveNotifPrefs({
        min_severity: minSeverity as NotificationPreferences["min_severity"],
        channels: { ui: channelUi, email: channelEmail },
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      setSaveError("Errore salvataggio preferenze notifica.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card sx={surfaceCardSx}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography sx={{ color: "#e2e8f0", fontWeight: 700 }}>Notifiche & Integrazioni</Typography>
          <Button
            size="small"
            variant="contained"
            onClick={handleSave}
            disabled={saving || !notifPrefs}
            startIcon={saving ? <CircularProgress size={12} /> : null}
          >
            {saving ? "..." : "Salva"}
          </Button>
        </Stack>
        <Divider sx={{ mb: 2, borderColor: "rgba(148,163,184,0.2)" }} />

        {saveError && (
          <Alert severity="error" sx={{ mb: 1 }} onClose={() => setSaveError(null)}>
            {saveError}
          </Alert>
        )}
        {saveSuccess && (
          <Alert severity="success" sx={{ mb: 1 }}>
            Preferenze notifiche salvate.
          </Alert>
        )}

        <Typography sx={{ color: "#94a3b8", fontSize: 12, mb: 1.5, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
          Soglia notifiche — sincronizzata con il server
        </Typography>
        <Stack spacing={1.2} sx={{ mb: 2 }}>
          <TextField
            select
            label="Notifica a partire da severity"
            size="small"
            value={minSeverity}
            onChange={(e) => setMinSeverity(e.target.value)}
            disabled={!notifPrefs}
          >
            {MIN_SEVERITY_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </TextField>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography sx={{ color: "#e2e8f0" }}>Notifiche in-app (UI)</Typography>
            <Switch checked={channelUi} onChange={(e) => setChannelUi(e.target.checked)} disabled={!notifPrefs} />
          </Stack>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography sx={{ color: "#e2e8f0" }}>Notifiche email</Typography>
            <Switch checked={channelEmail} onChange={(e) => setChannelEmail(e.target.checked)} disabled={!notifPrefs} />
          </Stack>
        </Stack>

        <Divider sx={{ mb: 1.5, borderColor: "rgba(148,163,184,0.2)" }} />
        <Alert severity="info" sx={{ mb: 1.5, py: 0.5 }}>
          Configurazione locale — i campi seguenti sono salvati nel browser
        </Alert>
        <Stack spacing={1.2}>
          <TextField
            label="Canali principali"
            size="small"
            value={settings.notifyChannels}
            onChange={(e) => onChange({ notifyChannels: e.target.value })}
          />
          <TextField
            label="Webhook endpoint"
            size="small"
            value={settings.webhookEndpoint}
            onChange={(e) => onChange({ webhookEndpoint: e.target.value })}
          />
          <TextField
            label="PagerDuty integration key"
            size="small"
            value={settings.pagerDutyKey}
            onChange={(e) => onChange({ pagerDutyKey: e.target.value })}
          />
          <TextField
            label="Slack channel"
            size="small"
            value={settings.slackChannel}
            onChange={(e) => onChange({ slackChannel: e.target.value })}
          />
        </Stack>
      </CardContent>
    </Card>
  );
}
