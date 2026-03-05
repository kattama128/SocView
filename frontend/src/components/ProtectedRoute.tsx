import { Alert, Button, CircularProgress, Stack, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { fetchDashboardTenants } from "../services/dashboardApi";
import { setActiveTenantSchema } from "../services/api";

function isPublicHost(hostname: string): boolean {
  return hostname === "public.localhost";
}

async function canReachTenantHost(entryUrl: string): Promise<boolean> {
  try {
    const probe = new URL(entryUrl);
    probe.pathname = "/readyz";
    probe.search = "";
    probe.hash = "";

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 3000);
    try {
      await fetch(probe.toString(), {
        method: "GET",
        mode: "no-cors",
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      });
      return true;
    } finally {
      window.clearTimeout(timeout);
    }
  } catch {
    return false;
  }
}

function buildTenantRedirectUrl(entryUrl: string, pathname: string, search: string): string {
  const target = new URL(entryUrl);
  target.pathname = pathname || "/";
  target.search = search;
  return target.toString();
}

export default function ProtectedRoute() {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();
  const [tenantRedirectFailed, setTenantRedirectFailed] = useState(false);
  const pathRoutingEnabled = String(import.meta.env.VITE_TENANT_ROUTING_MODE ?? "subdomain").toLowerCase() === "path";

  const mustSwitchToTenant = useMemo(
    () => isAuthenticated && isPublicHost(window.location.hostname) && !pathRoutingEnabled,
    [isAuthenticated, pathRoutingEnabled],
  );

  useEffect(() => {
    let cancelled = false;

    const redirectToTenant = async () => {
      if (pathRoutingEnabled && isAuthenticated && isPublicHost(window.location.hostname)) {
        try {
          const tenants = await fetchDashboardTenants();
          if (tenants.length > 0) {
            setActiveTenantSchema(tenants[0].schema_name);
          }
        } catch {
          setActiveTenantSchema(null);
        }
        setTenantRedirectFailed(false);
        return;
      }

      if (!mustSwitchToTenant) {
        setTenantRedirectFailed(false);
        return;
      }

      try {
        const tenants = await fetchDashboardTenants();
        if (!tenants.length) {
          throw new Error("Nessun tenant disponibile.");
        }

        let selectedEntryUrl: string | null = null;
        for (const tenant of tenants) {
          if (!tenant?.entry_url) {
            continue;
          }
          // Evita redirect verso host non risolvibile dal browser locale.
          if (await canReachTenantHost(tenant.entry_url)) {
            selectedEntryUrl = tenant.entry_url;
            break;
          }
        }

        if (!selectedEntryUrl) {
          throw new Error("Nessun dominio tenant raggiungibile.");
        }

        const targetUrl = buildTenantRedirectUrl(selectedEntryUrl, location.pathname, location.search);
        window.location.assign(targetUrl);
      } catch {
        if (!cancelled) {
          setTenantRedirectFailed(true);
        }
      }
    };

    if (!loading && isAuthenticated) {
      void redirectToTenant();
    }

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, loading, location.pathname, location.search, mustSwitchToTenant, pathRoutingEnabled]);

  if (loading) {
    return (
      <Stack alignItems="center" justifyContent="center" sx={{ minHeight: "100vh" }}>
        <CircularProgress />
      </Stack>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (mustSwitchToTenant) {
    if (tenantRedirectFailed) {
      const fallbackTarget = buildTenantRedirectUrl("http://tenant1.localhost/tenant", location.pathname, location.search);
      return (
        <Stack alignItems="center" justifyContent="center" spacing={2} sx={{ minHeight: "100vh", px: 2 }}>
          <Alert severity="warning" sx={{ maxWidth: 720 }}>
            Il dominio pubblico non espone i dati operativi SOC e non è stato trovato un dominio tenant raggiungibile da questo browser.
          </Alert>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <Button variant="contained" onClick={() => window.location.reload()}>
              Riprova
            </Button>
            <Button variant="outlined" onClick={() => window.location.assign(fallbackTarget)}>
              Apri tenant1
            </Button>
          </Stack>
        </Stack>
      );
    }

    return (
      <Stack alignItems="center" justifyContent="center" spacing={1.5} sx={{ minHeight: "100vh" }}>
        <CircularProgress />
        <Typography sx={{ color: "text.secondary" }}>Reindirizzamento al tenant operativo...</Typography>
      </Stack>
    );
  }

  return <Outlet />;
}
