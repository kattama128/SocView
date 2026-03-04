import { Alert, Box, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import { FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const { login, sessionMessage, clearSessionMessage } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("Admin123!");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? "/";

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
    <Stack alignItems="center" justifyContent="center" sx={{ minHeight: "100vh", p: 2 }}>
      <Paper elevation={4} sx={{ width: "100%", maxWidth: 420, p: 4 }}>
        <Typography variant="h4" gutterBottom>
          Accesso SocView
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Inserisci username e password locali.
        </Typography>

        <Box component="form" onSubmit={handleSubmit}>
          <Stack spacing={2}>
            {sessionMessage ? <Alert severity="warning">{sessionMessage}</Alert> : null}
            {error ? <Alert severity="error">{error}</Alert> : null}
            <TextField
              label="Username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <Button type="submit" variant="contained" disabled={submitting}>
              {submitting ? "Accesso in corso..." : "Accedi"}
            </Button>
          </Stack>
        </Box>
      </Paper>
    </Stack>
  );
}
