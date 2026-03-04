import { Card, CardContent, Divider, MenuItem, Stack, Switch, TextField, Typography } from "@mui/material";

import type { ManagementSettings } from "./types";
import { surfaceCardSx } from "../../styles/surfaces";

type Props = {
  settings: ManagementSettings;
  onChange: (partial: Partial<ManagementSettings>) => void;
};

export default function SecurityAccessCard({ settings, onChange }: Props) {
  return (
    <Card sx={surfaceCardSx}>
      <CardContent>
        <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>Sicurezza & Accesso</Typography>
        <Divider sx={{ mb: 2, borderColor: "rgba(148,163,184,0.2)" }} />
        <Stack spacing={1.2}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography sx={{ color: "#e2e8f0" }}>MFA obbligatoria</Typography>
            <Switch checked={settings.mfaRequired} onChange={(event) => onChange({ mfaRequired: event.target.checked })} />
          </Stack>
          <TextField
            label="Session timeout (min)"
            type="number"
            value={settings.sessionTimeoutMinutes}
            onChange={(event) => onChange({ sessionTimeoutMinutes: Number(event.target.value) })}
          />
          <TextField
            select
            label="Password policy"
            value={settings.passwordPolicy}
            onChange={(event) => onChange({ passwordPolicy: event.target.value })}
          >
            {["Standard", "Strong", "SOC High"].map((item) => (
              <MenuItem key={item} value={item}>{item}</MenuItem>
            ))}
          </TextField>
          <TextField label="IP allowlist" value={settings.ipAllowlist} onChange={(event) => onChange({ ipAllowlist: event.target.value })} />
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography sx={{ color: "#e2e8f0" }}>SSO attiva</Typography>
            <Switch checked={settings.ssoEnabled} onChange={(event) => onChange({ ssoEnabled: event.target.checked })} />
          </Stack>
          <TextField label="SSO provider" value={settings.ssoProvider} onChange={(event) => onChange({ ssoProvider: event.target.value })} />
          <TextField
            label="API key rotation (days)"
            type="number"
            value={settings.apiKeyRotationDays}
            onChange={(event) => onChange({ apiKeyRotationDays: Number(event.target.value) })}
          />
        </Stack>
      </CardContent>
    </Card>
  );
}
