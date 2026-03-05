import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControl,
  Grid,
  InputLabel,
  LinearProgress,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  createSavedSearch,
  deleteSavedSearch,
  exportAlertsConfigurable,
  fetchAlertStates,
  fetchSavedSearches,
  fetchSourceFieldSchemas,
  searchAlerts,
  updateSavedSearch,
} from "../services/alertsApi";
import {
  Alert as AlertModel,
  AlertState as AlertStateModel,
  DynamicFilter,
  SavedSearch,
  SearchRequest,
  SourceFieldSchema,
} from "../types/alerts";

const severityOptions = ["", "low", "medium", "high", "critical"] as const;
const orderingOptions = [
  { value: "-event_timestamp", label: "Evento (piu recente)" },
  { value: "event_timestamp", label: "Evento (piu vecchio)" },
  { value: "-created_at", label: "Creato (piu recente)" },
  { value: "severity", label: "Severita" },
  { value: "title", label: "Titolo" },
];
const columnOptions = [
  { value: "title", label: "Titolo" },
  { value: "severity", label: "Severita" },
  { value: "state", label: "Stato" },
  { value: "is_active", label: "Attivo" },
  { value: "assignment", label: "Assegnato" },
  { value: "tags", label: "Tag" },
  { value: "source_name", label: "Fonte" },
  { value: "event_timestamp", label: "Evento" },
  { value: "backend", label: "Backend" },
];

const defaultColumns = ["title", "severity", "state", "is_active", "assignment", "tags", "event_timestamp"];
const defaultExportColumns = ["id", "title", "severity", "state", "source_name", "event_timestamp"];
const exportStandardColumnOptions = [
  { value: "id", label: "ID" },
  { value: "title", label: "Titolo" },
  { value: "severity", label: "Severita" },
  { value: "state", label: "Stato" },
  { value: "is_active", label: "Attivo" },
  { value: "source_name", label: "Fonte" },
  { value: "source_id", label: "Source ID" },
  { value: "event_timestamp", label: "Timestamp evento" },
  { value: "created_at", label: "Creato il" },
  { value: "updated_at", label: "Aggiornato il" },
  { value: "assignment", label: "Assegnato a" },
  { value: "tags", label: "Tag" },
  { value: "occurrence_count", label: "Occorrenze" },
  { value: "dedup_fingerprint", label: "Dedup fingerprint" },
  { value: "parse_error_detail", label: "Errore parsing" },
];

function isEmptyFilterValue(value: string) {
  return value.trim() === "";
}

