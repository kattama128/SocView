import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { mockCustomers } from "../mocks/activeAlarmsData";

type CustomerContextValue = {
  selectedCustomerId: number | null;
  selectedCustomer: (typeof mockCustomers)[number] | null;
  customers: typeof mockCustomers;
  setSelectedCustomerId: (customerId: number | null) => void;
};

const customerStorageKey = "socview_selected_customer_id";
const CustomerContext = createContext<CustomerContextValue | undefined>(undefined);

function loadInitialCustomerId(): number | null {
  try {
    const raw = localStorage.getItem(customerStorageKey);
    if (!raw) {
      return null;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    return mockCustomers.some((item) => item.id === parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function CustomerProvider({ children }: { children: React.ReactNode }) {
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(loadInitialCustomerId);

  useEffect(() => {
    if (selectedCustomerId === null) {
      localStorage.removeItem(customerStorageKey);
      return;
    }
    localStorage.setItem(customerStorageKey, String(selectedCustomerId));
  }, [selectedCustomerId]);

  const selectedCustomer = useMemo(
    () => (selectedCustomerId ? mockCustomers.find((item) => item.id === selectedCustomerId) ?? null : null),
    [selectedCustomerId],
  );

  const value = useMemo<CustomerContextValue>(
    () => ({
      selectedCustomerId,
      selectedCustomer,
      customers: mockCustomers,
      setSelectedCustomerId,
    }),
    [selectedCustomerId, selectedCustomer],
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
