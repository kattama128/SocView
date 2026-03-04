import { Card, CardContent, Divider, MenuItem, Stack, TextField, Typography } from "@mui/material";

import type { CustomerSettings } from "./types";
import { surfaceCardSx } from "../../styles/surfaces";

type Props = {
  settings: CustomerSettings;
  onChange: (partial: Partial<CustomerSettings>) => void;
  errors?: Partial<Record<keyof CustomerSettings, string>>;
};

export default function CustomerProfileCard({ settings, onChange, errors = {} }: Props) {
  return (
    <Card sx={surfaceCardSx}>
      <CardContent>
        <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>Profilo & Contatti</Typography>
        <Divider sx={{ mb: 2, borderColor: "rgba(148,163,184,0.2)" }} />
        <Stack spacing={1.2}>
          <TextField
            select
            label="Tier"
            value={settings.tier}
            error={Boolean(errors.tier)}
            helperText={errors.tier}
            onChange={(event) => onChange({ tier: event.target.value })}
          >
            {["Bronze", "Silver", "Gold", "Platinum"].map((item) => (
              <MenuItem key={item} value={item}>
                {item}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Timezone"
            value={settings.timezone}
            error={Boolean(errors.timezone)}
            helperText={errors.timezone}
            onChange={(event) => onChange({ timezone: event.target.value })}
          />
          <TextField
            label="SLA target"
            value={settings.slaTarget}
            error={Boolean(errors.slaTarget)}
            helperText={errors.slaTarget}
            onChange={(event) => onChange({ slaTarget: event.target.value })}
          />
          <TextField label="Primary contact" value={settings.primaryContact} onChange={(event) => onChange({ primaryContact: event.target.value })} />
          <TextField
            label="Email"
            value={settings.contactEmail}
            error={Boolean(errors.contactEmail)}
            helperText={errors.contactEmail}
            onChange={(event) => onChange({ contactEmail: event.target.value })}
          />
          <TextField label="Phone" value={settings.contactPhone} onChange={(event) => onChange({ contactPhone: event.target.value })} />
        </Stack>
      </CardContent>
    </Card>
  );
}
