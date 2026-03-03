import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import ScienceIcon from "@mui/icons-material/Science";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  IconButton,
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

import {
  authTypeOptions,
  ingestionMethodOptions,
  loadGlobalSourcesConfig,
  saveGlobalSourcesConfig,
  type AuthType,
  type GlobalSourceDefinition,
  type IngestionMethod,
  type MatchMode,
} from "../mocks/sourceCatalog";

const severityOptions = ["critical", "high", "medium", "low"] as const;
const sourceSettingsStorageKey = "socview_source_settings_v1";

type SourceAdvancedConfig = {
  headerName: string;
  apiKeyName: string;
  oauthTokenUrl: string;
  usernameRef: string;
  passwordRef: string;
  verifyTls: boolean;
  signatureHeader: string;
  webhookSecret: string;
  pollingIntervalSeconds: number;
  rateLimitPerMinute: number;
  timeoutSeconds: number;
  retryCount: number;
  backoffSeconds: number;
  healthStatus: "healthy" | "warning" | "error";
  lastCheckAt: string;
  lastError: string;
  dedupStrategy: string;
  dedupWindowMinutes: number;
  dedupFields: string;
  parseMode: string;
  dropUnknown: boolean;
  timezone: string;
  mappingVersion: string;
  retentionDays: number;
  defaultSeverity: string;
  defaultTags: string;
};

type SourceSettingsMap = Record<number, SourceAdvancedConfig>;

function nextSourceId(sources: GlobalSourceDefinition[]): number {
  return Math.max(100, ...sources.map((item) => item.id + 1));
}

function createNewSource(existing: GlobalSourceDefinition[]): GlobalSourceDefinition {
  const id = nextSourceId(existing);
  return {
    id,
    name: `Nuova fonte ${id}`,
    method: "webhook_http",
    description: "",
    endpoint: `https://collector.socview.local/source/${id}`,
    authType: "api_key",
    pullIntervalSeconds: 60,
    enabled: true,
    parserEntries: [
      { id: `p-${id}-1`, key: "eventId", value: "event_id" },
      { id: `p-${id}-2`, key: "title", value: "alert_name" },
      { id: `p-${id}-3`, key: "severity", value: "severity" },
    ],
    alertTypeRules: [],
  };
}

function defaultAdvancedConfig(source: GlobalSourceDefinition): SourceAdvancedConfig {
  return {
    headerName: "X-API-Key",
    apiKeyName: `key-${source.id}`,
    oauthTokenUrl: "https://idp.socview.local/oauth/token",
    usernameRef: "vault/sources/user",
    passwordRef: "vault/sources/password",
    verifyTls: true,
    signatureHeader: "X-Signature",
    webhookSecret: `wh-${source.id}-secret`,
    pollingIntervalSeconds: source.pullIntervalSeconds || 60,
    rateLimitPerMinute: 120,
    timeoutSeconds: 20,
    retryCount: 3,
    backoffSeconds: 10,
    healthStatus: source.enabled ? "healthy" : "warning",
    lastCheckAt: "2026-03-03 12:00",
    lastError: "",
    dedupStrategy: "fingerprint",
    dedupWindowMinutes: 30,
    dedupFields: "event_id, title, source_ip",
    parseMode: "jsonpath",
    dropUnknown: true,
    timezone: "UTC",
    mappingVersion: "v1",
    retentionDays: 90,
    defaultSeverity: "medium",
    defaultTags: "source, incoming",
  };
}

function loadSourceSettings(): SourceSettingsMap {
  try {
    const raw = localStorage.getItem(sourceSettingsStorageKey);
    if (!raw) return {};
    return JSON.parse(raw) as SourceSettingsMap;
  } catch {
    return {};
  }
}

