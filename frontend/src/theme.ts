import { alpha, createTheme } from "@mui/material/styles";

export const appTheme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#14b8a6", light: "#5eead4", dark: "#0f766e" },
    secondary: { main: "#0ea5e9", light: "#7dd3fc", dark: "#0369a1" },
    background: {
      default: "#0b1220",
      paper: "#101a2b",
    },
    text: {
      primary: "#e5ecf7",
      secondary: "#93a4bd",
    },
    divider: "rgba(148, 163, 184, 0.24)",
    success: { main: "#22c55e" },
    warning: { main: "#f59e0b" },
    error: { main: "#ef4444" },
    info: { main: "#38bdf8" },
  },
  shape: {
    borderRadius: 14,
  },
  typography: {
    fontFamily: '"Space Grotesk", "Manrope", "Segoe UI", sans-serif',
    h4: { fontWeight: 700, letterSpacing: -0.2 },
    h5: { fontWeight: 700, letterSpacing: -0.1 },
    h6: { fontWeight: 650 },
    button: { fontWeight: 600, textTransform: "none" },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background:
            "radial-gradient(1200px circle at 8% -10%, rgba(20,184,166,0.16), transparent 46%), radial-gradient(1100px circle at 90% 0%, rgba(14,165,233,0.14), transparent 46%), #0b1220",
          color: "#e5ecf7",
        },
        "*::-webkit-scrollbar": {
          width: "10px",
          height: "10px",
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
          border: "1px solid rgba(100,116,139,0.28)",
          backgroundImage: "none",
          backgroundColor: alpha("#0f172a", 0.82),
          boxShadow: "0 20px 42px rgba(2, 6, 23, 0.38)",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          border: "1px solid rgba(100,116,139,0.28)",
          backgroundImage: "none",
          backgroundColor: alpha("#0f172a", 0.82),
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          paddingInline: 14,
        },
        containedPrimary: {
          boxShadow: "0 10px 24px rgba(20,184,166,0.22)",
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          backgroundColor: alpha("#0f172a", 0.7),
        },
        notchedOutline: {
          borderColor: "rgba(100,116,139,0.34)",
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          color: "#9eb0ca",
          fontWeight: 700,
          borderBottomColor: "rgba(100,116,139,0.28)",
        },
        body: {
          borderBottomColor: "rgba(100,116,139,0.2)",
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
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: alpha("#0f172a", 0.92),
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
