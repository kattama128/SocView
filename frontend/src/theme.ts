import type { PaletteMode } from "@mui/material";
import { createTheme } from "@mui/material/styles";

const TRANSITION_SPEED = "0.2s cubic-bezier(0.4, 0, 0.2, 1)";

export function createAppTheme(mode: PaletteMode) {
  const isDark = mode === "dark";

  return createTheme({
    palette: {
      mode,
      primary: isDark
        ? { main: "#3b82f6", light: "#93c5fd", dark: "#1d4ed8" }
        : { main: "#2563eb", light: "#60a5fa", dark: "#1e40af" },
      secondary: isDark
        ? { main: "#10b981", light: "#6ee7b7", dark: "#059669" }
        : { main: "#059669", light: "#34d399", dark: "#047857" },
      background: isDark
        ? {
            default: "#050a12",
            paper: "#0c1425",
          }
        : {
            default: "#f8fafc",
            paper: "#ffffff",
          },
      text: isDark
        ? {
            primary: "#e2e8f0",
            secondary: "#94a3b8",
          }
        : {
            primary: "#0f172a",
            secondary: "#64748b",
          },
      divider: isDark ? "rgba(148, 163, 184, 0.12)" : "rgba(100, 116, 139, 0.16)",
      success: { main: "#22c55e", light: "#4ade80", dark: "#16a34a" },
      warning: { main: "#f59e0b", light: "#fbbf24", dark: "#d97706" },
      error: { main: "#ef4444", light: "#f87171", dark: "#dc2626" },
      info: { main: "#3b82f6", light: "#60a5fa", dark: "#2563eb" },
    },
    shape: {
      borderRadius: 12,
    },
    typography: {
      fontFamily: '"Inter", "Manrope", "Segoe UI", system-ui, sans-serif',
      h4: { fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.2 },
      h5: { fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.3 },
      h6: { fontWeight: 650, letterSpacing: "-0.005em", lineHeight: 1.3 },
      subtitle1: { fontWeight: 600, lineHeight: 1.5 },
      subtitle2: { fontWeight: 600, fontSize: "0.8125rem", lineHeight: 1.5 },
      body1: { lineHeight: 1.6 },
      body2: { lineHeight: 1.6 },
      button: { fontWeight: 600, textTransform: "none", letterSpacing: "0.01em" },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ":root": {
            "--app-bg": isDark ? "#050a12" : "#f8fafc",
            "--surface-1": isDark ? "rgba(12, 20, 37, 0.85)" : "rgba(255, 255, 255, 0.92)",
            "--surface-2": isDark ? "rgba(12, 20, 37, 0.95)" : "rgba(255, 255, 255, 0.98)",
            "--surface-3": isDark ? "rgba(30, 41, 59, 0.4)" : "rgba(241, 245, 249, 0.8)",
            "--border-subtle": isDark ? "rgba(148, 163, 184, 0.1)" : "rgba(226, 232, 240, 0.8)",
            "--border-hover": isDark ? "rgba(148, 163, 184, 0.2)" : "rgba(203, 213, 225, 0.9)",
            "--shadow-1": isDark
              ? "0 1px 2px rgba(0,0,0,0.3), 0 8px 24px rgba(0,0,0,0.25)"
              : "0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)",
            "--shadow-2": isDark
              ? "0 1px 2px rgba(0,0,0,0.2), 0 4px 12px rgba(0,0,0,0.15)"
              : "0 1px 2px rgba(0,0,0,0.03), 0 2px 8px rgba(0,0,0,0.04)",
            "--transition": TRANSITION_SPEED,
          },
          "html, body, #root": {
            height: "100%",
          },
          body: {
            margin: 0,
            background: isDark
              ? "radial-gradient(ellipse 80% 60% at 0% 0%, rgba(59,130,246,0.08), transparent 50%), radial-gradient(ellipse 60% 50% at 100% 0%, rgba(16,185,129,0.06), transparent 50%), #050a12"
              : "#f8fafc",
            color: isDark ? "#e2e8f0" : "#0f172a",
            transition: `background ${TRANSITION_SPEED}, color ${TRANSITION_SPEED}`,
          },
          "*::-webkit-scrollbar": {
            width: "6px",
            height: "6px",
          },
          "*::-webkit-scrollbar-track": {
            background: "transparent",
          },
          "*::-webkit-scrollbar-thumb": {
            background: isDark ? "rgba(100,116,139,0.35)" : "rgba(100,116,139,0.25)",
            borderRadius: "999px",
            "&:hover": {
              background: isDark ? "rgba(100,116,139,0.55)" : "rgba(100,116,139,0.45)",
            },
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
            transition: `border-color ${TRANSITION_SPEED}, box-shadow ${TRANSITION_SPEED}`,
            "&:hover": {
              borderColor: "var(--border-hover)",
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            border: "1px solid var(--border-subtle)",
            backgroundImage: "none",
            backgroundColor: "var(--surface-1)",
            transition: `border-color ${TRANSITION_SPEED}, box-shadow ${TRANSITION_SPEED}, background-color ${TRANSITION_SPEED}`,
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            paddingInline: 18,
            paddingBlock: 8,
            transition: `all ${TRANSITION_SPEED}`,
          },
          containedPrimary: {
            boxShadow: isDark ? "0 4px 14px rgba(59,130,246,0.3)" : "0 4px 14px rgba(37,99,235,0.2)",
            "&:hover": {
              boxShadow: isDark ? "0 6px 20px rgba(59,130,246,0.4)" : "0 6px 20px rgba(37,99,235,0.28)",
            },
          },
          outlined: {
            borderColor: isDark ? "rgba(148,163,184,0.2)" : "rgba(203,213,225,0.8)",
            "&:hover": {
              borderColor: isDark ? "rgba(148,163,184,0.35)" : "rgba(148,163,184,0.5)",
              background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
            },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            backgroundColor: isDark ? "rgba(15,23,42,0.5)" : "rgba(248,250,252,0.8)",
            transition: `border-color ${TRANSITION_SPEED}, background-color ${TRANSITION_SPEED}, box-shadow ${TRANSITION_SPEED}`,
            "&:hover .MuiOutlinedInput-notchedOutline": {
              borderColor: isDark ? "rgba(148,163,184,0.35)" : "rgba(148,163,184,0.5)",
            },
            "&.Mui-focused": {
              backgroundColor: isDark ? "rgba(15,23,42,0.7)" : "#fff",
            },
          },
          notchedOutline: {
            borderColor: isDark ? "rgba(148,163,184,0.15)" : "rgba(226,232,240,0.9)",
            transition: `border-color ${TRANSITION_SPEED}`,
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          head: {
            color: isDark ? "#94a3b8" : "#475569",
            fontWeight: 600,
            fontSize: "0.75rem",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            borderBottomColor: isDark ? "rgba(148,163,184,0.1)" : "rgba(226,232,240,0.8)",
          },
          body: {
            borderBottomColor: isDark ? "rgba(148,163,184,0.07)" : "rgba(241,245,249,1)",
            fontSize: "0.875rem",
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            fontWeight: 500,
            transition: `all ${TRANSITION_SPEED}`,
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          indicator: {
            height: 2.5,
            borderRadius: 999,
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            textTransform: "none",
            fontWeight: 600,
            minHeight: 44,
            transition: `color ${TRANSITION_SPEED}`,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: isDark ? "#0c1425" : "#ffffff",
            backgroundImage: "none",
            transition: `background-color ${TRANSITION_SPEED}`,
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
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            borderRadius: 8,
            fontSize: "0.75rem",
            fontWeight: 500,
            padding: "6px 12px",
            backgroundColor: isDark ? "#1e293b" : "#0f172a",
          },
        },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: {
            borderRadius: 999,
            height: 3,
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 16,
            border: "1px solid var(--border-subtle)",
            backgroundImage: "none",
            backgroundColor: isDark ? "#0f172a" : "#ffffff",
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            borderRadius: 12,
            border: "1px solid var(--border-subtle)",
            boxShadow: isDark
              ? "0 4px 24px rgba(0,0,0,0.4)"
              : "0 4px 24px rgba(0,0,0,0.08)",
          },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            margin: "2px 6px",
            transition: `background-color ${TRANSITION_SPEED}`,
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            transition: `background-color ${TRANSITION_SPEED}`,
            "&:hover": {
              backgroundColor: isDark ? "rgba(59,130,246,0.04)" : "rgba(59,130,246,0.03)",
            },
          },
        },
      },
      MuiBadge: {
        styleOverrides: {
          badge: {
            fontWeight: 600,
            fontSize: "0.7rem",
          },
        },
      },
    },
  });
}