export default function SourcesPage() {
  const [sources, setSources] = useState<GlobalSourceDefinition[]>(() => loadGlobalSourcesConfig());
  const [selectedSourceId, setSelectedSourceId] = useState<number | null>(() => (sources.length ? sources[0].id : null));
  const [message, setMessage] = useState<string | null>(null);
  const [sourceSettings, setSourceSettings] = useState<SourceSettingsMap>(() => loadSourceSettings());

  const selectedSource = useMemo(
    () => sources.find((item) => item.id === selectedSourceId) ?? null,
    [sources, selectedSourceId],
  );

  useEffect(() => {
    setSourceSettings((current) => {
      const next = { ...current };
      sources.forEach((source) => {
        if (!next[source.id]) {
          next[source.id] = defaultAdvancedConfig(source);
        }
      });
      return next;
    });
  }, [sources]);

  useEffect(() => {
    localStorage.setItem(sourceSettingsStorageKey, JSON.stringify(sourceSettings));
  }, [sourceSettings]);

  const advanced = selectedSource ? sourceSettings[selectedSource.id] ?? defaultAdvancedConfig(selectedSource) : null;

  const persist = (next: GlobalSourceDefinition[], okMessage: string) => {
    setSources(next);
    saveGlobalSourcesConfig(next);
    setMessage(okMessage);
  };

  const updateSelected = (updater: (source: GlobalSourceDefinition) => GlobalSourceDefinition) => {
    if (!selectedSource) return;
    const next = sources.map((item) => (item.id === selectedSource.id ? updater(item) : item));
    persist(next, "Configurazione fonte aggiornata.");
  };

  const updateAdvanced = (partial: Partial<SourceAdvancedConfig>) => {
    if (!selectedSource) return;
    setSourceSettings((current) => ({
      ...current,
      [selectedSource.id]: {
        ...(current[selectedSource.id] ?? defaultAdvancedConfig(selectedSource)),
        ...partial,
      },
    }));
  };

  const addSource = () => {
    const nextSource = createNewSource(sources);
    const next = [...sources, nextSource];
    persist(next, "Nuova fonte creata.");
    setSelectedSourceId(nextSource.id);
  };

  const deleteSource = () => {
    if (!selectedSource) return;
    const next = sources.filter((item) => item.id !== selectedSource.id);
    persist(next, "Fonte eliminata.");
    setSelectedSourceId(next.length ? next[0].id : null);
  };

  const addParserPair = () => {
    updateSelected((source) => ({
      ...source,
      parserEntries: [
        ...source.parserEntries,
        {
          id: `p-${source.id}-${source.parserEntries.length + 1}-${Date.now()}`,
          key: "",
          value: "",
        },
      ],
    }));
  };

  const addAlertRule = () => {
    updateSelected((source) => ({
      ...source,
      alertTypeRules: [
        ...source.alertTypeRules,
        {
          id: `r-${source.id}-${source.alertTypeRules.length + 1}-${Date.now()}`,
          alertName: "Nuovo tipo allarme",
          severity: "medium",
          matchMode: "exact",
          enabled: true,
          notes: "",
          receivedCount: 0,
          lastSeenAt: null,
        },
      ],
    }));
  };

  const testConnection = () => setMessage("Test connessione avviato. Esito: OK (simulato).");
  const runNow = () => setMessage("Ingestion avviata manualmente (simulato)." );

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }} spacing={1.5}>
        <Box>
          <Typography sx={{ color: "#f8fafc", fontSize: { xs: 26, md: 34 }, fontWeight: 700 }}>Sources</Typography>
          <Typography sx={{ color: "#64748b" }}>
            Catalogo globale fonti, parser, health e policy di ingestione.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} sx={{ background: "linear-gradient(180deg,#3b82f6,#1d4ed8)" }} onClick={addSource}>
          Nuova Fonte
        </Button>
      </Stack>

      {message ? <Alert severity="success">{message}</Alert> : null}

      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <Card sx={{ borderRadius: 3, border: "1px solid rgba(148,163,184,0.24)", background: "linear-gradient(180deg, rgba(15,23,42,0.88), rgba(15,23,42,0.72))" }}>
            <CardContent>
              <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>Fonti Globali</Typography>
              <Stack spacing={1}>
                {sources.map((source) => (
                  <Box
                    key={source.id}
                    onClick={() => setSelectedSourceId(source.id)}
                    sx={{
                      p: 1.1,
                      borderRadius: 1.5,
                      border: source.id === selectedSourceId ? "1px solid rgba(96,165,250,0.7)" : "1px solid rgba(71,85,105,0.4)",
                      bgcolor: source.id === selectedSourceId ? "rgba(30,64,175,0.2)" : "rgba(15,23,42,0.55)",
                      cursor: "pointer",
                    }}
                  >
                    <Typography sx={{ color: "#e2e8f0", fontWeight: 600 }}>{source.name}</Typography>
                    <Typography sx={{ color: "#64748b", fontSize: 12 }}>{source.description || "Nessuna descrizione"}</Typography>
                    <Stack direction="row" spacing={0.6} sx={{ mt: 0.7 }} useFlexGap flexWrap="wrap">
                      <Chip size="small" label={source.method} sx={{ color: "#93c5fd", border: "1px solid rgba(59,130,246,0.35)", background: "rgba(30,64,175,0.18)" }} />
                      <Chip size="small" label={source.enabled ? "enabled" : "disabled"} sx={{ color: source.enabled ? "#86efac" : "#fca5a5", border: "1px solid rgba(148,163,184,0.24)", background: "rgba(15,23,42,0.85)" }} />
                      <Chip size="small" label={`Parser: ${source.parserEntries.length}`} sx={{ color: "#c4b5fd", border: "1px solid rgba(167,139,250,0.35)", background: "rgba(76,29,149,0.2)" }} />
                      <Chip size="small" label={`Tipi allarme: ${source.alertTypeRules.length}`} sx={{ color: "#fcd34d", border: "1px solid rgba(234,179,8,0.35)", background: "rgba(113,63,18,0.2)" }} />
                    </Stack>
                  </Box>
                ))}
                {!sources.length ? <Typography sx={{ color: "#64748b" }}>Nessuna fonte configurata.</Typography> : null}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={8}>
          {!selectedSource || !advanced ? (
            <Alert severity="info">Seleziona o crea una fonte per configurare metodi, parser e catalogo allarmi.</Alert>
          ) : (
            <Stack spacing={2}>
              <Card sx={{ borderRadius: 3, border: "1px solid rgba(148,163,184,0.24)", background: "linear-gradient(180deg, rgba(15,23,42,0.88), rgba(15,23,42,0.72))" }}>
                <CardContent>
                  <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }} sx={{ mb: 1.5 }} spacing={1}>
                    <Typography sx={{ color: "#e2e8f0", fontWeight: 700 }}>Configurazione Fonte</Typography>
                    <Stack direction="row" spacing={1}>
                      <Button size="small" startIcon={<ScienceIcon />} onClick={testConnection}>Test connessione</Button>
                      <Button size="small" startIcon={<PlayArrowIcon />} onClick={runNow}>Run now</Button>
                      <Button color="error" startIcon={<DeleteIcon />} onClick={deleteSource}>Elimina</Button>
                    </Stack>
                  </Stack>

                  <Grid container spacing={1.5}>
                    <Grid item xs={12} md={6}>
                      <TextField
                        fullWidth
                        label="Nome fonte"
                        value={selectedSource.name}
                        onChange={(event) => updateSelected((source) => ({ ...source, name: event.target.value }))}
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        fullWidth
                        label="Descrizione"
                        value={selectedSource.description}
                        onChange={(event) => updateSelected((source) => ({ ...source, description: event.target.value }))}
                      />
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <TextField
                        select
                        fullWidth
                        label="Metodo ingestione"
                        value={selectedSource.method}
                        onChange={(event) => updateSelected((source) => ({ ...source, method: event.target.value as IngestionMethod }))}
                      >
                        {ingestionMethodOptions.map((option) => (
                          <MenuItem key={option.value} value={option.value}>
                            {option.label}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <TextField
                        select
                        fullWidth
                        label="Autenticazione"
                        value={selectedSource.authType}
                        onChange={(event) => updateSelected((source) => ({ ...source, authType: event.target.value as AuthType }))}
                      >
                        {authTypeOptions.map((option) => (
                          <MenuItem key={option.value} value={option.value}>
                            {option.label}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ height: "100%" }}>
                        <Typography sx={{ color: "#e2e8f0" }}>Fonte attiva</Typography>
                        <Switch checked={selectedSource.enabled} onChange={(event) => updateSelected((source) => ({ ...source, enabled: event.target.checked }))} />
                      </Stack>
                    </Grid>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="Endpoint / Collector"
                        value={selectedSource.endpoint}
                        onChange={(event) => updateSelected((source) => ({ ...source, endpoint: event.target.value }))}
                      />
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>

              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Card sx={{ borderRadius: 3, border: "1px solid rgba(148,163,184,0.24)", background: "linear-gradient(180deg, rgba(15,23,42,0.88), rgba(15,23,42,0.72))" }}>
                    <CardContent>
                      <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>Auth & Security</Typography>
                      <Stack spacing={1.2}>
                        <TextField label="Header name" value={advanced.headerName} onChange={(event) => updateAdvanced({ headerName: event.target.value })} />
                        <TextField label="API key name" value={advanced.apiKeyName} onChange={(event) => updateAdvanced({ apiKeyName: event.target.value })} />
                        <TextField label="OAuth token URL" value={advanced.oauthTokenUrl} onChange={(event) => updateAdvanced({ oauthTokenUrl: event.target.value })} />
                        <TextField label="Username ref" value={advanced.usernameRef} onChange={(event) => updateAdvanced({ usernameRef: event.target.value })} />
                        <TextField label="Password ref" value={advanced.passwordRef} onChange={(event) => updateAdvanced({ passwordRef: event.target.value })} />
                        <TextField label="Signature header" value={advanced.signatureHeader} onChange={(event) => updateAdvanced({ signatureHeader: event.target.value })} />
                        <TextField label="Webhook secret" value={advanced.webhookSecret} onChange={(event) => updateAdvanced({ webhookSecret: event.target.value })} />
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Typography sx={{ color: "#e2e8f0" }}>Verify TLS</Typography>
                          <Switch checked={advanced.verifyTls} onChange={(event) => updateAdvanced({ verifyTls: event.target.checked })} />
                        </Stack>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid item xs={12} md={6}>
                  <Card sx={{ borderRadius: 3, border: "1px solid rgba(148,163,184,0.24)", background: "linear-gradient(180deg, rgba(15,23,42,0.88), rgba(15,23,42,0.72))" }}>
                    <CardContent>
                      <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>Scheduling & Rate Limits</Typography>
                      <Stack spacing={1.2}>
                        <TextField
                          label="Polling interval (sec)"
                          type="number"
                          value={advanced.pollingIntervalSeconds}
                          onChange={(event) => updateAdvanced({ pollingIntervalSeconds: Number(event.target.value) })}
                        />
                        <TextField
                          label="Rate limit / min"
                          type="number"
                          value={advanced.rateLimitPerMinute}
                          onChange={(event) => updateAdvanced({ rateLimitPerMinute: Number(event.target.value) })}
                        />
                        <TextField
                          label="Timeout (sec)"
                          type="number"
                          value={advanced.timeoutSeconds}
                          onChange={(event) => updateAdvanced({ timeoutSeconds: Number(event.target.value) })}
                        />
                        <TextField
                          label="Retry count"
                          type="number"
                          value={advanced.retryCount}
                          onChange={(event) => updateAdvanced({ retryCount: Number(event.target.value) })}
                        />
                        <TextField
                          label="Backoff (sec)"
                          type="number"
                          value={advanced.backoffSeconds}
                          onChange={(event) => updateAdvanced({ backoffSeconds: Number(event.target.value) })}
                        />
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Card sx={{ borderRadius: 3, border: "1px solid rgba(148,163,184,0.24)", background: "linear-gradient(180deg, rgba(15,23,42,0.88), rgba(15,23,42,0.72))" }}>
                    <CardContent>
                      <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>Health & Observability</Typography>
                      <Stack spacing={1.2}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Chip
                            size="small"
                            label={advanced.healthStatus}
                            sx={{ color: advanced.healthStatus === "healthy" ? "#86efac" : "#fcd34d", border: "1px solid rgba(148,163,184,0.24)" }}
                          />
                          <Typography sx={{ color: "#94a3b8" }}>Last check: {advanced.lastCheckAt}</Typography>
                        </Stack>
                        <TextField label="Last error" value={advanced.lastError} onChange={(event) => updateAdvanced({ lastError: event.target.value })} />
                        <TextField
                          label="Retention (days)"
                          type="number"
                          value={advanced.retentionDays}
                          onChange={(event) => updateAdvanced({ retentionDays: Number(event.target.value) })}
                        />
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid item xs={12} md={6}>
                  <Card sx={{ borderRadius: 3, border: "1px solid rgba(148,163,184,0.24)", background: "linear-gradient(180deg, rgba(15,23,42,0.88), rgba(15,23,42,0.72))" }}>
                    <CardContent>
                      <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>Dedup & Normalization</Typography>
                      <Stack spacing={1.2}>
                        <TextField label="Strategy" value={advanced.dedupStrategy} onChange={(event) => updateAdvanced({ dedupStrategy: event.target.value })} />
                        <TextField
                          label="Window (minutes)"
                          type="number"
                          value={advanced.dedupWindowMinutes}
                          onChange={(event) => updateAdvanced({ dedupWindowMinutes: Number(event.target.value) })}
                        />
                        <TextField label="Fingerprint fields" value={advanced.dedupFields} onChange={(event) => updateAdvanced({ dedupFields: event.target.value })} />
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Card sx={{ borderRadius: 3, border: "1px solid rgba(148,163,184,0.24)", background: "linear-gradient(180deg, rgba(15,23,42,0.88), rgba(15,23,42,0.72))" }}>
                    <CardContent>
                      <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>Parsing & Mapping</Typography>
                      <Stack spacing={1.2}>
                        <TextField label="Parse mode" value={advanced.parseMode} onChange={(event) => updateAdvanced({ parseMode: event.target.value })} />
                        <TextField label="Timezone" value={advanced.timezone} onChange={(event) => updateAdvanced({ timezone: event.target.value })} />
                        <TextField label="Mapping version" value={advanced.mappingVersion} onChange={(event) => updateAdvanced({ mappingVersion: event.target.value })} />
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Typography sx={{ color: "#e2e8f0" }}>Drop unknown fields</Typography>
                          <Switch checked={advanced.dropUnknown} onChange={(event) => updateAdvanced({ dropUnknown: event.target.checked })} />
                        </Stack>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid item xs={12} md={6}>
                  <Card sx={{ borderRadius: 3, border: "1px solid rgba(148,163,184,0.24)", background: "linear-gradient(180deg, rgba(15,23,42,0.88), rgba(15,23,42,0.72))" }}>
                    <CardContent>
                      <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>Default tagging & severity</Typography>
                      <Stack spacing={1.2}>
                        <TextField label="Default tags" value={advanced.defaultTags} onChange={(event) => updateAdvanced({ defaultTags: event.target.value })} />
                        <TextField
                          select
                          label="Default severity"
                          value={advanced.defaultSeverity}
                          onChange={(event) => updateAdvanced({ defaultSeverity: event.target.value })}
                        >
                          {severityOptions.map((severity) => (
                            <MenuItem key={severity} value={severity}>{severity}</MenuItem>
                          ))}
                        </TextField>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              <Card sx={{ borderRadius: 3, border: "1px solid rgba(148,163,184,0.24)", background: "linear-gradient(180deg, rgba(15,23,42,0.88), rgba(15,23,42,0.72))" }}>
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                    <Typography sx={{ color: "#e2e8f0", fontWeight: 700 }}>Parser key:value</Typography>
                    <Button size="small" startIcon={<AddIcon />} onClick={addParserPair}>Aggiungi</Button>
                  </Stack>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ color: "#94a3b8" }}>Chiave origine</TableCell>
                        <TableCell sx={{ color: "#94a3b8" }}>Campo normalizzato</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {selectedSource.parserEntries.map((pair, idx) => (
                        <TableRow key={pair.id}>
                          <TableCell>
                            <TextField
                              value={pair.key}
                              onChange={(event) =>
                                updateSelected((source) => ({
                                  ...source,
                                  parserEntries: source.parserEntries.map((item, index) =>
                                    index === idx ? { ...item, key: event.target.value } : item,
                                  ),
                                }))
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <TextField
                              value={pair.value}
                              onChange={(event) =>
                                updateSelected((source) => ({
                                  ...source,
                                  parserEntries: source.parserEntries.map((item, index) =>
                                    index === idx ? { ...item, value: event.target.value } : item,
                                  ),
                                }))
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <IconButton
                              onClick={() =>
                                updateSelected((source) => ({
                                  ...source,
                                  parserEntries: source.parserEntries.filter((_, index) => index !== idx),
                                }))
                              }
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card sx={{ borderRadius: 3, border: "1px solid rgba(148,163,184,0.24)", background: "linear-gradient(180deg, rgba(15,23,42,0.88), rgba(15,23,42,0.72))" }}>
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                    <Typography sx={{ color: "#e2e8f0", fontWeight: 700 }}>Catalogo tipi allarme</Typography>
                    <Button size="small" startIcon={<AddIcon />} onClick={addAlertRule}>Aggiungi regola</Button>
                  </Stack>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ color: "#94a3b8" }}>Nome allarme</TableCell>
                        <TableCell sx={{ color: "#94a3b8" }}>Severity</TableCell>
                        <TableCell sx={{ color: "#94a3b8" }}>Match</TableCell>
                        <TableCell sx={{ color: "#94a3b8" }}>Note</TableCell>
                        <TableCell sx={{ color: "#94a3b8" }}>Attiva</TableCell>
                        <TableCell sx={{ color: "#94a3b8" }}>Count</TableCell>
                        <TableCell sx={{ color: "#94a3b8" }}>Ultimo evento</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {selectedSource.alertTypeRules.map((rule, idx) => (
                        <TableRow key={rule.id}>
                          <TableCell>
                            <TextField
                              value={rule.alertName}
                              onChange={(event) =>
                                updateSelected((source) => ({
                                  ...source,
                                  alertTypeRules: source.alertTypeRules.map((item, index) =>
                                    index === idx ? { ...item, alertName: event.target.value } : item,
                                  ),
                                }))
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <TextField
                              select
                              value={rule.severity}
                              onChange={(event) =>
                                updateSelected((source) => ({
                                  ...source,
                                  alertTypeRules: source.alertTypeRules.map((item, index) =>
                                    index === idx ? { ...item, severity: event.target.value as (typeof severityOptions)[number] } : item,
                                  ),
                                }))
                              }
                            >
                              {severityOptions.map((severity) => (
                                <MenuItem key={severity} value={severity}>{severity}</MenuItem>
                              ))}
                            </TextField>
                          </TableCell>
                          <TableCell>
                            <TextField
                              select
                              value={rule.matchMode}
                              onChange={(event) =>
                                updateSelected((source) => ({
                                  ...source,
                                  alertTypeRules: source.alertTypeRules.map((item, index) =>
                                    index === idx ? { ...item, matchMode: event.target.value as MatchMode } : item,
                                  ),
                                }))
                              }
                            >
                              {["exact", "contains", "regex"].map((mode) => (
                                <MenuItem key={mode} value={mode}>{mode}</MenuItem>
                              ))}
                            </TextField>
                          </TableCell>
                          <TableCell>
                            <TextField
                              value={rule.notes}
                              onChange={(event) =>
                                updateSelected((source) => ({
                                  ...source,
                                  alertTypeRules: source.alertTypeRules.map((item, index) =>
                                    index === idx ? { ...item, notes: event.target.value } : item,
                                  ),
                                }))
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={rule.enabled}
                              onChange={(event) =>
                                updateSelected((source) => ({
                                  ...source,
                                  alertTypeRules: source.alertTypeRules.map((item, index) =>
                                    index === idx ? { ...item, enabled: event.target.checked } : item,
                                  ),
                                }))
                              }
                            />
                          </TableCell>
                          <TableCell sx={{ color: "#cbd5e1" }}>{rule.receivedCount}</TableCell>
                          <TableCell sx={{ color: "#94a3b8" }}>{rule.lastSeenAt ?? "-"}</TableCell>
                          <TableCell>
                            <IconButton
                              onClick={() =>
                                updateSelected((source) => ({
                                  ...source,
                                  alertTypeRules: source.alertTypeRules.filter((_, index) => index !== idx),
                                }))
                              }
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </Stack>
          )}
        </Grid>
      </Grid>
    </Stack>
  );
}
