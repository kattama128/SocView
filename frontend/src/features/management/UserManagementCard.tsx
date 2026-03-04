import { Button, Card, CardContent, Chip, Divider, IconButton, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import PersonOffIcon from "@mui/icons-material/PersonOff";

import type { UserAccount } from "../../types/users";
import { surfaceCardSx } from "../../styles/surfaces";

type Props = {
  users: UserAccount[];
  filteredUsers: UserAccount[];
  userSearch: string;
  statusFilter: "all" | "active" | "suspended";
  loading: boolean;
  error: string | null;
  canManageUsers: boolean;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: "all" | "active" | "suspended") => void;
  onCreate: () => void;
  onEdit: (user: UserAccount) => void;
  onToggleStatus: (user: UserAccount) => void;
};

export default function UserManagementCard({
  users,
  filteredUsers,
  userSearch,
  statusFilter,
  loading,
  error,
  canManageUsers,
  onSearchChange,
  onStatusChange,
  onCreate,
  onEdit,
  onToggleStatus,
}: Props) {
  return (
    <Card sx={surfaceCardSx}>
      <CardContent>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          <Typography sx={{ color: "#e2e8f0", fontWeight: 700 }}>Gestione utenti</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip size="small" label={`Utenti: ${users.length}`} sx={{ color: "#93c5fd", border: "1px solid rgba(59,130,246,0.35)" }} />
            <Button variant="contained" size="small" onClick={onCreate} disabled={!canManageUsers}>Nuovo utente</Button>
          </Stack>
        </Stack>
        <Divider sx={{ mb: 2, borderColor: "rgba(148,163,184,0.2)" }} />
        <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ mb: 2 }}>
          <TextField
            label="Cerca utente"
            value={userSearch}
            onChange={(event) => onSearchChange(event.target.value)}
            sx={{ flex: 1 }}
          />
          <TextField
            label="Stato"
            select
            value={statusFilter}
            onChange={(event) => onStatusChange(event.target.value as "all" | "active" | "suspended")}
            sx={{ minWidth: 160 }}
          >
            {[
              { label: "Tutti", value: "all" },
              { label: "Attivi", value: "active" },
              { label: "Sospesi", value: "suspended" },
            ].map((option) => (
              <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
            ))}
          </TextField>
        </Stack>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: "#94a3b8" }}>Nome</TableCell>
              <TableCell sx={{ color: "#94a3b8" }}>Email</TableCell>
              <TableCell sx={{ color: "#94a3b8" }}>Ruolo</TableCell>
              <TableCell sx={{ color: "#94a3b8" }}>Ambiti cliente</TableCell>
              <TableCell sx={{ color: "#94a3b8" }}>Stato</TableCell>
              <TableCell sx={{ color: "#94a3b8" }}>Ultimo accesso</TableCell>
              <TableCell sx={{ color: "#94a3b8" }}>Azioni</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredUsers.map((user) => (
              <TableRow key={user.id}>
                <TableCell sx={{ color: "#e2e8f0" }}>{`${user.first_name} ${user.last_name}`.trim() || user.username}</TableCell>
                <TableCell sx={{ color: "#cbd5e1" }}>{user.email}</TableCell>
                <TableCell sx={{ color: "#cbd5e1" }}>{user.role}</TableCell>
                <TableCell sx={{ color: "#cbd5e1" }}>
                  {(user.memberships || [])
                    .filter((membership) => membership.is_active)
                    .map((membership) => `${membership.customer_name} (${membership.scope})`)
                    .join(", ") || "-"}
                </TableCell>
                <TableCell>
                  <Chip size="small" label={user.is_active ? "active" : "suspended"} sx={{ color: user.is_active ? "#34d399" : "#fca5a5", border: "1px solid rgba(148,163,184,0.2)" }} />
                </TableCell>
                <TableCell sx={{ color: "#cbd5e1" }}>{user.last_login ? new Date(user.last_login).toLocaleString() : "-"}</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={1}>
                    <IconButton size="small" onClick={() => onEdit(user)} sx={{ color: "#93c5fd" }} disabled={!canManageUsers}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => onToggleStatus(user)} sx={{ color: user.is_active ? "#fbbf24" : "#34d399" }} disabled={!canManageUsers}>
                      <PersonOffIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {loading && <Typography sx={{ color: "#94a3b8", mt: 2 }}>Caricamento utenti...</Typography>}
        {error && <Typography sx={{ color: "#fca5a5", mt: 2 }}>{error}</Typography>}
      </CardContent>
    </Card>
  );
}
