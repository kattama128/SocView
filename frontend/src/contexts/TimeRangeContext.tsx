import { createContext, useContext, useMemo, useState } from "react";

export type TimeRangePreset = "1h" | "24h" | "7d" | "30d" | "custom";

export type TimeRangeWindow = {
  from: string;
  to: string;
};

type TimeRangeState = {
  preset: TimeRangePreset;
  customFrom: string;
  customTo: string;
};

type TimeRangeContextValue = {
  preset: TimeRangePreset;
  customFrom: string;
  customTo: string;
  window: TimeRangeWindow;
  setPreset: (preset: TimeRangePreset) => void;
  setCustomRange: (from: string, to: string) => void;
};

const STORAGE_KEY = "dashboard_time_range";

const TimeRangeContext = createContext<TimeRangeContextValue | undefined>(undefined);

function toIsoDateTimeLocalValue(value: Date): string {
  const pad = (item: number) => String(item).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function safeParseDate(value: string): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function defaultCustomWindow() {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return {
    customFrom: toIsoDateTimeLocalValue(dayAgo),
    customTo: toIsoDateTimeLocalValue(now),
  };
}

function loadInitialState(): TimeRangeState {
  const defaults = defaultCustomWindow();
  if (typeof window === "undefined") {
    return {
      preset: "24h",
      ...defaults,
    };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { preset: "24h", ...defaults };
    }
    const parsed = JSON.parse(raw) as Partial<TimeRangeState>;
    const preset = parsed.preset;
    if (preset !== "1h" && preset !== "24h" && preset !== "7d" && preset !== "30d" && preset !== "custom") {
      return { preset: "24h", ...defaults };
    }
    return {
      preset,
      customFrom: typeof parsed.customFrom === "string" ? parsed.customFrom : defaults.customFrom,
      customTo: typeof parsed.customTo === "string" ? parsed.customTo : defaults.customTo,
    };
  } catch {
    return { preset: "24h", ...defaults };
  }
}

function computeWindow(state: TimeRangeState): TimeRangeWindow {
  const now = new Date();

  if (state.preset === "custom") {
    const fromDate = safeParseDate(state.customFrom);
    const toDate = safeParseDate(state.customTo);
    if (fromDate && toDate && fromDate <= toDate) {
      return { from: fromDate.toISOString(), to: toDate.toISOString() };
    }
  }

  const to = now;
  let from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (state.preset === "1h") {
    from = new Date(now.getTime() - 60 * 60 * 1000);
  }
  if (state.preset === "7d") {
    from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  if (state.preset === "30d") {
    from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  return { from: from.toISOString(), to: to.toISOString() };
}

export function TimeRangeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<TimeRangeState>(() => loadInitialState());

  const persist = (next: TimeRangeState) => {
    setState(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const setPreset = (preset: TimeRangePreset) => {
    persist({ ...state, preset });
  };

  const setCustomRange = (from: string, to: string) => {
    persist({
      ...state,
      preset: "custom",
      customFrom: from,
      customTo: to,
    });
  };

  const window = useMemo(() => computeWindow(state), [state]);

  const value = useMemo(
    () => ({
      preset: state.preset,
      customFrom: state.customFrom,
      customTo: state.customTo,
      window,
      setPreset,
      setCustomRange,
    }),
    [state, window],
  );

  return <TimeRangeContext.Provider value={value}>{children}</TimeRangeContext.Provider>;
}

export function useTimeRange() {
  const context = useContext(TimeRangeContext);
  if (!context) {
    throw new Error("useTimeRange must be used within TimeRangeProvider");
  }
  return context;
}
