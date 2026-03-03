import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useMemo, useState } from "react";

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

export default function SourcesPage() {
  const [sources, setSources] = useState<GlobalSourceDefinition[]>(() => loadGlobalSourcesConfig());
  const [selectedSourceId, setSelectedSourceId] = useState<number | null>(() => (sources.length ? sources[0].id : null));
  const [message, setMessage] = useState<string | null>(null);

  const selectedSource = useMemo(
    () => sources.find((item) => item.id === selectedSourceId) ?? null,
    [sources, selectedSourceId],
  );

  const persist = (next: GlobalSourceDefinition[], okMessage: string) => {
    setSources(next);
    saveGlobalSourcesConfig(next);
    setMessage(okMessage);
  };

  const updateSelected = (updater: (source: GlobalSourceDefinition) => GlobalSourceDefinition) => {
    if (!selectedSource) {
      return;
    }
    const next = sources.map((item) => (item.id === selectedSource.id ? updater(item) : item));
    persist(next, "Configurazione fonte aggiornata.");
  };

  const addSource = () => {
    const nextSource = createNewSource(sources);
    const next = [...sources, nextSource];
    persist(next, "Nuova fonte creata.");
    setSelectedSourceId(nextSource.id);
  };

  const deleteSource = () => {
    if (!selectedSource) {
      return;
    }
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

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }} spacing={1.5}>
        <Box>
          <Typography sx={{ color: "#f8fafc", fontSize: { xs: 26, md: 34 }, fontWeight: 700 }}>Sources</Typography>
          <Typography sx={{ color: "#64748b" }}>
            Catalogo globale fonti e parser, con censimento tipi allarme e severity per nome allarme.
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
                      p: 1,
                      borderRadius: 1.5,
                      border: source.id === selectedSourceId ? "1px solid rgba(96,165,250,0.7)" : "1px solid rgba(71,85,105,0.4)",
                      bgcolor: source.id === selectedSourceId ? "rgba(30,64,175,0.2)" : "rgba(15,23,42,0.55)",
                      cursor: "pointer",
                    }}
                  >
                    <Typography sx={{ color: "#e2e8f0", fontWeight: 600 }}>{source.name}</Typography>
                    <Stack direction="row" spacing={0.8} sx={{ mt: 0.7 }} useFlexGap flexWrap="wrap">
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
          {!selectedSource ? (
            <Alert severity="info">Seleziona o crea una fonte per configurare metodi, parser e catalogo allarmi.</Alert>
          ) : (
            <Stack spacing={2}>
              <Card sx={{ borderRadius: 3, border: "1px solid rgba(148,163,184,0.24)", background: "linear-gradient(180deg, rgba(15,23,42,0.88), rgba(15,23,42,0.72))" }}>
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                    <Typography sx={{ color: "#e2e8f0", fontWeight: 700 }}>Configurazione Fonte</Typography>
                    <Button color="error" startIcon={<DeleteIcon />} onClick={deleteSource}>Elimina</Button>
                  </Stack>

                  <Grid container spacing={1.5}>
                    <Grid item xs={12} md={5}>
                      <TextField
                        fullWidth
                        label="Nome fonte"
                        value={selectedSource.name}
                        onChange={(event) => updateSelected((source) => ({ ...source, name: event.target.value }))}
                      />
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <TextField
                        select
                        fullWidth
                        label="Metodo acquisizione"
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
                    <Grid item xs={12} md={3}>
                      <TextField
                        select
                        fullWidth
                        label="Enabled"
                        value={selectedSource.enabled ? "yes" : "no"}
                        onChange={(event) => updateSelected((source) => ({ ...source, enabled: event.target.value === "yes" }))}
                      >
                        <MenuItem value="yes">Si</MenuItem>
                        <MenuItem value="no">No</MenuItem>
                      </TextField>
                    </Grid>

                    <Grid item xs={12} md={8}>
                      <TextField
                        fullWidth
                        label="Endpoint / Connessione"
                        value={selectedSource.endpoint}
                        onChange={(event) => updateSelected((source) => ({ ...source, endpoint: event.target.value }))}
                      />
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
                      <TextField
                        type="number"
                        fullWidth
                        label="Pull interval (sec)"
                        inputProps={{ min: 10 }}
                        value={selectedSource.pullIntervalSeconds}
                        onChange={(event) =>
                          updateSelected((source) => ({
                            ...source,
                            pullIntervalSeconds: Math.max(10, Number(event.target.value) || 10),
                          }))
                        }
                      />
                    </Grid>
                    <Grid item xs={12} md={8}>
                      <TextField
                        fullWidth
                        label="Descrizione"
                        value={selectedSource.description}
                        onChange={(event) => updateSelected((source) => ({ ...source, description: event.target.value }))}
                      />
                    </Grid>

                    <Grid item xs={12}>
                      <Typography sx={{ color: "#94a3b8", fontSize: 12 }}>
                        Metodo selezionato: {ingestionMethodOptions.find((item) => item.value === selectedSource.method)?.description}
                      </Typography>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>

              <Card sx={{ borderRadius: 3, border: "1px solid rgba(148,163,184,0.24)", background: "linear-gradient(180deg, rgba(15,23,42,0.88), rgba(15,23,42,0.72))" }}>
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.2 }}>
                    <Typography sx={{ color: "#e2e8f0", fontWeight: 700 }}>Parser (key : value)</Typography>
                    <Button size="small" startIcon={<AddIcon />} onClick={addParserPair}>Aggiungi coppia</Button>
                  </Stack>

                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ color: "#94a3b8" }}>Chiave in ingresso</TableCell>
                        <TableCell sx={{ color: "#94a3b8" }}>Campo normalizzato</TableCell>
                        <TableCell sx={{ width: 50 }} />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {selectedSource.parserEntries.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell>
                            <TextField
                              size="small"
                              fullWidth
                              value={entry.key}
                              onChange={(event) =>
                                updateSelected((source) => ({
                                  ...source,
                                  parserEntries: source.parserEntries.map((item) =>
                                    item.id === entry.id ? { ...item, key: event.target.value } : item,
                                  ),
                                }))
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <TextField
                              size="small"
                              fullWidth
                              value={entry.value}
                              onChange={(event) =>
                                updateSelected((source) => ({
                                  ...source,
                                  parserEntries: source.parserEntries.map((item) =>
                                    item.id === entry.id ? { ...item, value: event.target.value } : item,
                                  ),
                                }))
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <IconButton
                              color="error"
                              onClick={() =>
                                updateSelected((source) => ({
                                  ...source,
                                  parserEntries: source.parserEntries.filter((item) => item.id !== entry.id),
                                }))
                              }
                            >
                              <DeleteIcon />
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
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.2 }}>
                    <Typography sx={{ color: "#e2e8f0", fontWeight: 700 }}>
                      Catalogo Tipi Allarme (aggregati per nome)
                    </Typography>
                    <Button size="small" startIcon={<AddIcon />} onClick={addAlertRule}>Censisci tipo allarme</Button>
                  </Stack>

                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ color: "#94a3b8" }}>Nome allarme</TableCell>
                        <TableCell sx={{ color: "#94a3b8" }}>Severity</TableCell>
                        <TableCell sx={{ color: "#94a3b8" }}>Match</TableCell>
                        <TableCell sx={{ color: "#94a3b8" }}>Enabled</TableCell>
                        <TableCell sx={{ color: "#94a3b8" }}>Ricevuti</TableCell>
                        <TableCell sx={{ color: "#94a3b8" }}>Last Seen</TableCell>
                        <TableCell sx={{ width: 50 }} />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {selectedSource.alertTypeRules.map((rule) => (
                        <TableRow key={rule.id}>
                          <TableCell>
                            <TextField
                              size="small"
                              fullWidth
                              value={rule.alertName}
                              onChange={(event) =>
                                updateSelected((source) => ({
                                  ...source,
                                  alertTypeRules: source.alertTypeRules.map((item) =>
                                    item.id === rule.id ? { ...item, alertName: event.target.value } : item,
                                  ),
                                }))
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <TextField
                              select
                              size="small"
                              value={rule.severity}
                              onChange={(event) =>
                                updateSelected((source) => ({
                                  ...source,
                                  alertTypeRules: source.alertTypeRules.map((item) =>
                                    item.id === rule.id ? { ...item, severity: event.target.value as (typeof severityOptions)[number] } : item,
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
                              size="small"
                              value={rule.matchMode}
                              onChange={(event) =>
                                updateSelected((source) => ({
                                  ...source,
                                  alertTypeRules: source.alertTypeRules.map((item) =>
                                    item.id === rule.id ? { ...item, matchMode: event.target.value as MatchMode } : item,
                                  ),
                                }))
                              }
                            >
                              <MenuItem value="exact">exact</MenuItem>
                              <MenuItem value="contains">contains</MenuItem>
                            </TextField>
                          </TableCell>
                          <TableCell>
                            <TextField
                              select
                              size="small"
                              value={rule.enabled ? "yes" : "no"}
                              onChange={(event) =>
                                updateSelected((source) => ({
                                  ...source,
                                  alertTypeRules: source.alertTypeRules.map((item) =>
                                    item.id === rule.id ? { ...item, enabled: event.target.value === "yes" } : item,
                                  ),
                                }))
                              }
                            >
                              <MenuItem value="yes">Si</MenuItem>
                              <MenuItem value="no">No</MenuItem>
                            </TextField>
                          </TableCell>
                          <TableCell sx={{ color: "#e2e8f0" }}>{rule.receivedCount}</TableCell>
                          <TableCell sx={{ color: "#94a3b8" }}>
                            {rule.lastSeenAt ? new Date(rule.lastSeenAt).toLocaleString("it-IT") : "-"}
                          </TableCell>
                          <TableCell>
                            <IconButton
                              color="error"
                              onClick={() =>
                                updateSelected((source) => ({
                                  ...source,
                                  alertTypeRules: source.alertTypeRules.filter((item) => item.id !== rule.id),
                                }))
                              }
                            >
                              <DeleteIcon />
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
