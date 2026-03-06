import { Alert, Card, CardContent, Divider, Stack, TextField, Typography } from "@mui/material";

import { surfaceCardSx } from "../../styles/surfaces";
import type { ManagementSettings } from "./types";

type Props = {
  settings: ManagementSettings;
  onChange: (partial: Partial<ManagementSettings>) => void;
};

export default function PlatformProfileCard({ settings, onChange }: Props) {
  return (
    <Card sx={surfaceCardSx}>
      <CardContent>
        <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>Profilo piattaforma</Typography>
        <Divider sx={{ mb: 2, borderColor: "rgba(148,163,184,0.2)" }} />
        <Alert severity="info" sx={{ mb: 2, py: 0.5 }}>
          Configurazione locale — salvata nel browser, non sincronizzata con il server
        </Alert>
        <Stack spacing={1.2}>
          <TextField label="Organization" value={settings.orgName} onChange={(event) => onChange({ orgName: event.target.value })} />
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.2}>
            <TextField label="Region" value={settings.region} onChange={(event) => onChange({ region: event.target.value })} />
            <TextField label="Timezone" value={settings.timezone} onChange={(event) => onChange({ timezone: event.target.value })} />
            <TextField label="Data residency" value={settings.dataResidency} onChange={(event) => onChange({ dataResidency: event.target.value })} />
          </Stack>
          <TextField
            label="Maintenance window"
            value={settings.maintenanceWindow}
            onChange={(event) => onChange({ maintenanceWindow: event.target.value })}
          />
        </Stack>
      </CardContent>
    </Card>
  );
}
