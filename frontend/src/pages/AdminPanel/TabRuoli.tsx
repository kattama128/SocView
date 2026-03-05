import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Button,
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
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useEffect, useState } from "react";

import {
  deleteCustomerMembership,
  fetchCustomerMemberships,
  fetchCustomers,
  type CustomerMembershipRecord,
  upsertCustomerMembership,
} from "../../services/alertsApi";
import { fetchUserAccounts } from "../../services/usersApi";
import { UserAccount } from "../../types/users";

type CustomerSummary = {
  id: number;
  name: string;
};

export default function TabRuoli() {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [membershipsByCustomer, setMembershipsByCustomer] = useState<Record<number, CustomerMembershipRecord[]>>({});
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | "">("");
  const [selectedScope, setSelectedScope] = useState<"viewer" | "triage" | "manager">("viewer");

  const load = async () => {
    setError(null);
    try {
      const [customersPayload, usersPayload] = await Promise.all([fetchCustomers(true), fetchUserAccounts()]);
      setCustomers(customersPayload.map((item) => ({ id: item.id, name: item.name })));
      setUsers(usersPayload);

      const membershipEntries = await Promise.all(
        customersPayload.map(async (customer) => {
          const items = await fetchCustomerMemberships(customer.id);
          return [customer.id, items] as const;
        }),
      );

      const map: Record<number, CustomerMembershipRecord[]> = {};
      membershipEntries.forEach(([customerId, list]) => {
        map[customerId] = list;
      });
      setMembershipsByCustomer(map);
    } catch {
      setError("Caricamento membership non riuscito.");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openAddDialog = (customerId: number) => {
    setSelectedCustomerId(customerId);
    setSelectedUserId("");
    setSelectedScope("viewer");
    setDialogOpen(true);
  };

  const saveMembership = async () => {
    if (!selectedCustomerId || selectedUserId === "") {
      return;
    }
    try {
      const updated = await upsertCustomerMembership(selectedCustomerId, {
        user_id: Number(selectedUserId),
        scope: selectedScope,
        is_active: true,
      });
      setMembershipsByCustomer((current) => ({ ...current, [selectedCustomerId]: updated }));
      setDialogOpen(false);
    } catch {
      setError("Salvataggio membership non riuscito.");
    }
  };

  const removeMembership = async (customerId: number, userId: number) => {
    try {
      const updated = await deleteCustomerMembership(customerId, userId);
      setMembershipsByCustomer((current) => ({ ...current, [customerId]: updated }));
    } catch {
      setError("Rimozione membership non riuscita.");
    }
  };

  return (
    <Stack spacing={1.2}>
      <Typography variant="h6">Ruoli & Membership</Typography>
      {error ? <Alert severity="error">{error}</Alert> : null}

      {customers.map((customer) => {
        const memberships = membershipsByCustomer[customer.id] ?? [];
        return (
          <Accordion key={customer.id}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography sx={{ fontWeight: 600 }}>{customer.name}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={1}>
                <Stack direction="row" justifyContent="flex-end">
                  <Button size="small" startIcon={<AddIcon />} onClick={() => openAddDialog(customer.id)}>
                    Aggiungi membership
                  </Button>
                </Stack>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Utente</TableCell>
                      <TableCell>Email</TableCell>
                      <TableCell>Ruolo</TableCell>
                      <TableCell>Attivo</TableCell>
                      <TableCell align="right">Azioni</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {memberships.map((membership) => (
                      <TableRow key={membership.id}>
                        <TableCell>{membership.username}</TableCell>
                        <TableCell>{membership.email}</TableCell>
                        <TableCell>{membership.scope}</TableCell>
                        <TableCell>{membership.is_active ? "Si" : "No"}</TableCell>
                        <TableCell align="right">
                          <Button
                            size="small"
                            startIcon={<DeleteIcon />}
                            onClick={() => void removeMembership(customer.id, membership.user_id)}
                          >
                            Rimuovi
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Stack>
            </AccordionDetails>
          </Accordion>
        );
      })}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <DialogTitle>Aggiungi membership</DialogTitle>
        <DialogContent>
          <Stack spacing={1.2} sx={{ mt: 0.6, minWidth: 360 }}>
            <TextField
              select
              label="Utente"
              value={selectedUserId}
              onChange={(event) => setSelectedUserId(Number(event.target.value))}
            >
              {users.map((user) => (
                <MenuItem key={user.id} value={user.id}>
                  {user.username}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label="Scope" value={selectedScope} onChange={(event) => setSelectedScope(event.target.value as "viewer" | "triage" | "manager")}> 
              <MenuItem value="viewer">viewer</MenuItem>
              <MenuItem value="triage">triage</MenuItem>
              <MenuItem value="manager">manager</MenuItem>
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Annulla</Button>
          <Button variant="contained" onClick={() => void saveMembership()}>
            Salva
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
