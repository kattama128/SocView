import AccessTimeIcon from "@mui/icons-material/AccessTime";
import { Alert, Chip, Paper, Stack, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";

import { TimeRangeWindow } from "../contexts/TimeRangeContext";
import { useTenantApi } from "../hooks/useTenantApi";

type MttrResponse = {
  summary: string;
  avg_minutes: number | null;
  sample_size: number;
};

type Props = {
  customerId?: number | null;
  timeWindow: TimeRangeWindow;
};

function formatMinutes(total: number | null): string {
  if (total === null || !Number.isFinite(total)) {
    return "N/D";
  }
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export default function KpiMttr({ customerId, timeWindow }: Props) {
  const api = useTenantApi();
  const [avgMinutes, setAvgMinutes] = useState<number | null>(null);
  const [sampleSize, setSampleSize] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setError(null);
      try {
        const response = await api.get<MttrResponse>("/alerts/alerts/", {
          params: {
            summary: "mttr",
            state__category: "closed",
            from: timeWindow.from,
            to: timeWindow.to,
            ...(customerId ? { customer_id: customerId } : {}),
          },
        });
        setAvgMinutes(response.data.avg_minutes ?? null);
        setSampleSize(Number(response.data.sample_size ?? 0));
      } catch {
        setError("Impossibile calcolare MTTR.");
      }
    };

    void load();
  }, [api, customerId, timeWindow.from, timeWindow.to]);

  const mttrLabel = useMemo(() => formatMinutes(avgMinutes), [avgMinutes]);

  return (
    <Paper sx={{ p: 2.2, minHeight: 182 }}>
      <Stack spacing={1}>
        <Typography sx={{ fontWeight: 700, fontSize: 18 }}>MTTR Medio (ultimi 7gg)</Typography>
        <Typography sx={{ fontSize: 34, fontWeight: 800, lineHeight: 1 }}>{mttrLabel}</Typography>
        <Chip size="small" icon={<AccessTimeIcon fontSize="small" />} label={`${sampleSize} alert chiusi`} />
        {error ? <Alert severity="error">{error}</Alert> : null}
      </Stack>
    </Paper>
  );
}
