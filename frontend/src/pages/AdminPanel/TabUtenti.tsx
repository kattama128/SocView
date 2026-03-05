import {
  Alert,
  Avatar,
  Box,
  Button,
  Snackbar,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";

import {
  createUserAccount,
  fetchRoles,
  fetchUserAccounts,
  resetUserAccountPassword,
  setUserAccountActive,
  updateUserAccount,
} from "../../services/usersApi";
import { RoleDefinition, UserAccount, UserAccountPayload } from "../../types/users";

type DraftState = UserAccountPayload;

const emptyDraft: DraftState = {
  username: "",
  email: "",
  first_name: "",
  last_name: "",
  role: "SOC_ANALYST",
  password: "",
  is_active: true,
};

export default function TabUtenti() {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [draft, setDraft] = useState<DraftState>(emptyDraft);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  const editingUser = useMemo(
    () => (editingUserId ? users.find((user) => user.id === editingUserId) ?? null : null),
    [editingUserId, users],
  );

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersPayload, rolesPayload] = await Promise.all([fetchUserAccounts(), fetchRoles()]);
      setUsers(usersPayload);
      setRoles(rolesPayload);
    } catch {
      setError("Impossibile caricare utenti/ruoli.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openCreate = () => {
    setEditingUserId(null);
    setDraft(emptyDraft);
    setDialogOpen(true);
  };

  const openEdit = (user: UserAccount) => {
    setEditingUserId(user.id);
    setDraft({
      username: user.username,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
      is_active: user.is_active,
      password: "",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    setError(null);
    try {
      if (editingUser) {
        const payload: Partial<UserAccountPayload> = { ...draft };
        if (!payload.password) {
          delete payload.password;
        }
        await updateUserAccount(editingUser.id, payload);
        setSnackbarMessage("Utente aggiornato");
      } else {
        await createUserAccount(draft);
        setSnackbarMessage("Utente creato");
      }
      setDialogOpen(false);
      await load();
    } catch {
      setError("Salvataggio utente non riuscito.");
    }
  };

  const toggleActive = async (user: UserAccount) => {
    setError(null);
    try {
      const updated = await setUserAccountActive(user.id, !user.is_active);
      setUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSnackbarMessage("Stato utente aggiornato");
    } catch {
      setError("Aggiornamento stato utente non riuscito.");
    }
  };

  const resetPassword = async (user: UserAccount) => {
    setError(null);
    try {
      await resetUserAccountPassword(user.id);
      setSnackbarMessage("Reset password inviato");
    } catch {
      setError("Reset password non riuscito.");
    }
  };

  return (
    <Stack spacing={1.2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h6">Utenti</Typography>
        <Button variant="contained" onClick={openCreate} data-testid="create-user-button">
          Nuovo Utente
        </Button>
      </Stack>

      {error ? <Alert severity="error">{error}</Alert> : null}
      {loading ? <Typography color="text.secondary">Caricamento…</Typography> : null}

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Avatar</TableCell>
            <TableCell>Username</TableCell>
            <TableCell>Email</TableCell>
            <TableCell>Ruolo globale</TableCell>
            <TableCell>Ultimo login</TableCell>
            <TableCell>Status</TableCell>
            <TableCell align="right">Azioni</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id} data-testid="user-row">
              <TableCell>
                <Avatar sx={{ width: 30, height: 30 }}>{user.username.slice(0, 1).toUpperCase()}</Avatar>
              </TableCell>
              <TableCell>{user.username}</TableCell>
              <TableCell>{user.email || "-"}</TableCell>
              <TableCell>{user.role}</TableCell>
              <TableCell>{user.last_login ? new Date(user.last_login).toLocaleString("it-IT") : "-"}</TableCell>
              <TableCell>
                <Box
                  component="span"
                  sx={{
                    px: 1,
                    py: 0.2,
                    borderRadius: 1,
                    bgcolor: user.is_active ? "success.light" : "error.light",
                    color: "common.white",
                    fontSize: 12,
                  }}
                >
                  {user.is_active ? "Attivo" : "Disattivo"}
                </Box>
              </TableCell>
              <TableCell align="right">
                <Stack direction="row" spacing={0.8} justifyContent="flex-end">
                  <Button size="small" onClick={() => openEdit(user)}>
                    Modifica
                  </Button>
                  <Button size="small" onClick={() => void toggleActive(user)}>
                    {user.is_active ? "Disattiva" : "Attiva"}
                  </Button>
                  <Button size="small" onClick={() => void resetPassword(user)}>
                    Reset password
                  </Button>
                </Stack>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingUser ? "Modifica utente" : "Nuovo utente"}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.2} sx={{ mt: 0.6 }}>
            <TextField
              fullWidth
              label="Username"
              name="username"
              value={draft.username}
              onChange={(event) => setDraft((current) => ({ ...current, username: event.target.value }))}
            />
            <TextField
              fullWidth
              label="Email"
              name="email"
              value={draft.email}
              onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
            />
            <TextField
              fullWidth
              label="Password temporanea"
              type="password"
              name="password"
              value={draft.password ?? ""}
              onChange={(event) => setDraft((current) => ({ ...current, password: event.target.value }))}
            />
            <TextField
              select
              fullWidth
              label="Ruolo globale"
              value={draft.role}
              onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value }))}
            >
              {roles.map((role) => (
                <MenuItem key={role.role} value={role.role}>
                  {role.label}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Annulla</Button>
          <Button variant="contained" type="submit" onClick={() => void save()}>
            {editingUser ? "Salva" : "Crea"}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(snackbarMessage)}
        autoHideDuration={3500}
        onClose={() => setSnackbarMessage(null)}
        message={snackbarMessage ?? ""}
        data-testid="snackbar-success"
      />
    </Stack>
  );
}
