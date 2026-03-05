import { CssBaseline, ThemeProvider } from "@mui/material";
import type { PaletteMode } from "@mui/material";
import { createContext, useContext, useMemo, useState } from "react";

import { createAppTheme } from "../theme";

const THEME_STORAGE_KEY = "theme_mode";

type ThemeContextValue = {
  mode: PaletteMode;
  toggleMode: () => void;
  setMode: (mode: PaletteMode) => void;
};

const ThemeModeContext = createContext<ThemeContextValue | undefined>(undefined);

function getSystemMode(): PaletteMode {
  if (typeof window === "undefined") {
    return "dark";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readInitialMode(): PaletteMode {
  if (typeof window === "undefined") {
    return "dark";
  }

  const htmlPreset = document.documentElement.getAttribute("data-theme-mode");
  if (htmlPreset === "light" || htmlPreset === "dark") {
    return htmlPreset;
  }

  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") {
    return stored;
  }

  return getSystemMode();
}

export function ThemeModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<PaletteMode>(() => readInitialMode());

  const setMode = (nextMode: PaletteMode) => {
    setModeState(nextMode);
    localStorage.setItem(THEME_STORAGE_KEY, nextMode);
    document.documentElement.setAttribute("data-theme-mode", nextMode);
    document.documentElement.setAttribute("data-theme", nextMode);
    document.documentElement.classList.toggle("dark", nextMode === "dark");
    document.body.classList.toggle("dark", nextMode === "dark");
  };

  const toggleMode = () => {
    setMode(mode === "dark" ? "light" : "dark");
  };

  const value = useMemo(
    () => ({ mode, toggleMode, setMode }),
    [mode],
  );

  const theme = useMemo(() => createAppTheme(mode), [mode]);

  return (
    <ThemeModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}

export function useThemeMode() {
  const context = useContext(ThemeModeContext);
  if (!context) {
    throw new Error("useThemeMode must be used inside ThemeModeProvider");
  }
  return context;
}
