import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
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
import { useNavigate, useParams } from "react-router-dom";

import { useCustomer } from "../context/CustomerContext";
import {
  loadCustomerSourcePreferences,
  loadGlobalSourcesConfig,
  saveCustomerSourcePreferences,
  type CustomerSourcePreferences,
  type GlobalSourceDefinition,
} from "../mocks/sourceCatalog";

const settingsStorageKey = "socview_customer_settings_v1";

type CustomerSettings = {
  tier: string;
  timezone: string;
  slaTarget: string;
  primaryContact: string;
  contactEmail: string;
  contactPhone: string;
  notifyChannels: string;
  escalationMatrix: string;
  maintenanceWindow: string;
  defaultSeverity: string;
  autoAssignTeam: string;
  notifyOnCritical: boolean;
  notifyOnHigh: boolean;
  allowSuppress: boolean;
  retentionDays: number;
  tagDefaults: string;
  enrichGeo: boolean;
  enrichThreatIntel: boolean;
  allowExternalSharing: boolean;
};

type CustomerSettingsMap = Record<number, CustomerSettings>;

const defaultSettings: CustomerSettings = {
  tier: "Gold",
  timezone: "Europe/Rome",
  slaTarget: "15m",
  primaryContact: "SOC Lead",
  contactEmail: "soc@example.com",
  contactPhone: "+39 000 000 000",
  notifyChannels: "Email, Slack, PagerDuty",
  escalationMatrix: "L1 -> L2 -> L3",
  maintenanceWindow: "Sunday 02:00 - 03:00",
  defaultSeverity: "medium",
  autoAssignTeam: "SOC L1",
  notifyOnCritical: true,
  notifyOnHigh: true,
  allowSuppress: true,
  retentionDays: 365,
  tagDefaults: "customer, socview",
  enrichGeo: true,
  enrichThreatIntel: true,
  allowExternalSharing: false,
};

function loadCustomerSettingsMap(): CustomerSettingsMap {
  try {
    const raw = localStorage.getItem(settingsStorageKey);
    if (!raw) return {};
    return JSON.parse(raw) as CustomerSettingsMap;
  } catch {
    return {};
  }
}

