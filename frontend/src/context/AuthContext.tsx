import { createContext, useContext, useEffect, useMemo, useState } from "react";

import api, {
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  SESSION_EXPIRED_EVENT,
  SESSION_MESSAGE_KEY,
  clearAuthTokens,
  getAccessToken,
  setAuthTokens,
} from "../services/api";
import { PermissionMap } from "../types/users";

export type AuthUser = {
  id: number;
  username: string;
  email: string;
  role: string;
  permissions: PermissionMap;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  sessionState: "checking" | "authenticated" | "anonymous" | "expired";
  sessionMessage: string | null;
  clearSessionMessage: () => void;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const emptyPermissions: PermissionMap = {
  view: false,
  triage: false,
  manage_sources: false,
  manage_customers: false,
  manage_users: false,
  export: false,
  admin: false,
};

function normalizeUser(payload: AuthUser): AuthUser {
  return {
    ...payload,
    permissions: { ...emptyPermissions, ...(payload.permissions ?? {}) },
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionState, setSessionState] = useState<AuthContextValue["sessionState"]>("checking");
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);

  useEffect(() => {
    const storedMessage = sessionStorage.getItem(SESSION_MESSAGE_KEY);
    if (storedMessage) {
      setSessionMessage(storedMessage);
      sessionStorage.removeItem(SESSION_MESSAGE_KEY);
    }

    const onSessionExpired = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      setUser(null);
      setSessionState("expired");
      setSessionMessage(detail?.message ?? "Sessione scaduta. Effettua nuovamente il login.");
      setLoading(false);
    };

    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired as EventListener);

    const bootstrap = async () => {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const sharedAccess = hashParams.get("sv_access");
      const sharedRefresh = hashParams.get("sv_refresh");
      if (sharedAccess) {
        localStorage.setItem(ACCESS_TOKEN_KEY, sharedAccess);
        hashParams.delete("sv_access");
      }
      if (sharedRefresh) {
        localStorage.setItem(REFRESH_TOKEN_KEY, sharedRefresh);
        hashParams.delete("sv_refresh");
      }
      if (sharedAccess || sharedRefresh) {
        const cleanHash = hashParams.toString();
        const cleanUrl = `${window.location.pathname}${window.location.search}${cleanHash ? `#${cleanHash}` : ""}`;
        window.history.replaceState({}, document.title, cleanUrl);
      }

      const token = getAccessToken();
      if (!token) {
        setSessionState("anonymous");
        setLoading(false);
        return;
      }

      try {
        const response = await api.get<AuthUser>("/auth/me/");
        setUser(normalizeUser(response.data));
        setSessionState("authenticated");
      } catch {
        clearAuthTokens();
        setUser(null);
        setSessionState("anonymous");
      } finally {
        setLoading(false);
      }
    };

    void bootstrap();
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired as EventListener);
    };
  }, []);

  const login = async (username: string, password: string) => {
    setSessionMessage(null);
    const response = await api.post("/auth/token/", { username, password });
    setAuthTokens({ access: response.data.access, refresh: response.data.refresh });
    if (response.data.user) {
      setUser(normalizeUser(response.data.user as AuthUser));
    } else {
      const meResponse = await api.get<AuthUser>("/auth/me/");
      setUser(normalizeUser(meResponse.data));
    }
    setSessionState("authenticated");
  };

  const logout = () => {
    clearAuthTokens();
    setUser(null);
    setSessionState("anonymous");
    setSessionMessage(null);
  };

  const clearSessionMessage = () => {
    setSessionMessage(null);
    sessionStorage.removeItem(SESSION_MESSAGE_KEY);
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      sessionState,
      sessionMessage,
      clearSessionMessage,
      login,
      logout,
      isAuthenticated: Boolean(user),
    }),
    [user, loading, sessionState, sessionMessage],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth deve essere usato dentro AuthProvider");
  }
  return ctx;
}
