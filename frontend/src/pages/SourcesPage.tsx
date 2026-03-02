import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  LinearProgress,
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
import DeleteIcon from "@mui/icons-material/Delete";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import SyncIcon from "@mui/icons-material/Sync";
import WifiTetheringIcon from "@mui/icons-material/WifiTethering";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "../context/AuthContext";
import {
  createSource,
  deleteSource,
  fetchIngestionRuns,
  fetchSources,
  runSourceNow,
  testSourceConnection,
  updateSource,
} from "../services/ingestionApi";
import { canManageSources } from "../services/roleUtils";
import { IngestionRun, Source, SourceType, SourceWritePayload } from "../types/ingestion";

const sourceTypes: SourceType[] = ["imap", "rest", "webhook"];

function parseJsonOrThrow(value: string): Record<string, unknown> {
  const trimmed = value.trim();
  if (!trimmed) {
    return {};
  }
  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON non valido: deve essere un oggetto");
  }
  return parsed as Record<string, unknown>;
}

export default function SourcesPage() {
  const { user } = useAuth();
  const canManage = canManageSources(user?.role);

  const [sources, setSources] = useState<Source[]>([]);
  const [runs, setRuns] = useState<IngestionRun[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState<SourceType>("imap");
  const [enabled, setEnabled] = useState(true);
  const [pollInterval, setPollInterval] = useState(60);
  const [rateLimit, setRateLimit] = useState(60);
  const [severityMapText, setSeverityMapText] = useState('{"field":"severity","default":"medium","map":{}}');
  const [configText, setConfigText] = useState("{}");
  const [dedupFieldsText, setDedupFieldsText] = useState("event_id");

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedSourceId) ?? null,
    [sources, selectedSourceId],
  );

  const sourceRuns = useMemo(() => {
    if (!selectedSourceId) {
      return runs;
    }
    return runs.filter((run) => run.source === selectedSourceId);
  }, [runs, selectedSourceId]);

  const resetForm = () => {
    setSelectedSourceId(null);
    setName("");
    setType("imap");
    setEnabled(true);
    setPollInterval(60);
    setRateLimit(60);
    setSeverityMapText('{"field":"severity","default":"medium","map":{}}');
    setConfigText("{}");
    setDedupFieldsText("event_id");
  };

  const hydrateForm = (source: Source) => {
    setSelectedSourceId(source.id);
    setName(source.name);
    setType(source.type);
    setEnabled(source.is_enabled);
    setPollInterval(source.config.poll_interval_seconds);
    setRateLimit(source.config.rate_limit_per_minute);
    setSeverityMapText(JSON.stringify(source.severity_map ?? {}, null, 2));
    setConfigText(JSON.stringify(source.config.config_json ?? {}, null, 2));
    setDedupFieldsText((source.dedup_policy.fingerprint_fields ?? []).join(","));
  };

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sourcesResp, runsResp] = await Promise.all([fetchSources(), fetchIngestionRuns()]);
      setSources(sourcesResp);
      setRuns(runsResp);
      if (!selectedSourceId && sourcesResp.length > 0) {
        hydrateForm(sourcesResp[0]);
      }
    } catch {
      setError("Errore caricando fonti e log ingestion.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const withBusy = async (task: () => Promise<void>, okMessage: string) => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await task();
      await reload();
      setSuccess(okMessage);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Operazione fallita";
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const saveSource = async () => {
    const severityMap = parseJsonOrThrow(severityMapText);
    const configJson = parseJsonOrThrow(configText);
    const dedupFields = dedupFieldsText
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    const payload: SourceWritePayload = {
      name,
      type,
      is_enabled: enabled,
      severity_map: severityMap,
      config: {
        config_json: configJson,
        poll_interval_seconds: pollInterval,
        rate_limit_per_minute: rateLimit,
        secrets_ref: "",
      },
      dedup_policy: {
        fingerprint_fields: dedupFields,
        strategy: "increment_occurrence",
      },
    };

    if (selectedSourceId) {
      await updateSource(selectedSourceId, payload);
    } else {
      await createSource(payload);
    }
  };

  const webhookCurl = useMemo(() => {
    if (!selectedSource || selectedSource.type !== "webhook") {
      return "";
    }
    const endpoint = selectedSource.webhook_endpoint ?? `/api/ingestion/webhook/${selectedSource.id}/`;
    const host = endpoint.startsWith("http") ? endpoint : `http://tenant1.localhost${endpoint}`;
    return `curl -X POST '${host}' \\
  -H 'X-API-Key: ${selectedSource.config.webhook_api_key}' \\
  -H 'Content-Type: application/json' \\
  -d '{"event_id":"wh-demo-1","title":"Webhook test","severity":"high","message":"Demo webhook"}'`;
  }, [selectedSource]);

  if (loading) {
    return <LinearProgress />;
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5">Fonti Ingestion</Typography>
      {!canManage ? (
        <Alert severity="warning">Solo SOC Manager o SuperAdmin possono modificare le fonti.</Alert>
      ) : null}
      {error ? <Alert severity="error">{error}</Alert> : null}
      {success ? <Alert severity="success">{success}</Alert> : null}

      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="h6">Elenco Fonti</Typography>
                <Button size="small" onClick={resetForm} disabled={!canManage || busy}>
                  Nuova
                </Button>
              </Stack>

              <Stack spacing={1}>
                {sources.map((source) => (
                  <Box
                    key={source.id}
                    sx={{
                      border: source.id === selectedSourceId ? "2px solid #0b7285" : "1px solid #dee2e6",
                      borderRadius: 1,
                      p: 1,
                      cursor: "pointer",
                    }}
                    onClick={() => hydrateForm(source)}
                  >
                    <Typography variant="subtitle2">{source.name}</Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                      <Chip size="small" label={source.type.toUpperCase()} />
                      <Chip
                        size="small"
                        label={source.is_enabled ? "enabled" : "disabled"}
                        color={source.is_enabled ? "success" : "default"}
                      />
                      <Chip size="small" label={source.config.status} color="info" />
                      {source.parser_definition_id ? (
                        <Chip size="small" label={`parser: ${source.parser_definition_name ?? source.parser_definition_id}`} color="secondary" />
                      ) : (
                        <Chip size="small" label="parser: none" variant="outlined" />
                      )}
                    </Stack>
                  </Box>
                ))}
                {sources.length === 0 ? (
                  <Typography color="text.secondary">Nessuna fonte configurata.</Typography>
                ) : null}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                {selectedSourceId ? "Modifica Fonte" : "Nuova Fonte"}
              </Typography>

              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Nome"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    disabled={!canManage || busy}
                  />
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField
                    select
                    fullWidth
                    label="Tipo"
                    value={type}
                    onChange={(event) => setType(event.target.value as SourceType)}
                    disabled={!canManage || busy || !!selectedSourceId}
                  >
                    {sourceTypes.map((sourceType) => (
                      <MenuItem key={sourceType} value={sourceType}>
                        {sourceType.toUpperCase()}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField
                    select
                    fullWidth
                    label="Enabled"
                    value={enabled ? "yes" : "no"}
                    onChange={(event) => setEnabled(event.target.value === "yes")}
                    disabled={!canManage || busy}
                  >
                    <MenuItem value="yes">Si</MenuItem>
                    <MenuItem value="no">No</MenuItem>
                  </TextField>
                </Grid>

                <Grid item xs={12} md={4}>
                  <TextField
                    type="number"
                    fullWidth
                    label="Polling (sec)"
                    value={pollInterval}
                    onChange={(event) => setPollInterval(Number(event.target.value) || 60)}
                    disabled={!canManage || busy || type === "webhook"}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    type="number"
                    fullWidth
                    label="Rate limit/min"
                    value={rateLimit}
                    onChange={(event) => setRateLimit(Number(event.target.value) || 60)}
                    disabled={!canManage || busy}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Dedup fields (csv)"
                    value={dedupFieldsText}
                    onChange={(event) => setDedupFieldsText(event.target.value)}
                    disabled={!canManage || busy}
                  />
                </Grid>

                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    multiline
                    minRows={4}
                    label="Severity map JSON"
                    value={severityMapText}
                    onChange={(event) => setSeverityMapText(event.target.value)}
                    disabled={!canManage || busy}
                  />
                </Grid>

                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    multiline
                    minRows={6}
                    label="Config JSON"
                    value={configText}
                    onChange={(event) => setConfigText(event.target.value)}
                    disabled={!canManage || busy}
                  />
                </Grid>
              </Grid>

              <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: "wrap" }}>
                <Button
                  variant="contained"
                  disabled={!canManage || busy || !name.trim()}
                  onClick={() => withBusy(saveSource, selectedSourceId ? "Fonte aggiornata" : "Fonte creata")}
                >
                  Salva
                </Button>

                {selectedSourceId ? (
                  <Button
                    variant="outlined"
                    startIcon={<WifiTetheringIcon />}
                    disabled={!canManage || busy}
                    onClick={() =>
                      withBusy(
                        async () => {
                          const result = await testSourceConnection(selectedSourceId);
                          if (!result.ok) {
                            throw new Error(result.detail);
                          }
                        },
                        "Test connessione riuscito",
                      )
                    }
                  >
                    Test connessione
                  </Button>
                ) : null}

                {selectedSourceId ? (
                  <Button
                    variant="outlined"
                    startIcon={<PlayArrowIcon />}
                    disabled={!canManage || busy || type === "webhook"}
                    onClick={() =>
                      withBusy(
                        async () => {
                          await runSourceNow(selectedSourceId);
                        },
                        "Ingestion avviata",
                      )
                    }
                  >
                    Esegui adesso
                  </Button>
                ) : null}

                {selectedSourceId ? (
                  <Button
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteIcon />}
                    disabled={!canManage || busy}
                    onClick={() =>
                      withBusy(
                        async () => {
                          await deleteSource(selectedSourceId);
                          resetForm();
                        },
                        "Fonte eliminata",
                      )
                    }
                  >
                    Elimina
                  </Button>
                ) : null}

                <Button
                  variant="text"
                  startIcon={<SyncIcon />}
                  disabled={busy}
                  onClick={() => {
                    void reload();
                  }}
                >
                  Aggiorna
                </Button>
              </Stack>

              {selectedSource?.type === "webhook" ? (
                <Box sx={{ mt: 3 }}>
                  <Typography variant="subtitle1">Webhook</Typography>
                  <Typography variant="body2">Endpoint: {selectedSource.webhook_endpoint}</Typography>
                  <Typography variant="body2">API key: {selectedSource.config.webhook_api_key}</Typography>
                  <Box component="pre" sx={{ bgcolor: "#f8f9fa", p: 1, mt: 1, overflowX: "auto" }}>
                    {webhookCurl}
                  </Box>
                </Box>
              ) : null}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Log Ingestion
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>Source</TableCell>
                <TableCell>Trigger</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Processed</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Updated</TableCell>
                <TableCell>Errors</TableCell>
                <TableCell>Start</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sourceRuns.slice(0, 25).map((run) => {
                const source = sources.find((item) => item.id === run.source);
                return (
                  <TableRow key={run.id}>
                    <TableCell>{run.id}</TableCell>
                    <TableCell>{source?.name ?? run.source}</TableCell>
                    <TableCell>{run.trigger}</TableCell>
                    <TableCell>
                      <Chip size="small" label={run.status} color={run.status === "error" ? "error" : "info"} />
                    </TableCell>
                    <TableCell>{run.processed_count}</TableCell>
                    <TableCell>{run.created_count}</TableCell>
                    <TableCell>{run.updated_count}</TableCell>
                    <TableCell>{run.error_count}</TableCell>
                    <TableCell>{new Date(run.started_at).toLocaleString("it-IT")}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {sourceRuns.length === 0 ? <Typography color="text.secondary">Nessun log ingestion.</Typography> : null}
        </CardContent>
      </Card>
    </Stack>
  );
}
