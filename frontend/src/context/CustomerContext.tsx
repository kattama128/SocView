import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { fetchCustomers } from "../services/alertsApi";
import { CustomerSummary } from "../types/alerts";
import { useAuth } from "./AuthContext";

type CustomerContextValue = {
  selectedCustomerId: number | null;
  selectedCustomer: CustomerSummary | null;
  customers: CustomerSummary[];
  loading: boolean;
  error: string | null;
  refreshCustomers: () => Promise<void>;
  setSelectedCustomerId: (customerId: number | null) => void;
};

const customerStorageKey = "socview_selected_customer_id";
const CustomerContext = createContext<CustomerContextValue | undefined>(undefined);

function isPublicHost(hostname: string): boolean {
  return hostname === "public.localhost";
}

function loadInitialCustomerId(): number | null {
  try {
    const raw = localStorage.getItem(customerStorageKey);
    if (!raw) {
      return null;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return null;
    }
    return Math.floor(parsed);
  } catch {
    return null;
  }
}

export function CustomerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(loadInitialCustomerId);

  const refreshCustomers = useCallback(async () => {
    if (!user) {
      setCustomers([]);
      setError(null);
      setLoading(false);
      return;
    }

    if (isPublicHost(window.location.hostname)) {
      setCustomers([]);
      setSelectedCustomerId(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await fetchCustomers(true);
      setCustomers(data);
      setError(null);
      setSelectedCustomerId((current) => {
        if (current === null) {
          return null;
        }
        return data.some((item) => item.id === current) ? current : null;
      });
    } catch {
      setCustomers([]);
      setError("Impossibile caricare clienti.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setCustomers([]);
      setSelectedCustomerId(null);
      setError(null);
      setLoading(false);
      return;
    }
    void refreshCustomers();
  }, [refreshCustomers, user]);

  useEffect(() => {
    if (selectedCustomerId === null) {
      localStorage.removeItem(customerStorageKey);
      return;
    }
    localStorage.setItem(customerStorageKey, String(selectedCustomerId));
  }, [selectedCustomerId]);

  const selectedCustomer = useMemo(
    () => (selectedCustomerId ? customers.find((item) => item.id === selectedCustomerId) ?? null : null),
    [customers, selectedCustomerId],
  );

  const value = useMemo<CustomerContextValue>(
    () => ({
      selectedCustomerId,
      selectedCustomer,
      customers,
      loading,
      error,
      refreshCustomers,
      setSelectedCustomerId,
    }),
    [customers, error, loading, refreshCustomers, selectedCustomer, selectedCustomerId],
  );

  return <CustomerContext.Provider value={value}>{children}</CustomerContext.Provider>;
}

export function useCustomer() {
  const ctx = useContext(CustomerContext);
  if (!ctx) {
    throw new Error("useCustomer deve essere usato dentro CustomerProvider");
  }
  return ctx;
}