export default function TenantPage() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<AlertModel[]>([]);
  const [states, setStates] = useState<AlertStateModel[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [schemaMap, setSchemaMap] = useState<Record<string, SourceFieldSchema["fields"]>>({});

  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [textFilter, setTextFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [isActiveFilter, setIsActiveFilter] = useState<"all" | "true" | "false">("all");
  const [ordering, setOrdering] = useState("-event_timestamp");
  const [visibleColumns, setVisibleColumns] = useState<string[]>(defaultColumns);
  const [exportColumns, setExportColumns] = useState<string[]>(defaultExportColumns);
  const [backendLabel, setBackendLabel] = useState("-");
  const [exporting, setExporting] = useState(false);

  const [dynamicValues, setDynamicValues] = useState<Record<string, string>>({});

  const [selectedSavedSearch, setSelectedSavedSearch] = useState<number | "">("");
  const [savedSearchName, setSavedSearchName] = useState("");

  const sourceOptions = useMemo(() => Object.keys(schemaMap).sort((a, b) => a.localeCompare(b)), [schemaMap]);
  const selectedSourceFields = useMemo(() => schemaMap[sourceFilter] ?? [], [schemaMap, sourceFilter]);
  const exportColumnOptions = useMemo(() => {
    const dynamicOptions = selectedSourceFields.map((item) => ({
      value: `dyn:${item.field}`,
      label: `Dinamico: ${item.field} (${item.type})`,
    }));
    return [...exportStandardColumnOptions, ...dynamicOptions];
  }, [selectedSourceFields]);

  const loadStaticData = async () => {
    setLoading(true);
    try {
      const [stateData, savedData, schemaData] = await Promise.all([
        fetchAlertStates(),
        fetchSavedSearches(),
        fetchSourceFieldSchemas(),
      ]);
      setStates(stateData.filter((state) => state.is_enabled));
      setSavedSearches(savedData);
      const nextSchemaMap: Record<string, SourceFieldSchema["fields"]> = {};
      schemaData.forEach((item) => {
        nextSchemaMap[item.source_name] = item.fields;
      });
      setSchemaMap(nextSchemaMap);
    } catch {
      setError("Impossibile caricare configurazioni ricerca e filtri.");
    } finally {
      setLoading(false);
    }
  };

  const buildDynamicFilters = (): DynamicFilter[] => {
    const filters: DynamicFilter[] = [];

    selectedSourceFields.forEach((fieldDef) => {
      const rawValue = (dynamicValues[fieldDef.field] ?? "").trim();
      if (isEmptyFilterValue(rawValue)) {
        return;
      }

      if (fieldDef.type === "boolean") {
        filters.push({
          field: fieldDef.field,
          type: fieldDef.type,
          operator: "eq",
          value: rawValue === "true",
        });
        return;
      }

      if (fieldDef.type === "number") {
        filters.push({
          field: fieldDef.field,
          type: fieldDef.type,
          operator: "eq",
          value: Number(rawValue),
        });
        return;
      }

      if (fieldDef.type === "date") {
        const dateValue = new Date(rawValue);
        filters.push({
          field: fieldDef.field,
          type: fieldDef.type,
          operator: "eq",
          value: Number.isNaN(dateValue.getTime()) ? rawValue : dateValue.toISOString(),
        });
        return;
      }

      filters.push({
        field: fieldDef.field,
        type: fieldDef.type,
        operator: "contains",
        value: rawValue,
      });
    });

    return filters;
  };

  const runSearch = async () => {
    setSearching(true);
    setError(null);

    try {
      const payload: SearchRequest = {
        text: textFilter || undefined,
        source_name: sourceFilter || undefined,
        state_id: stateFilter ? Number(stateFilter) : undefined,
        severity: (severityFilter || undefined) as SearchRequest["severity"],
        is_active: isActiveFilter === "all" ? undefined : isActiveFilter === "true",
        dynamic_filters: buildDynamicFilters(),
        ordering,
        page: 1,
        page_size: 50,
      };

      const response = await searchAlerts(payload);
      setAlerts(response.results);
      setBackendLabel(response.backend);
    } catch {
      setError("Errore durante la ricerca alert.");
      setAlerts([]);
    } finally {
      setSearching(false);
    }
  };

  const handleExportCsv = async () => {
    if (exportColumns.length === 0) {
      setError("Seleziona almeno una colonna per l'export CSV.");
      return;
    }

    setExporting(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: SearchRequest & { columns: string[]; all_results: boolean } = {
        text: textFilter || undefined,
        source_name: sourceFilter || undefined,
        state_id: stateFilter ? Number(stateFilter) : undefined,
        severity: (severityFilter || undefined) as SearchRequest["severity"],
        is_active: isActiveFilter === "all" ? undefined : isActiveFilter === "true",
        dynamic_filters: buildDynamicFilters(),
        ordering,
        page: 1,
        page_size: 100,
        columns: exportColumns,
        all_results: true,
      };
      const blob = await exportAlertsConfigurable(payload);
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `socview-alerts-${Date.now()}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(url);
      setSuccess("Export CSV completato.");
    } catch {
      setError("Export CSV non riuscito.");
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    void loadStaticData();
  }, []);

  useEffect(() => {
    if (loading) {
      return;
    }
    void runSearch();
  }, [
    loading,
    textFilter,
    stateFilter,
    severityFilter,
    sourceFilter,
    isActiveFilter,
    ordering,
    dynamicValues,
  ]);

  useEffect(() => {
    const loadSourceSchema = async () => {
      if (!sourceFilter || schemaMap[sourceFilter]) {
        return;
      }
      try {
        const response = await fetchSourceFieldSchemas(sourceFilter);
        if (response.length > 0) {
          setSchemaMap((current) => ({ ...current, [sourceFilter]: response[0].fields }));
        }
      } catch {
        // ignora: errore non bloccante, resta fallback senza filtri dinamici per la fonte selezionata
      }
    };

    void loadSourceSchema();
  }, [schemaMap, sourceFilter]);

  const emptyText = useMemo(() => {
    if (searching || loading) {
      return "";
    }
    return alerts.length === 0 ? "Nessun alert trovato con i filtri correnti." : "";
  }, [alerts.length, loading, searching]);

  const isVisible = (column: string) => visibleColumns.includes(column);

  const applySavedSearch = (saved: SavedSearch) => {
    setTextFilter(saved.text_query || "");
    setSourceFilter(saved.source_name || "");
    setStateFilter(saved.state_id ? String(saved.state_id) : "");
    setSeverityFilter(saved.severity || "");
    setIsActiveFilter(saved.is_active === null ? "all" : saved.is_active ? "true" : "false");
    setOrdering(saved.ordering || "-event_timestamp");
    setVisibleColumns(saved.visible_columns?.length ? saved.visible_columns : defaultColumns);
    setExportColumns(saved.visible_columns?.length ? saved.visible_columns : defaultExportColumns);

    const nextDynamicValues: Record<string, string> = {};
    (saved.dynamic_filters || []).forEach((item) => {
      if (item.type === "date" && typeof item.value === "string") {
        nextDynamicValues[item.field] = item.value.slice(0, 16);
      } else if (typeof item.value === "boolean") {
        nextDynamicValues[item.field] = item.value ? "true" : "false";
      } else {
        nextDynamicValues[item.field] = String(item.value ?? "");
      }
    });
    setDynamicValues(nextDynamicValues);
  };

  const refreshSavedSearches = async () => {
    const data = await fetchSavedSearches();
    setSavedSearches(data);
    return data;
  };

  const buildSavedSearchPayload = () => ({
    name: savedSearchName.trim(),
    text_query: textFilter,
    source_name: sourceFilter,
    state_id: stateFilter ? Number(stateFilter) : null,
    severity: severityFilter as SavedSearch["severity"],
    is_active: isActiveFilter === "all" ? null : isActiveFilter === "true",
    dynamic_filters: buildDynamicFilters(),
    ordering,
    visible_columns: visibleColumns,
  });

  const handleSaveNew = async () => {
    const payload = buildSavedSearchPayload();
    if (!payload.name) {
      setError("Inserire un nome per salvare la ricerca.");
      return;
    }

    setError(null);
    setSuccess(null);
    try {
      const created = await createSavedSearch(payload);
      await refreshSavedSearches();
      setSelectedSavedSearch(created.id);
      setSuccess("Ricerca salvata.");
    } catch {
      setError("Salvataggio ricerca non riuscito (nome gia usato o payload non valido).");
    }
  };

  const handleUpdateSelected = async () => {
    if (selectedSavedSearch === "") {
      setError("Seleziona prima una ricerca salvata da aggiornare.");
      return;
    }

    const payload = buildSavedSearchPayload();
    if (!payload.name) {
      setError("Il nome della ricerca non puo essere vuoto.");
      return;
    }

    setError(null);
    setSuccess(null);
    try {
      await updateSavedSearch(selectedSavedSearch, payload);
      await refreshSavedSearches();
      setSuccess("Ricerca aggiornata.");
    } catch {
      setError("Aggiornamento ricerca non riuscito.");
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedSavedSearch === "") {
      setError("Seleziona una ricerca salvata da eliminare.");
      return;
    }

    setError(null);
    setSuccess(null);
    try {
      await deleteSavedSearch(selectedSavedSearch);
      await refreshSavedSearches();
      setSelectedSavedSearch("");
      setSavedSearchName("");
      setSuccess("Ricerca eliminata.");
    } catch {
      setError("Eliminazione ricerca non riuscita.");
    }
  };

  if (loading) {
    return <LinearProgress />;
  }

  return (
    <Stack spacing={2}>
      {error ? <Alert severity="error">{error}</Alert> : null}
      {success ? <Alert severity="success">{success}</Alert> : null}

      <Card>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            Ricerca Alert Tenant
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Full-text su raw/parsed con backend <strong>{backendLabel}</strong> e filtri dinamici per fonte.
          </Typography>

          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <TextField
                label="Ricerca testo"
                fullWidth
                value={textFilter}
                onChange={(event) => setTextFilter(event.target.value)}
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField
                select
                label="Stato"
                fullWidth
                value={stateFilter}
                onChange={(event) => setStateFilter(event.target.value)}
              >
                <MenuItem value="">Tutti</MenuItem>
                {states.map((state) => (
                  <MenuItem key={state.id} value={String(state.id)}>
                    {state.name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField
                select
                label="Severita"
                fullWidth
                value={severityFilter}
                onChange={(event) => setSeverityFilter(event.target.value)}
              >
                {severityOptions.map((severity) => (
                  <MenuItem key={severity || "all"} value={severity}>
                    {severity ? severity.toUpperCase() : "Tutte"}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField
                select
                label="Fonte"
                fullWidth
                value={sourceFilter}
                onChange={(event) => setSourceFilter(event.target.value)}
              >
                <MenuItem value="">Tutte</MenuItem>
                {sourceOptions.map((sourceName) => (
                  <MenuItem key={sourceName} value={sourceName}>
                    {sourceName}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField
                select
                label="Attivo"
                fullWidth
                value={isActiveFilter}
                onChange={(event) => setIsActiveFilter(event.target.value as "all" | "true" | "false")}
              >
                <MenuItem value="all">Tutti</MenuItem>
                <MenuItem value="true">Solo attivi</MenuItem>
                <MenuItem value="false">Solo finali</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                select
                label="Ordinamento"
                fullWidth
                value={ordering}
                onChange={(event) => setOrdering(event.target.value)}
              >
                {orderingOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={8}>
              <FormControl fullWidth>
                <InputLabel id="visible-columns-label">Colonne visibili</InputLabel>
                <Select
                  labelId="visible-columns-label"
                  multiple
                  value={visibleColumns}
                  onChange={(event) => {
                    const value = event.target.value;
                    setVisibleColumns(typeof value === "string" ? value.split(",") : value);
                  }}
                  input={<OutlinedInput label="Colonne visibili" />}
                  renderValue={(selected) => selected.join(", ")}
                >
                  {columnOptions.map((column) => (
                    <MenuItem key={column.value} value={column.value}>
                      <ListItemText primary={column.label} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={8}>
              <FormControl fullWidth>
                <InputLabel id="export-columns-label">Colonne export CSV</InputLabel>
                <Select
                  labelId="export-columns-label"
                  multiple
                  value={exportColumns}
                  onChange={(event) => {
                    const value = event.target.value;
                    setExportColumns(typeof value === "string" ? value.split(",") : value);
                  }}
                  input={<OutlinedInput label="Colonne export CSV" />}
                  renderValue={(selected) => selected.join(", ")}
                >
                  {exportColumnOptions.map((column) => (
                    <MenuItem key={column.value} value={column.value}>
                      <ListItemText primary={column.label} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={4}>
              <Stack spacing={1} justifyContent="center" sx={{ height: "100%" }}>
                <Typography variant="body2" color="text.secondary">
                  Export configurabile con colonne standard e dinamiche della fonte selezionata.
                </Typography>
                <Button variant="contained" onClick={handleExportCsv} disabled={exporting}>
                  {exporting ? "Export in corso..." : "Esporta CSV"}
                </Button>
              </Stack>
            </Grid>
          </Grid>

          {sourceFilter && selectedSourceFields.length > 0 ? (
            <>
              <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
                Filtri dinamici ({sourceFilter})
              </Typography>
              <Grid container spacing={2}>
                {selectedSourceFields.map((fieldDef) => {
                  if (fieldDef.type === "boolean") {
                    return (
                      <Grid item xs={12} md={3} key={fieldDef.field}>
                        <TextField
                          select
                          fullWidth
                          label={`${fieldDef.field} (boolean)`}
                          value={dynamicValues[fieldDef.field] ?? ""}
                          onChange={(event) =>
                            setDynamicValues((current) => ({ ...current, [fieldDef.field]: event.target.value }))
                          }
                        >
                          <MenuItem value="">Qualsiasi</MenuItem>
                          <MenuItem value="true">true</MenuItem>
                          <MenuItem value="false">false</MenuItem>
                        </TextField>
                      </Grid>
                    );
                  }

                  if (fieldDef.type === "date") {
                    return (
                      <Grid item xs={12} md={3} key={fieldDef.field}>
                        <TextField
                          fullWidth
                          type="datetime-local"
                          label={`${fieldDef.field} (date)`}
                          value={dynamicValues[fieldDef.field] ?? ""}
                          onChange={(event) =>
                            setDynamicValues((current) => ({ ...current, [fieldDef.field]: event.target.value }))
                          }
                          InputLabelProps={{ shrink: true }}
                        />
                      </Grid>
                    );
                  }

                  return (
                    <Grid item xs={12} md={3} key={fieldDef.field}>
                      <TextField
                        fullWidth
                        type={fieldDef.type === "number" ? "number" : "text"}
                        label={`${fieldDef.field} (${fieldDef.type})`}
                        value={dynamicValues[fieldDef.field] ?? ""}
                        onChange={(event) =>
                          setDynamicValues((current) => ({ ...current, [fieldDef.field]: event.target.value }))
                        }
                      />
                    </Grid>
                  );
                })}
              </Grid>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Saved Searches
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <TextField
                select
                fullWidth
                label="Ricerca salvata"
                value={selectedSavedSearch}
                onChange={(event) => {
                  const value = event.target.value;
                  if (!value) {
                    setSelectedSavedSearch("");
                    setSavedSearchName("");
                    return;
                  }
                  const id = Number(value);
                  setSelectedSavedSearch(id);
                  const selected = savedSearches.find((item) => item.id === id);
                  if (selected) {
                    setSavedSearchName(selected.name);
                    applySavedSearch(selected);
                  }
                }}
              >
                <MenuItem value="">Nessuna</MenuItem>
                {savedSearches.map((item) => (
                  <MenuItem key={item.id} value={item.id}>
                    {item.name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="Nome ricerca"
                value={savedSearchName}
                onChange={(event) => setSavedSearchName(event.target.value)}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <Stack direction="row" spacing={1}>
                <Button variant="contained" onClick={handleSaveNew}>
                  Salva nuova
                </Button>
                <Button variant="outlined" onClick={handleUpdateSelected}>
                  Aggiorna
                </Button>
                <Button color="error" variant="outlined" onClick={handleDeleteSelected}>
                  Elimina
                </Button>
              </Stack>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {searching ? (
            <Stack alignItems="center" justifyContent="center" sx={{ minHeight: 140 }}>
              <CircularProgress />
            </Stack>
          ) : null}

          {!searching ? (
            <Table size="small">
              <TableHead>
                <TableRow>
                  {isVisible("title") ? <TableCell>Titolo</TableCell> : null}
                  {isVisible("severity") ? <TableCell>Severita</TableCell> : null}
                  {isVisible("state") ? <TableCell>Stato</TableCell> : null}
                  {isVisible("is_active") ? <TableCell>Attivo</TableCell> : null}
                  {isVisible("assignment") ? <TableCell>Assegnato</TableCell> : null}
                  {isVisible("tags") ? <TableCell>Tag</TableCell> : null}
                  {isVisible("source_name") ? <TableCell>Fonte</TableCell> : null}
                  {isVisible("event_timestamp") ? <TableCell>Evento</TableCell> : null}
                  {isVisible("backend") ? <TableCell>Backend</TableCell> : null}
                </TableRow>
              </TableHead>
              <TableBody>
                {alerts.map((alertItem) => (
                  <TableRow
                    key={alertItem.id}
                    hover
                    sx={{ cursor: "pointer" }}
                    onClick={() => navigate(`/alerts/${alertItem.id}`)}
                  >
                    {isVisible("title") ? <TableCell>{alertItem.title}</TableCell> : null}
                    {isVisible("severity") ? <TableCell>{alertItem.severity.toUpperCase()}</TableCell> : null}
                    {isVisible("state") ? <TableCell>{alertItem.current_state_detail?.name}</TableCell> : null}
                    {isVisible("is_active") ? <TableCell>{alertItem.is_active ? "Si" : "No"}</TableCell> : null}
                    {isVisible("assignment") ? (
                      <TableCell>{alertItem.assignment?.assigned_to_detail?.username ?? "-"}</TableCell>
                    ) : null}
                    {isVisible("tags") ? (
                      <TableCell>
                        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                          {alertItem.tags.map((tag) => (
                            <Chip
                              key={tag.id}
                              label={tag.name}
                              size="small"
                              sx={{
                                backgroundColor: tag.color || undefined,
                                color: tag.color ? "common.white" : undefined,
                              }}
                            />
                          ))}
                        </Box>
                      </TableCell>
                    ) : null}
                    {isVisible("source_name") ? <TableCell>{alertItem.source_name}</TableCell> : null}
                    {isVisible("event_timestamp") ? (
                      <TableCell>{new Date(alertItem.event_timestamp).toLocaleString("it-IT")}</TableCell>
                    ) : null}
                    {isVisible("backend") ? <TableCell>{backendLabel}</TableCell> : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}

          {emptyText ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              {emptyText}
            </Typography>
          ) : null}
        </CardContent>
      </Card>
    </Stack>
  );
}
