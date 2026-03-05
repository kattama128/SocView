import { Alert, Box, Paper, Stack, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";

import { TimeRangeWindow } from "../contexts/TimeRangeContext";
import { useTenantApi } from "../hooks/useTenantApi";

type SeverityItem = {
  severity: "critical" | "high" | "medium" | "low";
  count: number;
};

type SeveritySummaryResponse = {
  summary: string;
  items: SeverityItem[];
};

type Props = {
  customerId?: number | null;
  timeWindow: TimeRangeWindow;
};

const severityLabelMap: Record<SeverityItem["severity"], string> = {
  critical: "Critica",
  high: "Alta",
  medium: "Media",
  low: "Bassa",
};

const severityColorMap: Record<SeverityItem["severity"], string> = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#ca8a04",
  low: "#0284c7",
};

export default function KpiSeverityTrend({ customerId, timeWindow }: Props) {
  const api = useTenantApi();
  const [items, setItems] = useState<SeverityItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setError(null);
      try {
        const response = await api.get<SeveritySummaryResponse>("/alerts/alerts/", {
          params: {
            summary: "severity",
            from: timeWindow.from,
            to: timeWindow.to,
            ...(customerId ? { customer_id: customerId } : {}),
          },
        });
        setItems(response.data.items ?? []);
      } catch {
        setError("Impossibile caricare trend severita.");
      }
    };

    void load();
  }, [api, customerId, timeWindow.from, timeWindow.to]);

  const maxValue = useMemo(() => Math.max(1, ...items.map((item) => item.count)), [items]);

  return (
    <Paper sx={{ p: 2.2, minHeight: 182 }}>
      <Stack spacing={1.3}>
        <Typography sx={{ fontWeight: 700, fontSize: 18 }}>Trend per Severita</Typography>
        {items.map((item) => {
          const width = Math.max(8, Math.round((item.count / maxValue) * 100));
          return (
            <Box key={item.severity}>
              <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.4 }}>
                <Typography sx={{ fontSize: 13 }}>{severityLabelMap[item.severity]}</Typography>
                <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{item.count}</Typography>
              </Stack>
              <Box sx={{ width: "100%", height: 9, borderRadius: 50, background: "rgba(100,116,139,0.24)" }}>
                <Box sx={{ width: `${width}%`, height: "100%", borderRadius: 50, background: severityColorMap[item.severity] }} />
              </Box>
            </Box>
          );
        })}
        {error ? <Alert severity="error">{error}</Alert> : null}
      </Stack>
    </Paper>
  );
}
