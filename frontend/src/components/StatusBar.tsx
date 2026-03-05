import CircleIcon from "@mui/icons-material/Circle";
import { Box, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useCallback, useEffect, useState } from "react";

import { useTenantApi } from "../hooks/useTenantApi";

type HealthStatus = "loading" | "ok" | "error";

type SourcePayload = { count?: number; results?: unknown[] } | unknown[];

function countSources(payload: SourcePayload): number {
  if (Array.isArray(payload)) {
    return payload.length;
  }
  if (typeof payload.count === "number" && Number.isFinite(payload.count)) {
    return payload.count;
  }
  if (Array.isArray(payload.results)) {
    return payload.results.length;
  }
  return 0;
}

function statusColor(status: HealthStatus): string {
  if (status === "ok") return "#22c55e";
  if (status === "error") return "#ef4444";
  return "#94a3b8";
}

export default function StatusBar() {
  const api = useTenantApi();
  const theme = useTheme();
  const [backendStatus, setBackendStatus] = useState<HealthStatus>("loading");
  const [queueStatus, setQueueStatus] = useState<HealthStatus>("loading");
  const [activeSources, setActiveSources] = useState<number>(0);

  const poll = useCallback(async () => {
    const [health, ready, sources] = await Promise.allSettled([
      api.get<{ status: string }>("/healthz", { baseURL: "" }),
      api.get<{ status: string; checks?: { celery?: boolean } }>("/readyz", { baseURL: "" }),
      api.get<SourcePayload>("/ingestion/sources/", { params: { status: "active", scope: "all", page_size: 1_000 } }),
    ]);

    setBackendStatus(health.status === "fulfilled" && health.value.data.status === "ok" ? "ok" : "error");
    if (ready.status === "fulfilled") {
      setQueueStatus(ready.value.data?.checks?.celery ? "ok" : "error");
    } else {
      setQueueStatus("error");
    }

    if (sources.status === "fulfilled") {
      setActiveSources(countSources(sources.value.data));
    } else {
      setActiveSources(0);
    }
  }, [api]);

  useEffect(() => {
    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [poll]);

  const items = [
    { label: "Backend", status: backendStatus },
    { label: "Queue", status: queueStatus },
  ];

  return (
    <Box
      sx={{ px: 2.5, py: 1.5, borderTop: "1px solid var(--border-subtle)" }}
      data-testid="status-bar"
    >
      <Typography
        sx={{
          fontSize: "0.625rem",
          fontWeight: 600,
          color: "text.secondary",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          mb: 1,
        }}
      >
        Stato sistema
      </Typography>
      <Stack spacing={0.75}>
        {items.map(({ label, status }) => (
          <Stack key={label} direction="row" alignItems="center" spacing={1}>
            <CircleIcon sx={{ fontSize: 7, color: statusColor(status) }} />
            <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", flex: 1 }}>
              {label}
            </Typography>
            <Typography
              sx={{
                fontSize: "0.6875rem",
                fontWeight: 600,
                color: status === "ok" ? "success.main" : status === "error" ? "error.main" : "text.disabled",
              }}
            >
              {status === "ok" ? "OK" : status === "error" ? "Errore" : "..."}
            </Typography>
          </Stack>
        ))}
        <Stack direction="row" alignItems="center" spacing={1}>
          <Box
            sx={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: alpha(theme.palette.primary.main, 0.5),
            }}
          />
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", flex: 1 }}>
            Sorgenti attive
          </Typography>
          <Typography sx={{ fontSize: "0.6875rem", fontWeight: 600, color: "text.primary" }}>
            {activeSources}
          </Typography>
        </Stack>
      </Stack>
    </Box>
  );
}
