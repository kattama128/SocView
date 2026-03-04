import { Card, CardContent, Divider, Stack, Switch, TextField, Typography } from "@mui/material";

import type { CustomerSettings } from "./types";
import { surfaceCardSx } from "../../styles/surfaces";

type Props = {
  settings: CustomerSettings;
  onChange: (partial: Partial<CustomerSettings>) => void;
};

export default function CustomerRoutingCard({ settings, onChange }: Props) {
  return (
    <Card sx={surfaceCardSx}>
      <CardContent>
        <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>Routing & Notifiche</Typography>
        <Divider sx={{ mb: 2, borderColor: "rgba(148,163,184,0.2)" }} />
        <Stack spacing={1.2}>
          <TextField label="Team assegnazione" value={settings.autoAssignTeam} onChange={(event) => onChange({ autoAssignTeam: event.target.value })} />
          <TextField label="Canali notifiche" value={settings.notifyChannels} onChange={(event) => onChange({ notifyChannels: event.target.value })} />
          <TextField label="Escalation matrix" value={settings.escalationMatrix} onChange={(event) => onChange({ escalationMatrix: event.target.value })} />
          <TextField label="Maintenance window" value={settings.maintenanceWindow} onChange={(event) => onChange({ maintenanceWindow: event.target.value })} />
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography sx={{ color: "#e2e8f0" }}>Notify critical</Typography>
            <Switch checked={settings.notifyOnCritical} onChange={(event) => onChange({ notifyOnCritical: event.target.checked })} />
          </Stack>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography sx={{ color: "#e2e8f0" }}>Notify high</Typography>
            <Switch checked={settings.notifyOnHigh} onChange={(event) => onChange({ notifyOnHigh: event.target.checked })} />
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
