import { Card, CardContent, Divider, Stack, TextField, Typography } from "@mui/material";

import type { CustomerSettings } from "./types";
import { surfaceCardSx } from "../../styles/surfaces";

type Props = {
  settings: CustomerSettings;
  onChange: (partial: Partial<CustomerSettings>) => void;
  errors?: Partial<Record<keyof CustomerSettings, string>>;
};

export default function CustomerRetentionCard({ settings, onChange, errors = {} }: Props) {
  return (
    <Card sx={surfaceCardSx}>
      <CardContent>
        <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>Retention & Compliance</Typography>
        <Divider sx={{ mb: 2, borderColor: "rgba(148,163,184,0.2)" }} />
        <Stack spacing={1.2}>
          <TextField
            label="Retention (days)"
            type="number"
            value={settings.retentionDays}
            error={Boolean(errors.retentionDays)}
            helperText={errors.retentionDays}
            onChange={(event) => onChange({ retentionDays: Number(event.target.value) })}
          />
        </Stack>
      </CardContent>
    </Card>
  );
}
