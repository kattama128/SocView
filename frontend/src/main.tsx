import { CssBaseline, ThemeProvider } from "@mui/material";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { CustomerProvider } from "./context/CustomerContext";
import { appTheme } from "./theme";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      <BrowserRouter>
        <AuthProvider>
          <CustomerProvider>
            <App />
          </CustomerProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
);
