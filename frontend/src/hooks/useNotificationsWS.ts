import { useEffect, useRef } from "react";

import { fetchWebSocketToken } from "../services/alertsApi";
import { NotificationEvent } from "../types/alerts";

type UseNotificationsWSOptions = {
  enabled: boolean;
  tenantSchema?: string | null;
  onNotification: (notification: NotificationEvent) => void;
  onFallbackPoll: () => Promise<void> | void;
};

function resolveWsUrl(token: string, tenantSchema?: string | null): string {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const host = window.location.host;
  const routingMode = String(import.meta.env.VITE_TENANT_ROUTING_MODE ?? "subdomain").toLowerCase();
  let resolvedTenant = tenantSchema ?? null;
  if (!resolvedTenant && routingMode === "path") {
    const match = window.location.pathname.match(/^\/t\/([^/]+)(?:\/|$)/i);
    resolvedTenant = match?.[1] ?? null;
  }
  const encodedTenant = resolvedTenant ? encodeURIComponent(resolvedTenant) : "";
  if (routingMode === "path" && encodedTenant) {
    return `${protocol}://${host}/t/${encodedTenant}/ws/notifications/?token=${encodeURIComponent(token)}&tenant=${encodedTenant}`;
  }
  if (encodedTenant) {
    return `${protocol}://${host}/ws/notifications/?token=${encodeURIComponent(token)}&tenant=${encodedTenant}`;
  }
  return `${protocol}://${host}/ws/notifications/?token=${encodeURIComponent(token)}`;
}

export default function useNotificationsWS({
  enabled,
  tenantSchema,
  onNotification,
  onFallbackPoll,
}: UseNotificationsWSOptions) {
  const socketRef = useRef<WebSocket | null>(null);
  const fallbackTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    let cancelled = false;

    const stopFallbackPolling = () => {
      if (fallbackTimerRef.current !== null) {
        window.clearInterval(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
    };

    const startFallbackPolling = () => {
      if (fallbackTimerRef.current !== null) {
        return;
      }
      fallbackTimerRef.current = window.setInterval(() => {
        void onFallbackPoll();
      }, 30000);
    };

    const scheduleReconnect = () => {
      if (reconnectTimerRef.current !== null || cancelled) {
        return;
      }
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        void connect();
      }, 10000);
    };

    const connect = async () => {
      if (cancelled) {
        return;
      }
      try {
        const token = await fetchWebSocketToken();
        if (!token || cancelled) {
          startFallbackPolling();
          return;
        }

        const ws = new WebSocket(resolveWsUrl(token, tenantSchema));
        socketRef.current = ws;

        ws.onopen = () => {
          stopFallbackPolling();
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as { type?: string; payload?: NotificationEvent };
            if (data.type === "notification" && data.payload) {
              onNotification(data.payload);
            }
          } catch {
            // ignore malformed payload
          }
        };

        ws.onerror = () => {
          startFallbackPolling();
        };

        ws.onclose = () => {
          if (cancelled) {
            return;
          }
          startFallbackPolling();
          scheduleReconnect();
        };
      } catch {
        startFallbackPolling();
        scheduleReconnect();
      }
    };

    void connect();

    return () => {
      cancelled = true;
      stopFallbackPolling();
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [enabled, tenantSchema, onNotification, onFallbackPoll]);
}