export default function CustomerSettingsPage() {
  const navigate = useNavigate();
  const { customerId } = useParams();
  const { customers, selectedCustomer, selectedCustomerId, setSelectedCustomerId } = useCustomer();

  const [sources, setSources] = useState<GlobalSourceDefinition[]>(() => loadGlobalSourcesConfig());
  const [preferences, setPreferences] = useState<CustomerSourcePreferences>(() => loadCustomerSourcePreferences());
  const [message, setMessage] = useState<string | null>(null);
  const [settingsMap, setSettingsMap] = useState<CustomerSettingsMap>(() => loadCustomerSettingsMap());

  const routeCustomerId = Number(customerId ?? 0) || null;

  useEffect(() => {
    setSources(loadGlobalSourcesConfig());
    setPreferences(loadCustomerSourcePreferences());
  }, []);

  useEffect(() => {
    if (routeCustomerId && routeCustomerId !== selectedCustomerId) {
      setSelectedCustomerId(routeCustomerId);
      return;
    }
    if (!selectedCustomerId && customers.length) {
      setSelectedCustomerId(customers[0].id);
    }
  }, [customers, routeCustomerId, selectedCustomerId, setSelectedCustomerId]);

  useEffect(() => {
    localStorage.setItem(settingsStorageKey, JSON.stringify(settingsMap));
  }, [settingsMap]);

  const activeCustomer = useMemo(() => {
    if (selectedCustomer) return selectedCustomer;
    if (selectedCustomerId) return customers.find((item) => item.id === selectedCustomerId) ?? null;
    return null;
  }, [customers, selectedCustomer, selectedCustomerId]);

  const activeSettings = useMemo(() => {
    if (!activeCustomer) return defaultSettings;
    return (
      settingsMap[activeCustomer.id] ?? {
        ...defaultSettings,
        contactEmail: `${activeCustomer.code.toLowerCase()}@example.com`,
      }
    );
  }, [activeCustomer, settingsMap]);

  const enabledCount = useMemo(() => {
    if (!activeCustomer) return 0;
    return sources.filter((source) => preferences[activeCustomer.id]?.[source.id] ?? true).length;
  }, [activeCustomer, preferences, sources]);

  const updateSettings = (partial: Partial<CustomerSettings>) => {
    if (!activeCustomer) return;
    setSettingsMap((current) => ({
      ...current,
      [activeCustomer.id]: {
        ...(current[activeCustomer.id] ?? defaultSettings),
        ...partial,
      },
    }));
  };

  const toggleSourceForCustomer = (sourceId: number, enabled: boolean) => {
    if (!activeCustomer) return;
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
    setMessage("Impostazioni cliente salvate.");
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
            Profilo, SLA, routing e abilitazioni fonti per il cliente selezionato.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap">
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
          <Button variant="outlined" onClick={() => navigate(`/costumers/${activeCustomer.id}`)}>
            Torna al cliente
          </Button>
          <Button variant="outlined" onClick={() => navigate("/sources")}>Gestisci fonti globali</Button>
          <Button variant="contained" onClick={save}>Salva</Button>
        </Stack>
      </Stack>

      {message ? <Alert severity="success">{message}</Alert> : null}

      <Stack direction="row" spacing={1} flexWrap="wrap">
        <Chip size="small" label={`Cliente: ${activeCustomer.name}`} sx={{ color: "#93c5fd", border: "1px solid rgba(59,130,246,0.35)", background: "rgba(30,64,175,0.18)" }} />
        <Chip size="small" label={`Fonti abilitate: ${enabledCount}/${sources.length}`} sx={{ color: "#86efac", border: "1px solid rgba(74,222,128,0.35)", background: "rgba(20,83,45,0.2)" }} />
        <Chip size="small" label={`Tier: ${activeSettings.tier}`} sx={{ color: "#c4b5fd", border: "1px solid rgba(167,139,250,0.35)", background: "rgba(76,29,149,0.2)" }} />
      </Stack>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Card sx={{ borderRadius: 3, border: "1px solid rgba(148,163,184,0.24)", background: "linear-gradient(180deg, rgba(15,23,42,0.88), rgba(15,23,42,0.72))" }}>
            <CardContent>
              <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>Profilo & Contatti</Typography>
              <Divider sx={{ mb: 2, borderColor: "rgba(148,163,184,0.2)" }} />
              <Stack spacing={1.2}>
                <TextField label="Tier" value={activeSettings.tier} onChange={(event) => updateSettings({ tier: event.target.value })} />
                <TextField label="Timezone" value={activeSettings.timezone} onChange={(event) => updateSettings({ timezone: event.target.value })} />
                <TextField label="SLA target" value={activeSettings.slaTarget} onChange={(event) => updateSettings({ slaTarget: event.target.value })} />
                <TextField label="Primary contact" value={activeSettings.primaryContact} onChange={(event) => updateSettings({ primaryContact: event.target.value })} />
                <TextField label="Email" value={activeSettings.contactEmail} onChange={(event) => updateSettings({ contactEmail: event.target.value })} />
                <TextField label="Phone" value={activeSettings.contactPhone} onChange={(event) => updateSettings({ contactPhone: event.target.value })} />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card sx={{ borderRadius: 3, border: "1px solid rgba(148,163,184,0.24)", background: "linear-gradient(180deg, rgba(15,23,42,0.88), rgba(15,23,42,0.72))" }}>
            <CardContent>
              <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>Routing & Notifiche</Typography>
              <Divider sx={{ mb: 2, borderColor: "rgba(148,163,184,0.2)" }} />
              <Stack spacing={1.2}>
                <TextField label="Team assegnazione" value={activeSettings.autoAssignTeam} onChange={(event) => updateSettings({ autoAssignTeam: event.target.value })} />
                <TextField label="Canali notifiche" value={activeSettings.notifyChannels} onChange={(event) => updateSettings({ notifyChannels: event.target.value })} />
                <TextField label="Escalation matrix" value={activeSettings.escalationMatrix} onChange={(event) => updateSettings({ escalationMatrix: event.target.value })} />
                <TextField label="Maintenance window" value={activeSettings.maintenanceWindow} onChange={(event) => updateSettings({ maintenanceWindow: event.target.value })} />
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography sx={{ color: "#e2e8f0" }}>Notify critical</Typography>
                  <Switch checked={activeSettings.notifyOnCritical} onChange={(event) => updateSettings({ notifyOnCritical: event.target.checked })} />
                </Stack>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography sx={{ color: "#e2e8f0" }}>Notify high</Typography>
                  <Switch checked={activeSettings.notifyOnHigh} onChange={(event) => updateSettings({ notifyOnHigh: event.target.checked })} />
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card sx={{ borderRadius: 3, border: "1px solid rgba(148,163,184,0.24)", background: "linear-gradient(180deg, rgba(15,23,42,0.88), rgba(15,23,42,0.72))" }}>
            <CardContent>
              <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>Policy allarmi</Typography>
              <Divider sx={{ mb: 2, borderColor: "rgba(148,163,184,0.2)" }} />
              <Stack spacing={1.2}>
                <TextField
                  select
                  label="Default severity"
                  value={activeSettings.defaultSeverity}
                  onChange={(event) => updateSettings({ defaultSeverity: event.target.value })}
                >
                  {[
                    "critical",
                    "high",
                    "medium",
                    "low",
                  ].map((item) => (
                    <MenuItem key={item} value={item}>{item}</MenuItem>
                  ))}
                </TextField>
                <TextField label="Tag predefiniti" value={activeSettings.tagDefaults} onChange={(event) => updateSettings({ tagDefaults: event.target.value })} />
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography sx={{ color: "#e2e8f0" }}>Consenti soppressione</Typography>
                  <Switch checked={activeSettings.allowSuppress} onChange={(event) => updateSettings({ allowSuppress: event.target.checked })} />
                </Stack>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography sx={{ color: "#e2e8f0" }}>Enrichment GEO</Typography>
                  <Switch checked={activeSettings.enrichGeo} onChange={(event) => updateSettings({ enrichGeo: event.target.checked })} />
                </Stack>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography sx={{ color: "#e2e8f0" }}>Enrichment Threat Intel</Typography>
                  <Switch checked={activeSettings.enrichThreatIntel} onChange={(event) => updateSettings({ enrichThreatIntel: event.target.checked })} />
                </Stack>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography sx={{ color: "#e2e8f0" }}>Condivisione esterna</Typography>
                  <Switch checked={activeSettings.allowExternalSharing} onChange={(event) => updateSettings({ allowExternalSharing: event.target.checked })} />
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card sx={{ borderRadius: 3, border: "1px solid rgba(148,163,184,0.24)", background: "linear-gradient(180deg, rgba(15,23,42,0.88), rgba(15,23,42,0.72))" }}>
            <CardContent>
              <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>Retention & Compliance</Typography>
              <Divider sx={{ mb: 2, borderColor: "rgba(148,163,184,0.2)" }} />
              <Stack spacing={1.2}>
                <TextField
                  label="Retention (days)"
                  type="number"
                  value={activeSettings.retentionDays}
                  onChange={(event) => updateSettings({ retentionDays: Number(event.target.value) })}
                />
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

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
                    <TableCell sx={{ color: "#94a3b8", maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {source.endpoint}
                    </TableCell>
                    <TableCell sx={{ color: "#c4b5fd" }}>{source.parserEntries.length}</TableCell>
                    <TableCell sx={{ color: "#fcd34d" }}>{source.alertTypeRules.length}</TableCell>
                    <TableCell>
                      <Switch checked={enabled} onChange={(event) => toggleSourceForCustomer(source.id, event.target.checked)} />
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
