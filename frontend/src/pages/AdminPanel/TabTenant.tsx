import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";

import OnboardingWizard from "../../components/OnboardingWizard";
import {
  checkTenantDomain,
  createTenantAsync,
  fetchTaskStatus,
  fetchTenantsAdmin,
  TenantAdminItem,
} from "../../services/coreApi";

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

type Props = {
  isPublicSchema: boolean;
};

export default function TabTenant({ isPublicSchema }: Props) {
  const [tenants, setTenants] = useState<TenantAdminItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [schemaName, setSchemaName] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardTenantKey, setWizardTenantKey] = useState<string | null>(null);
  const [wizardTenantDomain, setWizardTenantDomain] = useState<string | null>(null);

  const load = async () => {
    if (!isPublicSchema) {
      setTenants([]);
      return;
    }
    setError(null);
    try {
      const payload = await fetchTenantsAdmin();
      setTenants(payload);
    } catch {
      setError("Caricamento tenant non riuscito.");
    }
  };

  useEffect(() => {
    void load();
  }, [isPublicSchema]);

  const createTenant = async () => {
    if (!name.trim() || !domain.trim() || !schemaName.trim()) {
      setError("Compila nome, dominio e schema.");
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const domainCheck = await checkTenantDomain(domain.trim().toLowerCase());
      if (!domainCheck.available) {
        setError("Dominio già in uso.");
        setCreating(false);
        return;
      }

      const createResponse = await createTenantAsync({
        name: name.trim(),
        domain: domain.trim().toLowerCase(),
        schema_name: schemaName.trim().toLowerCase(),
      });

      for (let index = 0; index < 30; index += 1) {
        const status = await fetchTaskStatus(createResponse.task_id);
        if (status.status === "SUCCESS") {
          const tenantIdValue = typeof status.result?.tenant_id === "number" ? status.result.tenant_id : null;
          await load();
          setDialogOpen(false);
          setWizardTenantKey(tenantIdValue !== null ? String(tenantIdValue) : schemaName.trim().toLowerCase());
          setWizardTenantDomain(domain.trim().toLowerCase());
          setWizardOpen(true);
          setCreating(false);
          return;
        }
        if (status.status === "FAILURE") {
          setError(status.error ?? "Creazione tenant fallita.");
          setCreating(false);
          return;
        }
        await wait(2000);
      }

      setError("Timeout creazione tenant: verifica stato task.");
    } catch {
      setError("Creazione tenant non riuscita.");
    } finally {
      setCreating(false);
    }
  };

  if (!isPublicSchema) {
    return <Alert severity="warning">Tab Tenant visibile solo in schema public.</Alert>;
  }

  return (
    <Stack spacing={1.2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h6">Tenant</Typography>
        <Button variant="contained" onClick={() => setDialogOpen(true)}>
          Crea Tenant
        </Button>
      </Stack>
      {error ? <Alert severity="error">{error}</Alert> : null}

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Nome</TableCell>
            <TableCell>Dominio</TableCell>
            <TableCell>Schema</TableCell>
            <TableCell>Alert totali</TableCell>
            <TableCell>Stato</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {tenants.map((tenant) => (
            <TableRow key={tenant.id}>
              <TableCell>{tenant.name}</TableCell>
              <TableCell>{tenant.domain}</TableCell>
              <TableCell>{tenant.schema_name}</TableCell>
              <TableCell>{tenant.alert_count}</TableCell>
              <TableCell>{tenant.status === "active" ? "attivo" : "scaduto"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Crea tenant</DialogTitle>
        <DialogContent>
          <Stack spacing={1.2} sx={{ mt: 0.6 }}>
            <TextField label="Nome" value={name} onChange={(event) => setName(event.target.value)} />
            <TextField label="Dominio" value={domain} onChange={(event) => setDomain(event.target.value)} />
            <TextField label="Schema" value={schemaName} onChange={(event) => setSchemaName(event.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Annulla</Button>
          <Button variant="contained" disabled={creating} onClick={() => void createTenant()}>
            {creating ? "Creazione..." : "Crea"}
          </Button>
        </DialogActions>
      </Dialog>

      <OnboardingWizard
        open={wizardOpen}
        tenantKey={wizardTenantKey}
        tenantDomain={wizardTenantDomain}
        onClose={() => setWizardOpen(false)}
      />
    </Stack>
  );
}
