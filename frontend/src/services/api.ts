import axios, { AxiosError, AxiosHeaders, InternalAxiosRequestConfig } from "axios";

const ACCESS_TOKEN_KEY = "socview_access_token";
const REFRESH_TOKEN_KEY = "socview_refresh_token";
const SESSION_EXPIRED_EVENT = "socview:session-expired";
const SESSION_MESSAGE_KEY = "socview_session_message";

type AuthAwareRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
};

let refreshPromise: Promise<string> | null = null;
let sessionExpiredNotified = false;

function isAuthTokenEndpoint(url?: string): boolean {
  if (!url) {
    return false;
  }
  return url.includes("/auth/token/") || url.includes("/auth/token/refresh/");
}

function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

function setAuthTokens(payload: { access: string; refresh?: string | null }) {
  localStorage.setItem(ACCESS_TOKEN_KEY, payload.access);
  if (payload.refresh) {
    localStorage.setItem(REFRESH_TOKEN_KEY, payload.refresh);
  }
  sessionExpiredNotified = false;
}

function clearAuthTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

function applyAuthHeader(config: AuthAwareRequestConfig, accessToken: string) {
  const nextHeaders = AxiosHeaders.from(config.headers ?? {});
  nextHeaders.set("Authorization", `Bearer ${accessToken}`);
  config.headers = nextHeaders;
}

function broadcastSessionExpired(message: string) {
  if (sessionExpiredNotified) {
    return;
  }
  sessionExpiredNotified = true;
  clearAuthTokens();
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

async function refreshAccessToken(): Promise<string> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new Error("Refresh token non disponibile");
  }
  const response = await axios.post<{ access: string; refresh?: string }>("/api/auth/token/refresh/", {
    refresh: refreshToken,
  });
  if (!response.data?.access) {
    throw new Error("Risposta refresh priva di access token");
  }
  setAuthTokens({
    access: response.data.access,
    refresh: response.data.refresh ?? refreshToken,
  });
  return response.data.access;
}

const api = axios.create({
  baseURL: "/api",
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    const headers = AxiosHeaders.from(config.headers ?? {});
    headers.set("Authorization", `Bearer ${token}`);
    config.headers = headers;
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

    if (!getRefreshToken()) {
      broadcastSessionExpired("Sessione non valida. Effettua nuovamente il login.");
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }
      const nextAccessToken = await refreshPromise;
      applyAuthHeader(originalRequest, nextAccessToken);
      return api(originalRequest);
    } catch (refreshError) {
      refreshPromise = null;
      broadcastSessionExpired("Sessione scaduta. Effettua nuovamente il login.");
      return Promise.reject(refreshError);
    }
  },
);

export {
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  SESSION_EXPIRED_EVENT,
  SESSION_MESSAGE_KEY,
  clearAuthTokens,
  getAccessToken,
  getRefreshToken,
  setAuthTokens,
};

export default api;
