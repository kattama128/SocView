import { alpha, createTheme } from "@mui/material/styles";

export const appTheme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#0ea5e9", light: "#7dd3fc", dark: "#0369a1" },
    secondary: { main: "#14b8a6", light: "#5eead4", dark: "#0f766e" },
    background: {
      default: "#070d16",
      paper: "#0f172a",
    },
    text: {
      primary: "#e5eef9",
      secondary: "#94a8c4",
    },
    divider: "rgba(148, 163, 184, 0.2)",
    success: { main: "#22c55e" },
    warning: { main: "#f59e0b" },
    error: { main: "#ef4444" },
    info: { main: "#38bdf8" },
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
          "--app-bg": "#070d16",
          "--surface-1": "rgba(15, 23, 42, 0.82)",
          "--surface-2": "rgba(15, 23, 42, 0.92)",
          "--surface-3": "rgba(30, 41, 59, 0.48)",
          "--border-subtle": "rgba(148, 163, 184, 0.22)",
          "--shadow-1": "0 26px 48px rgba(2, 8, 26, 0.42)",
          "--shadow-2": "0 14px 26px rgba(2, 8, 26, 0.3)",
        },
        "html, body, #root": {
          height: "100%",
        },
        body: {
          margin: 0,
          background:
            "radial-gradient(1100px circle at 5% -18%, rgba(14,165,233,0.18), transparent 44%), radial-gradient(950px circle at 98% -8%, rgba(20,184,166,0.14), transparent 42%), radial-gradient(900px circle at 65% 120%, rgba(59,130,246,0.08), transparent 35%), #070d16",
          color: "#e5eef9",
        },
        "*::-webkit-scrollbar": {
          width: "9px",
          height: "9px",
        },
        "*::-webkit-scrollbar-track": {
          background: "rgba(15,23,42,0.5)",
        },
        "*::-webkit-scrollbar-thumb": {
          background: "rgba(100,116,139,0.55)",
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
          boxShadow: "0 12px 24px rgba(14,165,233,0.3)",
        },
        outlined: {
          borderColor: "rgba(148,163,184,0.28)",
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
          borderColor: "rgba(148,163,184,0.24)",
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          color: "#a4b0c2",
          fontWeight: 700,
          borderBottomColor: "rgba(148,163,184,0.2)",
        },
        body: {
          borderBottomColor: "rgba(148,163,184,0.16)",
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
