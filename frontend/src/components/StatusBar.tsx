import CircleIcon from "@mui/icons-material/Circle";
import { Box, Chip, Stack, Typography } from "@mui/material";
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

function statusColor(status: HealthStatus): "success" | "warning" | "error" | "default" {
  if (status === "ok") {
    return "success";
  }
  if (status === "error") {
    return "error";
  }
  return "default";
}

export default function StatusBar() {
  const api = useTenantApi();
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

  return (
    <Box
      sx={{ px: 2.1, py: 1.2, borderTop: "1px solid var(--border-subtle)", background: "var(--surface-2)" }}
      data-testid="status-bar"
    >
      <Typography sx={{ fontSize: 11, color: "text.secondary", mb: 0.7 }}>Stato sistema</Typography>
      <Stack spacing={0.7}>
        <Chip
          size="small"
          color={statusColor(backendStatus)}
          icon={<CircleIcon sx={{ fontSize: "0.7rem !important" }} />}
          label={backendStatus === "ok" ? "Backend OK" : "Backend non raggiungibile"}
        />
        <Chip
          size="small"
          color={statusColor(queueStatus)}
          icon={<CircleIcon sx={{ fontSize: "0.7rem !important" }} />}
          label={queueStatus === "ok" ? "Queue OK" : "Queue degradata"}
        />
        <Chip size="small" label={`Sorgenti attive: ${activeSources}`} />
      </Stack>
    </Box>
  );
}
