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
import PreviewIcon from "@mui/icons-material/Preview";
import RestoreIcon from "@mui/icons-material/Restore";
import SaveIcon from "@mui/icons-material/Save";
import SyncIcon from "@mui/icons-material/Sync";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "../context/AuthContext";
import { fetchSources } from "../services/ingestionApi";
import {
  createParser,
  fetchParsers,
  previewParser,
  previewParserConfig,
  rollbackParser,
  updateParser,
} from "../services/parserApi";
import { canManageSources } from "../services/roleUtils";
import { Source } from "../types/ingestion";
import { ParserDefinition, ParserPreviewResponse } from "../types/parser";

const defaultParserTemplate = `{
  "extract": [
    { "type": "jsonpath", "name": "event_id", "path": "$.event_id" },
    { "type": "jsonpath", "name": "severity", "path": "$.severity" },
    { "type": "jsonpath", "name": "message", "path": "$.message" }
  ],
  "transform": [
    { "type": "concat", "target": "summary", "fields": ["event_id", "message"], "separator": " -> " }
  ],
  "normalize": {
    "ecs": {
      "event.id": "event_id",
      "event.severity": "severity",
      "event.original": "message",
      "event.summary": "summary"
    }
  },
  "output": { "mode": "normalized" }
}`;

const defaultRawPreview = `{
  "event_id": "preview-1",
  "severity": "high",
  "message": "user=alice ip=192.168.1.15"
}`;

function parseJsonInput(value: string): Record<string, unknown> {
  const payload = JSON.parse(value);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Il raw payload deve essere un oggetto JSON");
  }
  return payload as Record<string, unknown>;
}

