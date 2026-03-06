import { Alert, Card, CardContent, Divider, MenuItem, Stack, TextField, Typography } from "@mui/material";

import { surfaceCardSx } from "../../styles/surfaces";
import type { ManagementSettings } from "./types";

type Props = {
  settings: ManagementSettings;
  onChange: (partial: Partial<ManagementSettings>) => void;
};

export default function RetentionComplianceCard({ settings, onChange }: Props) {
  return (
    <Card sx={surfaceCardSx}>
      <CardContent>
        <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>Retention & Compliance</Typography>
        <Divider sx={{ mb: 2, borderColor: "rgba(148,163,184,0.2)" }} />
        <Alert severity="info" sx={{ mb: 2, py: 0.5 }}>
          Configurazione locale — salvata nel browser, non sincronizzata con il server
        </Alert>
        <Stack spacing={1.2}>
          <TextField
            label="Audit retention (days)"
            type="number"
            value={settings.auditRetentionDays}
            onChange={(event) => onChange({ auditRetentionDays: Number(event.target.value) })}
          />
          <TextField
            label="Raw payload retention (days)"
            type="number"
            value={settings.rawRetentionDays}
            onChange={(event) => onChange({ rawRetentionDays: Number(event.target.value) })}
          />
          <TextField
            label="Parsed payload retention (days)"
            type="number"
            value={settings.parsedRetentionDays}
            onChange={(event) => onChange({ parsedRetentionDays: Number(event.target.value) })}
          />
          <TextField
            select
            label="Export schedule"
            value={settings.exportAutoSchedule}
            onChange={(event) => onChange({ exportAutoSchedule: event.target.value })}
          >
            {["Daily", "Weekly", "Monthly"].map((item) => (
              <MenuItem key={item} value={item}>
                {item}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </CardContent>
    </Card>
  );
}
