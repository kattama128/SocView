import { createContext, useContext, useEffect, useMemo, useState } from "react";

import api, {
  SESSION_EXPIRED_EVENT,
  SESSION_MESSAGE_KEY,
  clearLegacyAuthTokens,
  fetchCsrfToken,
  hasLegacyAuthTokens,
  logoutSession,
  migrateLegacyAuthTokens,
} from "../services/api";
import { PermissionMap } from "../types/users";

export type AuthUser = {
  id: number;
  username: string;
  email: string;
  role: string;
  permissions: PermissionMap;
  is_public_schema?: boolean;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  sessionState: "checking" | "authenticated" | "anonymous" | "expired";
  sessionMessage: string | null;
  clearSessionMessage: () => void;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
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
      try {
        await fetchCsrfToken();
      } catch {
        // best effort
      }

      try {
        if (hasLegacyAuthTokens()) {
          const migrated = await migrateLegacyAuthTokens();
          if (!migrated) {
            clearLegacyAuthTokens();
          }
        }
        const response = await api.get<AuthUser>("/auth/me/");
        setUser(normalizeUser(response.data));
        setSessionState("authenticated");
      } catch {
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
    await fetchCsrfToken();
    const response = await api.post<{ user?: AuthUser }>("/auth/token/", { username, password });
    if (response.data.user) {
      setUser(normalizeUser(response.data.user));
    } else {
      const meResponse = await api.get<AuthUser>("/auth/me/");
      setUser(normalizeUser(meResponse.data));
    }
    setSessionState("authenticated");
  };

  const logout = async () => {
    try {
      await logoutSession();
    } catch {
      // best effort
    }
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