export default function ParserPage() {
  const { user } = useAuth();
  const canManage = canManageSources(user?.role);

  const [sources, setSources] = useState<Source[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<number | "">("");
  const [parserDefinition, setParserDefinition] = useState<ParserDefinition | null>(null);

  const [parserName, setParserName] = useState("");
  const [description, setDescription] = useState("");
  const [isEnabled, setIsEnabled] = useState(true);
  const [configText, setConfigText] = useState(defaultParserTemplate);
  const [rawPreviewText, setRawPreviewText] = useState(defaultRawPreview);

  const [previewResult, setPreviewResult] = useState<ParserPreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedSourceId) ?? null,
    [sources, selectedSourceId],
  );

  const hydrateFromParser = (parser: ParserDefinition | null, sourceName: string) => {
    if (!parser) {
      setParserDefinition(null);
      setParserName(sourceName ? `${sourceName} Parser` : "Parser tenant");
      setDescription("Parser configurabile per normalizzazione eventi");
      setIsEnabled(true);
      setConfigText(defaultParserTemplate);
      return;
    }

    setParserDefinition(parser);
    setParserName(parser.name);
    setDescription(parser.description);
    setIsEnabled(parser.is_enabled);
    setConfigText(parser.active_config_text || defaultParserTemplate);
  };

  const loadSources = async () => {
    const sourceList = await fetchSources();
    setSources(sourceList);
    if (!sourceList.length) {
      setSelectedSourceId("");
      return sourceList;
    }
    setSelectedSourceId((current) => (current === "" ? sourceList[0].id : current));
    return sourceList;
  };

  const loadParserForSource = async (sourceId: number, sourceName: string) => {
    const parserList = await fetchParsers(sourceId);
    const parser = parserList[0] ?? null;
    hydrateFromParser(parser, sourceName);
  };

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const sourceList = await loadSources();
      const chosenId = selectedSourceId === "" && sourceList.length ? sourceList[0].id : selectedSourceId;
      if (typeof chosenId === "number") {
        const chosenSource = sourceList.find((source) => source.id === chosenId);
        if (chosenSource) {
          await loadParserForSource(chosenId, chosenSource.name);
        }
      }
    } catch {
      setError("Errore nel caricamento sorgenti/parser.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSourceChange = async (sourceId: number) => {
    setSelectedSourceId(sourceId);
    setPreviewResult(null);
    setPreviewError(null);
    setError(null);
    setSuccess(null);
    const source = sources.find((item) => item.id === sourceId);
    if (!source) {
      return;
    }
    try {
      await loadParserForSource(sourceId, source.name);
    } catch {
      setError("Errore caricando parser per la sorgente selezionata.");
    }
  };

  const withBusy = async (task: () => Promise<void>, successMessage: string) => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await task();
      setSuccess(successMessage);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Operazione fallita";
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const runPreview = async () => {
    const rawPayload = parseJsonInput(rawPreviewText);
    setPreviewError(null);
    if (parserDefinition) {
      const result = await previewParser(parserDefinition.id, rawPayload, configText);
      setPreviewResult(result);
      return;
    }
    const result = await previewParserConfig(configText, rawPayload);
    setPreviewResult(result);
  };

  const saveParser = async () => {
    if (selectedSourceId === "") {
      throw new Error("Seleziona una sorgente");
    }

    if (parserDefinition) {
      const updated = await updateParser(parserDefinition.id, {
        name: parserName,
        description,
        is_enabled: isEnabled,
        config_text: configText,
      });
      setParserDefinition(updated);
      return;
    }

    const created = await createParser({
      source: selectedSourceId,
      name: parserName,
      description,
      is_enabled: isEnabled,
      config_text: configText,
    });
    setParserDefinition(created);
  };

  const handlePreview = async () => {
    await withBusy(async () => {
      try {
        await runPreview();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Errore anteprima parser";
        setPreviewResult(null);
        setPreviewError(message);
        throw new Error(message);
      }
    }, "Anteprima parser eseguita");
  };

  const handleSave = async () => {
    await withBusy(async () => {
      await saveParser();
    }, "Parser salvato");
    if (typeof selectedSourceId === "number") {
      const sourceName = selectedSource?.name ?? "";
      await loadParserForSource(selectedSourceId, sourceName);
    }
  };

  const handleRollback = async (revisionId: number) => {
    if (!parserDefinition) {
      return;
    }
    await withBusy(async () => {
      const updated = await rollbackParser(parserDefinition.id, revisionId);
      setParserDefinition(updated);
      setConfigText(updated.active_config_text || defaultParserTemplate);
    }, "Rollback parser completato");
  };

  if (loading) {
    return <LinearProgress />;
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5">Parser Pipeline</Typography>
      {!canManage ? (
        <Alert severity="warning">Solo SOC Manager o SuperAdmin possono modificare i parser.</Alert>
      ) : null}
      {error ? <Alert severity="error">{error}</Alert> : null}
      {success ? <Alert severity="success">{success}</Alert> : null}
      {previewError ? <Alert severity="error">{previewError}</Alert> : null}

      <Card>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <TextField
                select
                fullWidth
                label="Sorgente"
                value={selectedSourceId}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  void handleSourceChange(value);
                }}
                disabled={busy}
              >
                {sources.map((source) => (
                  <MenuItem key={source.id} value={source.id}>
                    {source.name} ({source.type})
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={5}>
              <TextField
                fullWidth
                label="Nome parser"
                value={parserName}
                onChange={(event) => setParserName(event.target.value)}
                disabled={!canManage || busy}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                select
                fullWidth
                label="Enabled"
                value={isEnabled ? "yes" : "no"}
                onChange={(event) => setIsEnabled(event.target.value === "yes")}
                disabled={!canManage || busy}
              >
                <MenuItem value="yes">Si</MenuItem>
                <MenuItem value="no">No</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Descrizione"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={!canManage || busy}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                minRows={12}
                label="Config parser (JSON/YAML)"
                value={configText}
                onChange={(event) => setConfigText(event.target.value)}
                disabled={!canManage || busy}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                minRows={6}
                label="Raw payload preview (JSON)"
                value={rawPreviewText}
                onChange={(event) => setRawPreviewText(event.target.value)}
                disabled={!canManage || busy}
              />
            </Grid>
          </Grid>

          <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: "wrap" }}>
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              disabled={!canManage || busy || selectedSourceId === "" || !parserName.trim()}
              onClick={() => {
                void handleSave();
              }}
            >
              Salva parser
            </Button>
            <Button
              variant="outlined"
              startIcon={<PreviewIcon />}
              disabled={!canManage || busy || selectedSourceId === ""}
              onClick={() => {
                void handlePreview();
              }}
            >
              Valida e preview
            </Button>
            <Button
              variant="text"
              startIcon={<SyncIcon />}
              disabled={busy}
              onClick={() => {
                void reload();
              }}
            >
              Ricarica
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6">Preview Output</Typography>
              <Box component="pre" sx={{ mt: 1, p: 1, bgcolor: "#f8f9fa", overflowX: "auto" }}>
                {JSON.stringify(previewResult?.parsed_payload ?? {}, null, 2)}
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6">Field Schema</Typography>
              <Box component="pre" sx={{ mt: 1, p: 1, bgcolor: "#f8f9fa", overflowX: "auto" }}>
                {JSON.stringify(previewResult?.field_schema ?? [], null, 2)}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Revisioni parser
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>Versione</TableCell>
                <TableCell>Creato da</TableCell>
                <TableCell>Rollback from</TableCell>
                <TableCell>Data</TableCell>
                <TableCell>Stato</TableCell>
                <TableCell>Azione</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(parserDefinition?.revisions ?? []).map((revision) => {
                const isActive = parserDefinition?.active_revision === revision.id;
                return (
                  <TableRow key={revision.id}>
                    <TableCell>{revision.id}</TableCell>
                    <TableCell>v{revision.version}</TableCell>
                    <TableCell>{revision.created_by_username ?? "-"}</TableCell>
                    <TableCell>{revision.rollback_from_version ? `v${revision.rollback_from_version}` : "-"}</TableCell>
                    <TableCell>{new Date(revision.created_at).toLocaleString("it-IT")}</TableCell>
                    <TableCell>
                      {isActive ? <Chip size="small" color="success" label="attiva" /> : <Chip size="small" label="storica" />}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="small"
                        startIcon={<RestoreIcon />}
                        disabled={!canManage || busy || isActive}
                        onClick={() => {
                          void handleRollback(revision.id);
                        }}
                      >
                        Rollback
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {!parserDefinition ? <Typography color="text.secondary">Nessun parser associato alla sorgente selezionata.</Typography> : null}
        </CardContent>
      </Card>
    </Stack>
  );
}
