import { Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, Switch, TextField, Typography } from "@mui/material";

import type { RoleDefinition, UserAccount, UserAccountPayload } from "../../types/users";

type Props = {
  open: boolean;
  editingUser: UserAccount | null;
  draftUser: UserAccountPayload;
  roleOptions: RoleDefinition[];
  canManageUsers: boolean;
  onChange: (next: UserAccountPayload) => void;
  onClose: () => void;
  onSave: () => void;
};

export default function UserDialog({ open, editingUser, draftUser, roleOptions, canManageUsers, onChange, onClose, onSave }: Props) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{editingUser ? "Modifica utente" : "Nuovo utente"}</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Username" value={draftUser.username} onChange={(event) => onChange({ ...draftUser, username: event.target.value })} />
          <TextField label="Email" value={draftUser.email} onChange={(event) => onChange({ ...draftUser, email: event.target.value })} />
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <TextField label="Nome" value={draftUser.first_name} onChange={(event) => onChange({ ...draftUser, first_name: event.target.value })} />
            <TextField label="Cognome" value={draftUser.last_name} onChange={(event) => onChange({ ...draftUser, last_name: event.target.value })} />
          </Stack>
          <TextField
            label="Ruolo"
            select
            value={draftUser.role}
            onChange={(event) => onChange({ ...draftUser, role: event.target.value })}
          >
            {roleOptions.map((role) => (
              <MenuItem key={role.role} value={role.role}>{role.label}</MenuItem>
            ))}
          </TextField>
          <TextField
            label={editingUser ? "Nuova password (opzionale)" : "Password"}
            type="password"
            value={draftUser.password ?? ""}
            onChange={(event) => onChange({ ...draftUser, password: event.target.value })}
          />
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography>Utente attivo</Typography>
            <Switch checked={draftUser.is_active ?? true} onChange={(event) => onChange({ ...draftUser, is_active: event.target.checked })} />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Annulla</Button>
        <Button
          variant="contained"
          onClick={onSave}
          disabled={!canManageUsers || !draftUser.username || !draftUser.email || (!editingUser && !draftUser.password)}
        >
          Salva
        </Button>
      </DialogActions>
    </Dialog>
  );
}
