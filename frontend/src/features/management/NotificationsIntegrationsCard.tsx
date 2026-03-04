import { Card, CardContent, Divider, Stack, Switch, TextField, Typography } from "@mui/material";

import type { ManagementSettings } from "./types";
import { surfaceCardSx } from "../../styles/surfaces";

type Props = {
  settings: ManagementSettings;
  onChange: (partial: Partial<ManagementSettings>) => void;
};

export default function NotificationsIntegrationsCard({ settings, onChange }: Props) {
  return (
    <Card sx={surfaceCardSx}>
      <CardContent>
        <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>Notifiche & Integrations</Typography>
        <Divider sx={{ mb: 2, borderColor: "rgba(148,163,184,0.2)" }} />
        <Stack spacing={1.2}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography sx={{ color: "#e2e8f0" }}>Notifica critical</Typography>
            <Switch checked={settings.notifyOnCritical} onChange={(event) => onChange({ notifyOnCritical: event.target.checked })} />
          </Stack>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography sx={{ color: "#e2e8f0" }}>Notifica high</Typography>
            <Switch checked={settings.notifyOnHigh} onChange={(event) => onChange({ notifyOnHigh: event.target.checked })} />
          </Stack>
          <TextField label="Canali principali" value={settings.notifyChannels} onChange={(event) => onChange({ notifyChannels: event.target.value })} />
          <TextField label="Webhook endpoint" value={settings.webhookEndpoint} onChange={(event) => onChange({ webhookEndpoint: event.target.value })} />
          <TextField label="PagerDuty key" value={settings.pagerDutyKey} onChange={(event) => onChange({ pagerDutyKey: event.target.value })} />
          <TextField label="Slack channel" value={settings.slackChannel} onChange={(event) => onChange({ slackChannel: event.target.value })} />
        </Stack>
      </CardContent>
    </Card>
  );
}
