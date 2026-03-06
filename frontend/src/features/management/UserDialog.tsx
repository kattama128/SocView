import { useEffect, useState } from "react";

import AddIcon from "@mui/icons-material/Add";
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";

import { deleteCustomerMembership, upsertCustomerMembership } from "../../services/alertsApi";
import type { CustomerSummary } from "../../types/alerts";
import type { RoleDefinition, UserAccount, UserAccountPayload, UserMembership } from "../../types/users";

const SCOPE_OPTIONS: { value: "viewer" | "triage" | "manager"; label: string }[] = [
  { value: "viewer", label: "Viewer (lettura)" },
  { value: "triage", label: "Triage" },
  { value: "manager", label: "Manager" },
];

type Props = {
  open: boolean;
  editingUser: UserAccount | null;
  draftUser: UserAccountPayload;
  roleOptions: RoleDefinition[];
  canManageUsers: boolean;
  customers: CustomerSummary[];
  onChange: (next: UserAccountPayload) => void;
  onClose: () => void;
  onSave: () => void;
  onMembershipsChanged: (userId: number, memberships: UserMembership[]) => void;
};

export default function UserDialog({
  open,
  editingUser,
  draftUser,
  roleOptions,
  canManageUsers,
  customers,
  onChange,
  onClose,
  onSave,
  onMembershipsChanged,
}: Props) {
  // Local membership state (only in edit mode)
  const [localMemberships, setLocalMemberships] = useState<UserMembership[]>([]);
  const [membershipError, setMembershipError] = useState<string | null>(null);
  const [membershipLoading, setMembershipLoading] = useState<number | null>(null); // customerId being processed

  // Add-membership form
  const [addCustomerId, setAddCustomerId] = useState<number | "">("");
  const [addScope, setAddScope] = useState<"viewer" | "triage" | "manager">("viewer");

  // Sync local memberships when editingUser changes
  useEffect(() => {
    if (editingUser) {
      setLocalMemberships(editingUser.memberships ?? []);
    } else {
      setLocalMemberships([]);
    }
    setMembershipError(null);
    setAddCustomerId("");
    setAddScope("viewer");
  }, [editingUser]);

  const handleAddMembership = async () => {
    if (!editingUser || addCustomerId === "") return;
    const customerId = Number(addCustomerId);
    setMembershipLoading(customerId);
    setMembershipError(null);
    try {
      await upsertCustomerMembership(customerId, {
        user_id: editingUser.id,
        scope: addScope,
        is_active: true,
      });
      // Build a local UserMembership entry
      const customerName = customers.find((c) => c.id === customerId)?.name ?? String(customerId);
      const existing = localMemberships.find((m) => m.customer_id === customerId);
      const updated: UserMembership = existing
        ? { ...existing, scope: addScope, is_active: true }
        : {
            id: 0,
            customer_id: customerId,
            customer_name: customerName,
            scope: addScope,
            is_active: true,
            notes: "",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
      const newMemberships = existing
        ? localMemberships.map((m) => (m.customer_id === customerId ? updated : m))
        : [...localMemberships, updated];
      setLocalMemberships(newMemberships);
      onMembershipsChanged(editingUser.id, newMemberships);
      setAddCustomerId("");
    } catch {
      setMembershipError("Errore aggiunta membership.");
    } finally {
      setMembershipLoading(null);
    }
  };

  const handleRemoveMembership = async (membership: UserMembership) => {
    if (!editingUser) return;
    setMembershipLoading(membership.customer_id);
    setMembershipError(null);
    try {
      await deleteCustomerMembership(membership.customer_id, editingUser.id);
      const newMemberships = localMemberships.filter((m) => m.customer_id !== membership.customer_id);
      setLocalMemberships(newMemberships);
      onMembershipsChanged(editingUser.id, newMemberships);
    } catch {
      setMembershipError("Errore rimozione membership.");
    } finally {
      setMembershipLoading(null);
    }
  };

  // Customers not yet assigned to this user
  const assignableCustomers = customers.filter(
    (c) => !localMemberships.some((m) => m.customer_id === c.id),
  );

  const canSave =
    canManageUsers &&
    Boolean(draftUser.username) &&
    Boolean(draftUser.email) &&
    (!editingUser ? Boolean(draftUser.password) : true);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{editingUser ? "Modifica utente" : "Nuovo utente"}</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Username"
            value={draftUser.username}
            onChange={(event) => onChange({ ...draftUser, username: event.target.value })}
          />
          <TextField
            label="Email"
            value={draftUser.email}
            onChange={(event) => onChange({ ...draftUser, email: event.target.value })}
          />
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <TextField
              label="Nome"
              value={draftUser.first_name}
              onChange={(event) => onChange({ ...draftUser, first_name: event.target.value })}
            />
            <TextField
              label="Cognome"
              value={draftUser.last_name}
              onChange={(event) => onChange({ ...draftUser, last_name: event.target.value })}
            />
          </Stack>
          <TextField
            label="Ruolo"
            select
            value={draftUser.role}
            onChange={(event) => onChange({ ...draftUser, role: event.target.value })}
          >
            {roleOptions.map((role) => (
              <MenuItem key={role.role} value={role.role}>
                {role.label}
              </MenuItem>
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
            <Switch
              checked={draftUser.is_active ?? true}
              onChange={(event) => onChange({ ...draftUser, is_active: event.target.checked })}
            />
          </Stack>

          {/* Membership section — only in edit mode */}
          {editingUser && (
            <>
              <Divider sx={{ borderColor: "rgba(148,163,184,0.2)" }} />
              <Typography variant="subtitle2" sx={{ color: "#94a3b8", fontWeight: 600, letterSpacing: "0.05em" }}>
                MEMBERSHIP CLIENTI
              </Typography>

              {membershipError && (
                <Alert severity="error" onClose={() => setMembershipError(null)} sx={{ py: 0.5 }}>
                  {membershipError}
                </Alert>
              )}

              {/* Current memberships */}
              {localMemberships.length > 0 ? (
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                  {localMemberships.map((m) => (
                    <Chip
                      key={m.customer_id}
                      label={`${m.customer_name} · ${m.scope}`}
                      size="small"
                      onDelete={
                        membershipLoading === m.customer_id ? undefined : () => handleRemoveMembership(m)
                      }
                      deleteIcon={
                        membershipLoading === m.customer_id ? <CircularProgress size={12} /> : undefined
                      }
                      sx={{
                        color: "#bae6fd",
                        border: "1px solid rgba(56,189,248,0.35)",
                      }}
                    />
                  ))}
                </Stack>
              ) : (
                <Typography sx={{ color: "#64748b", fontSize: 13 }}>Nessuna membership assegnata.</Typography>
              )}

              {/* Add membership form */}
              {assignableCustomers.length > 0 && (
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
                  <TextField
                    select
                    label="Cliente"
                    size="small"
                    value={addCustomerId}
                    onChange={(e) => setAddCustomerId(e.target.value === "" ? "" : Number(e.target.value))}
                    sx={{ flex: 1 }}
                  >
                    <MenuItem value="">
                      <em>Seleziona cliente</em>
                    </MenuItem>
                    {assignableCustomers.map((c) => (
                      <MenuItem key={c.id} value={c.id}>
                        {c.name}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select
                    label="Scope"
                    size="small"
                    value={addScope}
                    onChange={(e) => setAddScope(e.target.value as typeof addScope)}
                    sx={{ minWidth: 140 }}
                  >
                    {SCOPE_OPTIONS.map((opt) => (
                      <MenuItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </MenuItem>
                    ))}
                  </TextField>
                  <Tooltip title="Aggiungi membership">
                    <span>
                      <IconButton
                        onClick={handleAddMembership}
                        disabled={addCustomerId === "" || membershipLoading !== null}
                        color="primary"
                        size="small"
                      >
                        {membershipLoading !== null ? <CircularProgress size={18} /> : <AddIcon />}
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              )}
              {customers.length > 0 && assignableCustomers.length === 0 && localMemberships.length > 0 && (
                <Typography sx={{ color: "#64748b", fontSize: 12 }}>
                  L'utente è già membro di tutti i clienti disponibili.
                </Typography>
              )}
            </>
          )}

          {!editingUser && customers.length > 0 && (
            <Alert severity="info" sx={{ py: 0.5 }}>
              Le membership cliente possono essere aggiunte dopo la creazione dell'utente.
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Annulla</Button>
        <Button variant="contained" onClick={onSave} disabled={!canSave}>
          Salva
        </Button>
      </DialogActions>
    </Dialog>
  );
}
