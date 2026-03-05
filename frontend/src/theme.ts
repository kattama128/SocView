import type { PaletteMode } from "@mui/material";
import { createTheme } from "@mui/material/styles";

export function createAppTheme(mode: PaletteMode) {
  const isDark = mode === "dark";

  return createTheme({
    palette: {
      mode,
      primary: isDark
        ? { main: "#0ea5e9", light: "#7dd3fc", dark: "#0369a1" }
        : { main: "#0284c7", light: "#38bdf8", dark: "#075985" },
      secondary: isDark
        ? { main: "#14b8a6", light: "#5eead4", dark: "#0f766e" }
        : { main: "#0f766e", light: "#14b8a6", dark: "#134e4a" },
      background: isDark
        ? {
          default: "#070d16",
          paper: "#0f172a",
        }
        : {
          default: "#f4f8ff",
          paper: "#ffffff",
        },
      text: isDark
        ? {
          primary: "#e5eef9",
          secondary: "#94a8c4",
        }
        : {
          primary: "#0f172a",
          secondary: "#475569",
        },
      divider: isDark ? "rgba(148, 163, 184, 0.2)" : "rgba(100, 116, 139, 0.28)",
      success: { main: "#16a34a" },
      warning: { main: "#d97706" },
      error: { main: "#dc2626" },
      info: { main: "#0284c7" },
    },
    shape: {
      borderRadius: 14,
    },
    typography: {
      fontFamily: '"Manrope", "Space Grotesk", "Segoe UI", sans-serif',
      h4: { fontWeight: 700, letterSpacing: -0.3 },
      h5: { fontWeight: 700, letterSpacing: -0.2 },
      h6: { fontWeight: 650 },
      button: { fontWeight: 600, textTransform: "none" },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ":root": {
            "--app-bg": isDark ? "#070d16" : "#f4f8ff",
            "--surface-1": isDark ? "rgba(15, 23, 42, 0.82)" : "rgba(255, 255, 255, 0.92)",
            "--surface-2": isDark ? "rgba(15, 23, 42, 0.92)" : "rgba(255, 255, 255, 0.98)",
            "--surface-3": isDark ? "rgba(30, 41, 59, 0.48)" : "rgba(203, 213, 225, 0.35)",
            "--border-subtle": isDark ? "rgba(148, 163, 184, 0.22)" : "rgba(100, 116, 139, 0.26)",
            "--shadow-1": isDark ? "0 26px 48px rgba(2, 8, 26, 0.42)" : "0 20px 42px rgba(15, 23, 42, 0.1)",
            "--shadow-2": isDark ? "0 14px 26px rgba(2, 8, 26, 0.3)" : "0 10px 20px rgba(15, 23, 42, 0.08)",
          },
          "html, body, #root": {
            height: "100%",
          },
          body: {
            margin: 0,
            background: isDark
              ? "radial-gradient(1100px circle at 5% -18%, rgba(14,165,233,0.18), transparent 44%), radial-gradient(950px circle at 98% -8%, rgba(20,184,166,0.14), transparent 42%), radial-gradient(900px circle at 65% 120%, rgba(59,130,246,0.08), transparent 35%), #070d16"
              : "radial-gradient(1100px circle at 5% -18%, rgba(56,189,248,0.16), transparent 44%), radial-gradient(950px circle at 98% -8%, rgba(20,184,166,0.12), transparent 42%), radial-gradient(900px circle at 65% 120%, rgba(14,165,233,0.08), transparent 35%), #f4f8ff",
            color: isDark ? "#e5eef9" : "#0f172a",
          },
          "*::-webkit-scrollbar": {
            width: "9px",
            height: "9px",
          },
          "*::-webkit-scrollbar-track": {
            background: isDark ? "rgba(15,23,42,0.5)" : "rgba(226,232,240,0.7)",
          },
          "*::-webkit-scrollbar-thumb": {
            background: isDark ? "rgba(100,116,139,0.55)" : "rgba(100,116,139,0.45)",
            borderRadius: "999px",
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            border: "1px solid var(--border-subtle)",
            backgroundImage: "none",
            backgroundColor: "var(--surface-1)",
            boxShadow: "var(--shadow-1)",
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            border: "1px solid var(--border-subtle)",
            backgroundImage: "none",
            backgroundColor: "var(--surface-1)",
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            paddingInline: 15,
          },
          containedPrimary: {
            boxShadow: isDark ? "0 12px 24px rgba(14,165,233,0.3)" : "0 10px 18px rgba(2,132,199,0.24)",
          },
          outlined: {
            borderColor: isDark ? "rgba(148,163,184,0.28)" : "rgba(100,116,139,0.34)",
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            backgroundColor: "var(--surface-2)",
          },
          notchedOutline: {
            borderColor: isDark ? "rgba(148,163,184,0.24)" : "rgba(100,116,139,0.3)",
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          head: {
            color: isDark ? "#a4b0c2" : "#334155",
            fontWeight: 700,
            borderBottomColor: isDark ? "rgba(148,163,184,0.2)" : "rgba(100,116,139,0.2)",
          },
          body: {
            borderBottomColor: isDark ? "rgba(148,163,184,0.16)" : "rgba(100,116,139,0.12)",
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 8,
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          indicator: {
            height: 3,
            borderRadius: 999,
            backgroundColor: "#3b82f6",
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            textTransform: "none",
            fontWeight: 600,
            minHeight: 44,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: "var(--surface-1)",
            backgroundImage: "none",
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: 10,
          },
        },
      },
    },
  });
}
