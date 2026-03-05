import AccessTimeIcon from "@mui/icons-material/AccessTime";
import { Box, MenuItem, Stack, TextField, Typography } from "@mui/material";

import { TimeRangePreset, useTimeRange } from "../contexts/TimeRangeContext";

const labels: Record<TimeRangePreset, string> = {
  "1h": "Ultima ora",
  "24h": "Ultime 24 ore",
  "7d": "Ultimi 7 giorni",
  "30d": "Ultimi 30 giorni",
  custom: "Intervallo custom",
};

export default function TimeRangeSelector() {
  const { preset, customFrom, customTo, setPreset, setCustomRange } = useTimeRange();

  return (
    <Stack
      direction={{ xs: "column", md: "row" }}
      spacing={1}
      alignItems={{ xs: "flex-start", md: "center" }}
      data-testid="time-range-selector"
    >
      <Stack direction="row" spacing={0.8} alignItems="center">
        <AccessTimeIcon sx={{ fontSize: 18, color: "text.secondary" }} />
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Intervallo</Typography>
      </Stack>

      <TextField
        select
        size="small"
        value={preset}
        onChange={(event) => setPreset(event.target.value as TimeRangePreset)}
        sx={{ minWidth: 190 }}
        inputProps={{ "data-testid": "time-range-select" }}
      >
        {(Object.keys(labels) as TimeRangePreset[]).map((key) => (
          <MenuItem key={key} value={key} data-value={key}>
            {labels[key]}
          </MenuItem>
        ))}
      </TextField>

      {preset === "custom" ? (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <TextField
            size="small"
            type="datetime-local"
            label="Da"
            InputLabelProps={{ shrink: true }}
            value={customFrom}
            onChange={(event) => setCustomRange(event.target.value, customTo)}
          />
          <TextField
            size="small"
            type="datetime-local"
            label="A"
            InputLabelProps={{ shrink: true }}
            value={customTo}
            onChange={(event) => setCustomRange(customFrom, event.target.value)}
          />
        </Stack>
      ) : null}

      <Box sx={{ minWidth: 4 }} />
    </Stack>
  );
}
