import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { Alert, Box, Button, IconButton, InputAdornment, Stack, TextField, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const { login, sessionMessage, clearSessionMessage } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? "/home";

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    clearSessionMessage();

    try {
      await login(username, password);
      navigate(from, { replace: true });
    } catch {
      setError("Credenziali non valide. Riprova.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 2,
        background: isDark
          ? "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(59,130,246,0.12), transparent), #050a12"
          : "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(59,130,246,0.06), transparent), #f8fafc",
      }}
    >
      <Box
        sx={{
          width: "100%",
          maxWidth: 420,
          borderRadius: 4,
          border: `1px solid ${isDark ? "rgba(148,163,184,0.1)" : "rgba(226,232,240,0.8)"}`,
          background: isDark ? "rgba(12,20,37,0.9)" : "rgba(255,255,255,0.95)",
          backdropFilter: "blur(20px)",
          boxShadow: isDark
            ? "0 8px 32px rgba(0,0,0,0.4)"
            : "0 8px 32px rgba(0,0,0,0.06)",
          p: { xs: 3.5, sm: 4.5 },
        }}
      >
        <Stack spacing={3.5}>
          {/* Brand */}
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: 2.5,
                display: "grid",
                placeItems: "center",
                background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
                boxShadow: `0 8px 24px ${alpha(theme.palette.primary.main, 0.3)}`,
              }}
            >
              <ShieldOutlinedIcon sx={{ color: "#fff", fontSize: 24 }} />
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 700, fontSize: "1.25rem", lineHeight: 1.2, letterSpacing: "-0.02em" }}>
                SocView
              </Typography>
              <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", fontWeight: 500 }}>
                SOC Operations Platform
              </Typography>
            </Box>
          </Stack>

          {/* Header */}
          <Box>
            <Typography variant="h5" sx={{ mb: 0.5 }}>
              Bentornato
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Inserisci le credenziali per accedere alla piattaforma.
            </Typography>
          </Box>

          {/* Form */}
          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={2.5}>
              {sessionMessage ? <Alert severity="warning" sx={{ borderRadius: 2.5 }}>{sessionMessage}</Alert> : null}
              {error ? <Alert severity="error" sx={{ borderRadius: 2.5 }}>{error}</Alert> : null}
              <TextField
                label="Username"
                name="username"
                inputProps={{ "data-testid": "username-input" }}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
                fullWidth
                autoFocus
              />
              <TextField
                label="Password"
                name="password"
                inputProps={{ "data-testid": "password-input" }}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                fullWidth
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        onClick={() => setShowPassword((prev) => !prev)}
                        edge="end"
                        aria-label={showPassword ? "nascondi password" : "mostra password"}
                      >
                        {showPassword ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={submitting}
                data-testid="login-button"
                fullWidth
                sx={{
                  py: 1.4,
                  fontSize: "0.9375rem",
                  fontWeight: 600,
                  borderRadius: 2.5,
                  background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
                  "&:hover": {
                    background: `linear-gradient(135deg, ${theme.palette.primary.light}, ${theme.palette.primary.main})`,
                  },
                }}
              >
                {submitting ? "Accesso in corso..." : "Accedi"}
              </Button>
            </Stack>
          </Box>

          {/* Footer */}
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ textAlign: "center", display: "block", pt: 0.5 }}
          >
            Piattaforma protetta &middot; Accesso riservato
          </Typography>
        </Stack>
      </Box>
    </Box>
  );
}
