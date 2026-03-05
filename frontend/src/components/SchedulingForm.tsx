import {
  Alert,
  Box,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import CronExpressionParser from "cron-parser";
import { useEffect, useMemo, useState } from "react";

import { SourceType } from "../types/ingestion";

type SchedulingPayload = {
  schedule_cron: string | null;
  schedule_interval_minutes: number | null;
};

type SchedulingFormProps = {
  sourceType: SourceType;
  scheduleCron: string | null;
  scheduleIntervalMinutes: number | null;
  onChange: (next: SchedulingPayload) => void;
};

function formatTime(date: Date): string {
  return date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

export default function SchedulingForm({
  sourceType,
  scheduleCron,
  scheduleIntervalMinutes,
  onChange,
}: SchedulingFormProps) {
  const pollingSupported = sourceType === "imap" || sourceType === "rest";
  const isAutomatic = Boolean(scheduleCron) || scheduleIntervalMinutes !== null;
  const [automaticMode, setAutomaticMode] = useState<"interval" | "cron">(scheduleCron ? "cron" : "interval");

  useEffect(() => {
    setAutomaticMode(scheduleCron ? "cron" : "interval");
  }, [scheduleCron]);

  const intervalPreview = useMemo(() => {
    if (!scheduleIntervalMinutes || scheduleIntervalMinutes < 1) {
      return "Inserisci un intervallo valido in minuti.";
    }
    const next = new Date(Date.now() + scheduleIntervalMinutes * 60_000);
    return `Prossima esecuzione: tra ${scheduleIntervalMinutes} minuti (alle ${formatTime(next)}).`;
  }, [scheduleIntervalMinutes]);

  const cronPreview = useMemo(() => {
    if (!scheduleCron?.trim()) {
      return "Inserisci una cron expression valida.";
    }
    try {
      const next = CronExpressionParser.parse(scheduleCron, { currentDate: new Date() }).next().toDate();
      return `Prossima esecuzione: alle ${formatTime(next)}.`;
    } catch {
      return "Cron expression non valida.";
    }
  }, [scheduleCron]);

  const handleAutomaticToggle = (checked: boolean) => {
    if (!checked) {
      onChange({ schedule_cron: null, schedule_interval_minutes: null });
      return;
    }
    if (automaticMode === "cron") {
      onChange({ schedule_cron: scheduleCron?.trim() || "*/15 * * * *", schedule_interval_minutes: null });
      return;
    }
    onChange({ schedule_cron: null, schedule_interval_minutes: scheduleIntervalMinutes ?? 5 });
  };

  if (!pollingSupported) {
    return (
      <Alert severity="info">
        Scheduling automatico non disponibile per il tipo sorgente selezionato.
      </Alert>
    );
  }

  return (
    <Stack spacing={1.2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography sx={{ color: "#e2e8f0", fontWeight: 600 }}>Scheduling</Typography>
        <FormControlLabel
          control={
            <Switch
              checked={isAutomatic}
              onChange={(event) => handleAutomaticToggle(event.target.checked)}
              data-testid="schedule-mode-toggle"
            />
          }
          label={isAutomatic ? "Automatico" : "Manuale"}
        />
      </Stack>

      {isAutomatic ? (
        <Box sx={{ border: "1px solid var(--border-subtle)", borderRadius: 1.5, p: 1.2 }}>
          <RadioGroup
            row
            value={automaticMode}
            onChange={(event) => {
              const nextMode = event.target.value as "interval" | "cron";
              setAutomaticMode(nextMode);
              if (nextMode === "interval") {
                onChange({ schedule_cron: null, schedule_interval_minutes: scheduleIntervalMinutes ?? 5 });
              } else {
                onChange({ schedule_cron: scheduleCron?.trim() || "*/15 * * * *", schedule_interval_minutes: null });
              }
            }}
          >
            <FormControlLabel value="interval" control={<Radio />} label="Ogni N minuti" />
            <FormControlLabel value="cron" control={<Radio />} label="Cron expression" />
          </RadioGroup>

          {automaticMode === "interval" ? (
            <Stack spacing={0.8}>
              <TextField
                type="number"
                size="small"
                label="Intervallo minuti"
                value={scheduleIntervalMinutes ?? 5}
                onChange={(event) =>
                  onChange({
                    schedule_cron: null,
                    schedule_interval_minutes: Math.max(Number(event.target.value) || 1, 1),
                  })
                }
              />
              <Typography sx={{ color: "#94a3b8", fontSize: 12 }}>{intervalPreview}</Typography>
            </Stack>
          ) : (
            <Stack spacing={0.8}>
              <TextField
                size="small"
                label="Cron expression"
                value={scheduleCron ?? "*/15 * * * *"}
                onChange={(event) =>
                  onChange({
                    schedule_cron: event.target.value.trim(),
                    schedule_interval_minutes: null,
                  })
                }
                helperText="Formato: m h dom mon dow"
              />
              <Typography sx={{ color: cronPreview === "Cron expression non valida." ? "#fca5a5" : "#94a3b8", fontSize: 12 }}>
                {cronPreview}
              </Typography>
            </Stack>
          )}
        </Box>
      ) : (
        <Typography sx={{ color: "#94a3b8", fontSize: 12 }}>
          Modalità manuale: nessuna esecuzione pianificata automatica.
        </Typography>
      )}
    </Stack>
  );
}
