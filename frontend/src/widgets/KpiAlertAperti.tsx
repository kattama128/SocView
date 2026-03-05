import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TrendingFlatIcon from "@mui/icons-material/TrendingFlat";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import { Alert, Box, Chip, Paper, Stack, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";

import { TimeRangeWindow } from "../contexts/TimeRangeContext";
import { useTenantApi } from "../hooks/useTenantApi";

type AlertCountResponse = { count: number };

type Props = {
  customerId?: number | null;
  timeWindow: TimeRangeWindow;
};

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

export default function KpiAlertAperti({ customerId, timeWindow }: Props) {
  const api = useTenantApi();
  const [countToday, setCountToday] = useState(0);
  const [delta, setDelta] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setError(null);
      const todayStart = startOfToday();
      const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);

      try {
        const [todayRes, yesterdayRes] = await Promise.all([
          api.get<AlertCountResponse>("/alerts/alerts/", {
            params: {
              state__category: "open",
              created_after: todayStart.toISOString(),
              from: timeWindow.from,
              to: timeWindow.to,
              ...(customerId ? { customer_id: customerId } : {}),
            },
          }),
          api.get<AlertCountResponse>("/alerts/alerts/", {
            params: {
              state__category: "open",
              created_after: yesterdayStart.toISOString(),
              created_before: todayStart.toISOString(),
              from: timeWindow.from,
              to: timeWindow.to,
              ...(customerId ? { customer_id: customerId } : {}),
            },
          }),
        ]);

        const today = Number(todayRes.data.count ?? 0);
        const yesterday = Number(yesterdayRes.data.count ?? 0);
        setCountToday(today);
        setDelta(today - yesterday);
      } catch {
        setError("Impossibile caricare il KPI alert aperti.");
      }
    };

    void load();
  }, [api, customerId, timeWindow.from, timeWindow.to]);

  const deltaChip = useMemo(() => {
    if (delta > 0) {
      return { icon: <TrendingUpIcon fontSize="small" />, color: "error" as const, label: `+${delta} vs ieri` };
    }
    if (delta < 0) {
      return { icon: <TrendingDownIcon fontSize="small" />, color: "success" as const, label: `${delta} vs ieri` };
    }
    return { icon: <TrendingFlatIcon fontSize="small" />, color: "default" as const, label: "Invariato vs ieri" };
  }, [delta]);

  return (
    <Paper sx={{ p: 2.2, minHeight: 182 }}>
      <Stack spacing={1}>
        <Typography sx={{ fontWeight: 700, fontSize: 18 }}>Alert Aperti Oggi</Typography>
        <Typography sx={{ fontSize: 36, fontWeight: 800, lineHeight: 1 }}>{countToday}</Typography>
        <Box>
          <Chip size="small" color={deltaChip.color} icon={deltaChip.icon} label={deltaChip.label} />
        </Box>
        {error ? <Alert severity="error">{error}</Alert> : null}
      </Stack>
    </Paper>
  );
}
