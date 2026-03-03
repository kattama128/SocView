import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  MenuItem,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useCustomer } from "../context/CustomerContext";
import {
  loadCustomerSourcePreferences,
  loadGlobalSourcesConfig,
  saveCustomerSourcePreferences,
  type CustomerSourcePreferences,
  type GlobalSourceDefinition,
} from "../mocks/sourceCatalog";

export default function AdminConfigPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { customers, selectedCustomer, selectedCustomerId, setSelectedCustomerId } = useCustomer();

  const [sources, setSources] = useState<GlobalSourceDefinition[]>(() => loadGlobalSourcesConfig());
  const [preferences, setPreferences] = useState<CustomerSourcePreferences>(() => loadCustomerSourcePreferences());
  const [message, setMessage] = useState<string | null>(null);

  const queryCustomerId = Number(searchParams.get("customerId") ?? 0) || null;

  useEffect(() => {
    setSources(loadGlobalSourcesConfig());
    setPreferences(loadCustomerSourcePreferences());
  }, []);

  useEffect(() => {
    if (queryCustomerId && queryCustomerId !== selectedCustomerId) {
      setSelectedCustomerId(queryCustomerId);
      return;
    }
    if (!selectedCustomerId && customers.length) {
      setSelectedCustomerId(customers[0].id);
    }
  }, [customers, queryCustomerId, selectedCustomerId, setSelectedCustomerId]);

  const activeCustomer = useMemo(() => {
    if (selectedCustomer) {
      return selectedCustomer;
    }
    if (selectedCustomerId) {
      return customers.find((item) => item.id === selectedCustomerId) ?? null;
    }
    return null;
  }, [customers, selectedCustomer, selectedCustomerId]);

  const enabledCount = useMemo(() => {
    if (!activeCustomer) {
      return 0;
    }
    return sources.filter((source) => preferences[activeCustomer.id]?.[source.id] ?? true).length;
  }, [activeCustomer, preferences, sources]);

  const toggleSourceForCustomer = (sourceId: number, enabled: boolean) => {
    if (!activeCustomer) {
      return;
    }
    setPreferences((current) => ({
      ...current,
      [activeCustomer.id]: {
        ...(current[activeCustomer.id] ?? {}),
        [sourceId]: enabled,
      },
    }));
    setMessage(null);
  };

  const save = () => {
    saveCustomerSourcePreferences(preferences);
    setMessage("Abilitazioni fonti del cliente salvate.");
  };

  if (!activeCustomer) {
    return <Alert severity="info">Seleziona un cliente dal menu in alto a destra.</Alert>;
  }

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }} spacing={1.5}>
        <Box>
          <Typography sx={{ color: "#f8fafc", fontSize: { xs: 26, md: 34 }, fontWeight: 700 }}>
            Impostazioni Cliente
          </Typography>
          <Typography sx={{ color: "#64748b" }}>
            Qui puoi solo abilitare/disabilitare le fonti globali per il cliente selezionato.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <TextField
            select
            size="small"
            label="Cliente"
            value={activeCustomer.id}
            onChange={(event) => setSelectedCustomerId(Number(event.target.value))}
            sx={{ minWidth: 220, "& .MuiOutlinedInput-root": { bgcolor: "rgba(15,23,42,0.86)", color: "#cbd5e1" } }}
          >
            {customers.map((customer) => (
              <MenuItem key={customer.id} value={customer.id}>
                {customer.name}
              </MenuItem>
            ))}
          </TextField>
          <Button variant="outlined" onClick={() => navigate("/sources")}>Gestisci fonti globali</Button>
          <Button variant="contained" onClick={save}>Salva</Button>
        </Stack>
      </Stack>

      {message ? <Alert severity="success">{message}</Alert> : null}

      <Stack direction="row" spacing={1}>
        <Chip
          size="small"
          label={`Cliente: ${activeCustomer.name}`}
          sx={{ color: "#93c5fd", border: "1px solid rgba(59,130,246,0.35)", background: "rgba(30,64,175,0.18)" }}
        />
        <Chip
          size="small"
          label={`Fonti abilitate: ${enabledCount}/${sources.length}`}
          sx={{ color: "#86efac", border: "1px solid rgba(74,222,128,0.35)", background: "rgba(20,83,45,0.2)" }}
        />
      </Stack>

      <Card sx={{ borderRadius: 3, border: "1px solid rgba(148,163,184,0.24)", background: "linear-gradient(180deg, rgba(15,23,42,0.88), rgba(15,23,42,0.72))" }}>
        <CardContent>
          <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1.2 }}>Abilitazioni Fonti per Cliente</Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ color: "#94a3b8" }}>Fonte</TableCell>
                <TableCell sx={{ color: "#94a3b8" }}>Metodo</TableCell>
                <TableCell sx={{ color: "#94a3b8" }}>Endpoint</TableCell>
                <TableCell sx={{ color: "#94a3b8" }}>Parser</TableCell>
                <TableCell sx={{ color: "#94a3b8" }}>Tipi allarme</TableCell>
                <TableCell sx={{ color: "#94a3b8" }}>Abilitata per cliente</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sources.map((source) => {
                const enabled = preferences[activeCustomer.id]?.[source.id] ?? true;
                return (
                  <TableRow key={source.id}>
                    <TableCell sx={{ color: "#e2e8f0" }}>{source.name}</TableCell>
                    <TableCell sx={{ color: "#cbd5e1" }}>{source.method}</TableCell>
                    <TableCell sx={{ color: "#94a3b8", maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis" }}>{source.endpoint}</TableCell>
                    <TableCell sx={{ color: "#c4b5fd" }}>{source.parserEntries.length}</TableCell>
                    <TableCell sx={{ color: "#fcd34d" }}>{source.alertTypeRules.length}</TableCell>
                    <TableCell>
                      <Switch
                        checked={enabled}
                        onChange={(event) => toggleSourceForCustomer(source.id, event.target.checked)}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Stack>
  );
}
