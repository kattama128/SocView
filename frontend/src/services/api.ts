import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

const LEGACY_ACCESS_TOKEN_KEY = "socview_access_token";
const LEGACY_REFRESH_TOKEN_KEY = "socview_refresh_token";
const ACTIVE_TENANT_STORAGE_KEY = "socview_active_tenant";
const SESSION_EXPIRED_EVENT = "socview:session-expired";
const SESSION_MESSAGE_KEY = "socview_session_message";

type AuthAwareRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
};

let refreshPromise: Promise<void> | null = null;
let sessionExpiredNotified = false;

function resolveRoutingMode(): "subdomain" | "path" {
  const mode = String(import.meta.env.VITE_TENANT_ROUTING_MODE ?? "subdomain").toLowerCase();
  return mode === "path" ? "path" : "subdomain";
}

function extractTenantFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/t\/([^/]+)(?:\/|$)/i);
  return match?.[1]?.trim().toLowerCase() ?? null;
}

function extractTenantFromHostname(hostname: string): string | null {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized || normalized === "localhost" || normalized === "public.localhost") {
    return null;
  }
  if (normalized === "127.0.0.1" || normalized === "0.0.0.0") {
    return null;
  }
  if (!normalized.includes(".")) {
    return null;
  }
  const [subdomain] = normalized.split(".");
  if (!subdomain || subdomain === "www" || subdomain === "api") {
    return null;
  }
  return subdomain;
}

function resolveTenantSchema(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const tenantFromPath = extractTenantFromPath(window.location.pathname);
  if (tenantFromPath) {
    setActiveTenantSchema(tenantFromPath);
    return tenantFromPath;
  }

  const tenantFromHost = extractTenantFromHostname(window.location.hostname);
  if (tenantFromHost) {
    setActiveTenantSchema(tenantFromHost);
    return tenantFromHost;
  }

  return localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY);
}

export function resolveApiBasePath(): string {
  if (resolveRoutingMode() !== "path") {
    return "/api";
  }
  const tenant = resolveTenantSchema();
  return tenant ? `/t/${tenant}/api` : "/api";
}

function isAuthTokenEndpoint(url?: string): boolean {
  if (!url) {
    return false;
  }
  return (
    url.includes("/auth/token/")
    || url.includes("/auth/token/refresh/")
    || url.includes("/auth/token/migrate/")
    || url.includes("/auth/logout/")
  );
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const cookie = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));
  if (!cookie) {
    return null;
  }
  return decodeURIComponent(cookie.slice(name.length + 1));
}

function getCsrfToken(): string | null {
  return readCookie("csrftoken");
}

function broadcastSessionExpired(message: string) {
  if (sessionExpiredNotified) {
    return;
  }
  sessionExpiredNotified = true;
  sessionStorage.setItem(SESSION_MESSAGE_KEY, message);
  window.dispatchEvent(
    new CustomEvent(SESSION_EXPIRED_EVENT, {
      detail: { message },
    }),
  );

  if (!window.location.pathname.startsWith("/login")) {
    window.location.assign("/login");
  }
}

function isMutationMethod(method?: string): boolean {
  const normalized = (method ?? "get").toUpperCase();
  return normalized === "POST" || normalized === "PUT" || normalized === "PATCH" || normalized === "DELETE";
}

async function refreshAccessCookie(): Promise<void> {
  await axios.post(`${resolveApiBasePath()}/auth/token/refresh/`, {}, { withCredentials: true });
  sessionExpiredNotified = false;
}

const api = axios.create({
  baseURL: resolveApiBasePath(),
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  if (isMutationMethod(config.method)) {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      config.headers = config.headers ?? {};
      config.headers["X-CSRFToken"] = csrfToken;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const originalRequest = error.config as AuthAwareRequestConfig | undefined;

    if (!originalRequest || status !== 401) {
      return Promise.reject(error);
    }

    if (isAuthTokenEndpoint(originalRequest.url)) {
      return Promise.reject(error);
    }

    if (originalRequest._retry) {
      broadcastSessionExpired("Sessione scaduta. Effettua nuovamente il login.");
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      if (!refreshPromise) {
        refreshPromise = refreshAccessCookie().finally(() => {
          refreshPromise = null;
        });
      }
      await refreshPromise;
      return api(originalRequest);
    } catch (refreshError) {
      refreshPromise = null;
      broadcastSessionExpired("Sessione scaduta. Effettua nuovamente il login.");
      return Promise.reject(refreshError);
    }
  },
);

function getLegacyAccessToken(): string | null {
  return localStorage.getItem(LEGACY_ACCESS_TOKEN_KEY);
}

function getLegacyRefreshToken(): string | null {
  return localStorage.getItem(LEGACY_REFRESH_TOKEN_KEY);
}

function clearLegacyAuthTokens() {
  localStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY);
  localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
}

function setActiveTenantSchema(schemaName: string | null) {
  if (!schemaName) {
    localStorage.removeItem(ACTIVE_TENANT_STORAGE_KEY);
    return;
  }
  localStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, schemaName.trim().toLowerCase());
}

function hasLegacyAuthTokens(): boolean {
  return Boolean(getLegacyAccessToken() || getLegacyRefreshToken());
}

async function migrateLegacyAuthTokens(): Promise<boolean> {
  const access = getLegacyAccessToken();
  const refresh = getLegacyRefreshToken();

  if (!access) {
    return false;
  }

  try {
    await axios.post(
      `${resolveApiBasePath()}/auth/token/migrate/`,
      { access, refresh },
      { withCredentials: true },
    );
    clearLegacyAuthTokens();
    return true;
  } catch {
    return false;
  }
}

async function fetchCsrfToken(): Promise<void> {
  await axios.get(`${resolveApiBasePath()}/auth/csrf/`, { withCredentials: true });
}

async function logoutSession(): Promise<void> {
  await api.post("/auth/logout/", {});
}

export {
  LEGACY_ACCESS_TOKEN_KEY,
  LEGACY_REFRESH_TOKEN_KEY,
  SESSION_EXPIRED_EVENT,
  SESSION_MESSAGE_KEY,
  clearLegacyAuthTokens,
  fetchCsrfToken,
  hasLegacyAuthTokens,
  migrateLegacyAuthTokens,
  logoutSession,
  setActiveTenantSchema,
};

export default api;
