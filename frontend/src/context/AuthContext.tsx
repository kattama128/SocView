import { createContext, useContext, useEffect, useMemo, useState } from "react";

import api from "../services/api";

export type AuthUser = {
  id: number;
  username: string;
  email: string;
  role: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const bootstrap = async () => {
      const token = localStorage.getItem("socview_access_token");
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const response = await api.get<AuthUser>("/auth/me/");
        setUser(response.data);
      } catch {
        localStorage.removeItem("socview_access_token");
        localStorage.removeItem("socview_refresh_token");
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    void bootstrap();
  }, []);

  const login = async (username: string, password: string) => {
    const response = await api.post("/auth/token/", { username, password });
    localStorage.setItem("socview_access_token", response.data.access);
    localStorage.setItem("socview_refresh_token", response.data.refresh);
    setUser(response.data.user);
  };

  const logout = () => {
    localStorage.removeItem("socview_access_token");
    localStorage.removeItem("socview_refresh_token");
    setUser(null);
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      logout,
      isAuthenticated: Boolean(user),
    }),
    [user, loading],
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
