import { Card, CardContent, Divider, MenuItem, Stack, Switch, TextField, Typography } from "@mui/material";

import type { CustomerSettings } from "./types";
import { surfaceCardSx } from "../../styles/surfaces";

type Props = {
  settings: CustomerSettings;
  onChange: (partial: Partial<CustomerSettings>) => void;
};

export default function CustomerAlarmPolicyCard({ settings, onChange }: Props) {
  return (
    <Card sx={surfaceCardSx}>
      <CardContent>
        <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>Policy allarmi</Typography>
        <Divider sx={{ mb: 2, borderColor: "rgba(148,163,184,0.2)" }} />
        <Stack spacing={1.2}>
          <TextField
            select
            label="Default severity"
            value={settings.defaultSeverity}
            onChange={(event) => onChange({ defaultSeverity: event.target.value })}
          >
            {[
              "critical",
              "high",
              "medium",
              "low",
            ].map((item) => (
              <MenuItem key={item} value={item}>{item}</MenuItem>
            ))}
          </TextField>
          <TextField label="Tag predefiniti" value={settings.tagDefaults} onChange={(event) => onChange({ tagDefaults: event.target.value })} />
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography sx={{ color: "#e2e8f0" }}>Consenti soppressione</Typography>
            <Switch checked={settings.allowSuppress} onChange={(event) => onChange({ allowSuppress: event.target.checked })} />
          </Stack>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography sx={{ color: "#e2e8f0" }}>Enrichment GEO</Typography>
            <Switch checked={settings.enrichGeo} onChange={(event) => onChange({ enrichGeo: event.target.checked })} />
          </Stack>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography sx={{ color: "#e2e8f0" }}>Enrichment Threat Intel</Typography>
            <Switch checked={settings.enrichThreatIntel} onChange={(event) => onChange({ enrichThreatIntel: event.target.checked })} />
          </Stack>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography sx={{ color: "#e2e8f0" }}>Condivisione esterna</Typography>
            <Switch checked={settings.allowExternalSharing} onChange={(event) => onChange({ allowExternalSharing: event.target.checked })} />
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
