import DownloadIcon from "@mui/icons-material/Download";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import SettingsIcon from "@mui/icons-material/Settings";
import TuneIcon from "@mui/icons-material/Tune";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Collapse,
  Grid,
  IconButton,
  LinearProgress,
  MenuItem,
  Paper,
  Popover,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  TableContainer,
  TextField,
  Typography,
} from "@mui/material";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useCustomer } from "../context/CustomerContext";
import {
  exportAlertsConfigurable,
  fetchAlert,
  fetchAlertDetailFieldConfigs,
  fetchAlertStates,
  fetchSourceFieldSchemas,
  fetchTags,
  searchAlerts,
  setAlertDetailFieldConfig,
} from "../services/alertsApi";
import { surfaceCardSx } from "../styles/surfaces";
import { Alert as AlertModel, AlertDetailFieldConfig, AlertState, SearchRequest, Tag } from "../types/alerts";

type SortDirection = "asc" | "desc";
type AlarmColumnKey = "severity" | "timestamp" | "title" | "source" | "tenant" | "status" | "event";

type AlarmDetailState = {
  loading: boolean;
  error: string | null;
  alert: AlertModel | null;
};

const tableColumns: Array<{ key: AlarmColumnKey; label: string; minWidth?: number }> = [
  { key: "severity", label: "Severity" },
  { key: "timestamp", label: "Timestamp", minWidth: 170 },
  { key: "title", label: "Tipo allarme", minWidth: 260 },
  { key: "source", label: "Fonte", minWidth: 180 },
  { key: "tenant", label: "Cliente", minWidth: 170 },
  { key: "status", label: "Stato", minWidth: 130 },
  { key: "event", label: "Event ID", minWidth: 170 },
];

const sortFieldMap: Record<AlarmColumnKey, string> = {
  severity: "severity",
  timestamp: "event_timestamp",
  title: "title",
  source: "source_name",
  tenant: "customer_id",
  status: "current_state_id",
  event: "source_id",
};

const severityOrder: AlertModel["severity"][] = ["critical", "high", "medium", "low"];

function severityTone(severity: AlertModel["severity"]) {
  if (severity === "critical") {
    return { fg: "#fca5a5", border: "rgba(248,113,113,0.35)", bg: "rgba(127,29,29,0.2)" };
  }
  if (severity === "high") {
    return { fg: "#fdba74", border: "rgba(249,115,22,0.35)", bg: "rgba(124,45,18,0.2)" };
  }
  if (severity === "medium") {
    return { fg: "#fcd34d", border: "rgba(234,179,8,0.35)", bg: "rgba(113,63,18,0.2)" };
  }
  return { fg: "#93c5fd", border: "rgba(59,130,246,0.35)", bg: "rgba(30,64,175,0.2)" };
}

function toggleSelection<T>(values: T[], value: T): T[] {
  if (values.includes(value)) {
    return values.filter((item) => item !== value);
  }
  return [...values, value];
}

function detailConfigKey(sourceName: string, alertType: string): string {
  return `${sourceName}::${alertType}`;
}

function formatDisplayValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "-";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function flattenObject(value: unknown, prefix = ""): Array<[string, unknown]> {
  if (value === null || value === undefined) {
    return prefix ? [[prefix, value]] : [];
  }
  if (Array.isArray(value)) {
    if (!value.length) {
      return prefix ? [[prefix, []]] : [];
    }
    return value.flatMap((item, index) => flattenObject(item, prefix ? `${prefix}[${index}]` : `[${index}]`));
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.length) {
      return prefix ? [[prefix, {}]] : [];
    }
    return entries.flatMap(([key, nested]) => flattenObject(nested, prefix ? `${prefix}.${key}` : key));
  }
  return prefix ? [[prefix, value]] : [];
}

function toIsoOrUndefined(value: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

function downloadCsvBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

function parsedFieldsFromAlert(alert: AlertModel): Record<string, unknown> {
  const flattened = flattenObject(alert.parsed_payload ?? {});
  const parsed = Object.fromEntries(flattened);
  return parsed;
}

function baseFieldsFromAlert(alert: AlertModel): Record<string, unknown> {
  return {
    alert_id: alert.id,
    event_timestamp: alert.event_timestamp,
    event_id: alert.source_id,
    source_name: alert.source_name,
    customer: alert.customer_detail?.name ?? "-",
    state: alert.current_state_detail?.name ?? "-",
    severity: alert.severity,
    assignment: alert.assignment?.assigned_to_detail?.username ?? null,
    dedup_fingerprint: alert.dedup_fingerprint,
    parse_error_detail: alert.parse_error_detail || null,
  };
}

export default function CustomerAlarmsPage() {
  const navigate = useNavigate();
  const { customerId: routeCustomerId } = useParams<{ customerId: string }>();
  const { customers, setSelectedCustomerId } = useCustomer();
  const scopedCustomerId = Number(routeCustomerId ?? 0);
  const hasValidCustomerId = Number.isFinite(scopedCustomerId) && scopedCustomerId > 0;
  const customer = useMemo(
    () => customers.find((item) => item.id === scopedCustomerId) ?? null,
    [customers, scopedCustomerId],
  );

  useEffect(() => {
    if (hasValidCustomerId) {
      setSelectedCustomerId(scopedCustomerId);
    }
  }, [hasValidCustomerId, scopedCustomerId, setSelectedCustomerId]);

  const [alarms, setAlarms] = useState<AlertModel[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [searchBackend, setSearchBackend] = useState<string>("unknown");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [filtersAnchor, setFiltersAnchor] = useState<HTMLElement | null>(null);
  const [detailCfgAnchor, setDetailCfgAnchor] = useState<HTMLElement | null>(null);

  const [searchText, setSearchText] = useState("");
  const [descriptionFilter, setDescriptionFilter] = useState("");
  const [timestampFrom, setTimestampFrom] = useState("");
  const [timestampTo, setTimestampTo] = useState("");
  const [severityFilters, setSeverityFilters] = useState<AlertModel["severity"][]>([]);
  const [sourceFilters, setSourceFilters] = useState<string[]>([]);
  const [stateFilters, setStateFilters] = useState<number[]>([]);
  const [typeFilters, setTypeFilters] = useState<string[]>([]);
  const [tagFilters, setTagFilters] = useState<number[]>([]);

  const [sortBy, setSortBy] = useState<AlarmColumnKey>("timestamp");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const [states, setStates] = useState<AlertState[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [detailConfigs, setDetailConfigs] = useState<AlertDetailFieldConfig[]>([]);
  const [detailConfigLoading, setDetailConfigLoading] = useState(false);
  const [detailConfigError, setDetailConfigError] = useState<string | null>(null);
  const [detailConfigSaving, setDetailConfigSaving] = useState(false);

  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});
  const [alertDetails, setAlertDetails] = useState<Record<number, AlarmDetailState>>({});

  const [cfgSourceName, setCfgSourceName] = useState("");
  const [cfgType, setCfgType] = useState("");
  const [cfgAvailableFields, setCfgAvailableFields] = useState<string[]>([]);
  const [cfgDraftFields, setCfgDraftFields] = useState<string[]>([]);

  const detailConfigMap = useMemo(() => {
    return detailConfigs.reduce<Record<string, string[]>>((acc, item) => {
      acc[detailConfigKey(item.source_name, item.alert_type)] = item.visible_fields;
      return acc;
    }, {});
  }, [detailConfigs]);

  const statesMap = useMemo(() => {
    return states.reduce<Record<number, string>>((acc, item) => {
      acc[item.id] = item.name;
      return acc;
    }, {});
  }, [states]);

  const sourceOptions = useMemo(() => {
    return Array.from(new Set([...sourceFilters, ...alarms.map((item) => item.source_name)])).sort((a, b) =>
      a.localeCompare(b, "it", { sensitivity: "base" }),
    );
  }, [alarms, sourceFilters]);

  const typeOptions = useMemo(() => {
    return Array.from(new Set([...typeFilters, ...alarms.map((item) => item.title)])).sort((a, b) =>
      a.localeCompare(b, "it", { sensitivity: "base" }),
    );
  }, [alarms, typeFilters]);

  const sourceTypePairs = useMemo(() => {
    const rowsPairs = alarms.map((item) => ({
      source_name: item.source_name,
      alert_type: item.title,
    }));
    const configPairs = detailConfigs.map((item) => ({
      source_name: item.source_name,
      alert_type: item.alert_type,
    }));
    const pairs = [...rowsPairs, ...configPairs];
    const map = new Map<string, { source_name: string; alert_type: string }>();
    pairs.forEach((pair) => {
      map.set(detailConfigKey(pair.source_name, pair.alert_type), pair);
    });
    return Array.from(map.values()).sort((a, b) => {
      const sourceCmp = a.source_name.localeCompare(b.source_name, "it", { sensitivity: "base" });
      if (sourceCmp !== 0) {
        return sourceCmp;
      }
      return a.alert_type.localeCompare(b.alert_type, "it", { sensitivity: "base" });
    });
  }, [alarms, detailConfigs]);

  const cfgSourceOptions = useMemo(() => {
    return Array.from(new Set(sourceTypePairs.map((item) => item.source_name)));
  }, [sourceTypePairs]);

  const cfgTypeOptions = useMemo(() => {
    return sourceTypePairs
      .filter((item) => item.source_name === cfgSourceName)
      .map((item) => item.alert_type);
  }, [sourceTypePairs, cfgSourceName]);

  const loadAlertMeta = useCallback(async () => {
    try {
      const [statesData, tagsData] = await Promise.all([fetchAlertStates(), fetchTags()]);
      setStates(statesData);
      setTags(tagsData);
    } catch {
      // best effort; page remains usable with reduced filters
    }
  }, []);

  const loadDetailConfigs = useCallback(async () => {
    if (!hasValidCustomerId) {
      setDetailConfigs([]);
      return;
    }
    setDetailConfigLoading(true);
    setDetailConfigError(null);
    try {
      const configs = await fetchAlertDetailFieldConfigs(scopedCustomerId);
      setDetailConfigs(configs);
    } catch {
      setDetailConfigs([]);
      setDetailConfigError("Impossibile caricare la configurazione campi dettagli.");
    } finally {
      setDetailConfigLoading(false);
    }
  }, [hasValidCustomerId, scopedCustomerId]);

  const buildSearchPayload = useCallback(
    (targetPage: number, targetPageSize: number): SearchRequest => {
      const textQuery = [searchText.trim(), descriptionFilter.trim()].filter(Boolean).join(" ");
      const orderingField = sortFieldMap[sortBy];
      const ordering = `${sortDir === "desc" ? "-" : ""}${orderingField}`;

      return {
        text: textQuery || undefined,
        source_names: sourceFilters.length ? sourceFilters : undefined,
        state_ids: stateFilters.length ? stateFilters : undefined,
        severities: severityFilters.length ? severityFilters : undefined,
        alert_types: typeFilters.length ? typeFilters : undefined,
        tag_ids: tagFilters.length ? tagFilters : undefined,
        event_timestamp_from: toIsoOrUndefined(timestampFrom),
        event_timestamp_to: toIsoOrUndefined(timestampTo),
        ordering,
        page: targetPage,
        page_size: targetPageSize,
      };
    },
    [searchText, descriptionFilter, sortBy, sortDir, sourceFilters, stateFilters, severityFilters, typeFilters, tagFilters, timestampFrom, timestampTo],
  );

  const loadAlarms = useCallback(async () => {
    if (!hasValidCustomerId) {
      setAlarms([]);
      setTotalCount(0);
      setSearchBackend("unknown");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = buildSearchPayload(page + 1, rowsPerPage);
      const response = await searchAlerts(payload, scopedCustomerId);
      setAlarms(response.results);
      setTotalCount(response.count);
      setSearchBackend(response.backend);
    } catch {
      setAlarms([]);
      setTotalCount(0);
      setSearchBackend("unknown");
      setError("Impossibile caricare gli allarmi attivi.");
    } finally {
      setLoading(false);
    }
  }, [buildSearchPayload, hasValidCustomerId, page, rowsPerPage, scopedCustomerId]);

  useEffect(() => {
    void loadAlertMeta();
  }, [loadAlertMeta]);

  useEffect(() => {
    void loadDetailConfigs();
  }, [loadDetailConfigs]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAlarms();
    }, 200);
    return () => window.clearTimeout(timer);
  }, [loadAlarms]);

  useEffect(() => {
    if (!sourceTypePairs.length) {
      setCfgSourceName("");
      setCfgType("");
      return;
    }
    if (!cfgSourceName || !cfgSourceOptions.includes(cfgSourceName)) {
      setCfgSourceName(cfgSourceOptions[0] ?? "");
      return;
    }
    if (!cfgType || !cfgTypeOptions.includes(cfgType)) {
      setCfgType(cfgTypeOptions[0] ?? "");
    }
  }, [cfgSourceName, cfgType, cfgSourceOptions, cfgTypeOptions, sourceTypePairs]);

  useEffect(() => {
    if (!cfgSourceName) {
      setCfgAvailableFields([]);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        if (!hasValidCustomerId) {
          return;
        }
        const schema = await fetchSourceFieldSchemas(cfgSourceName, scopedCustomerId);
        if (cancelled) {
          return;
        }
        const sourceEntry = schema.find((item) => item.source_name === cfgSourceName);
        const schemaFields = (sourceEntry?.fields ?? []).map((item) => item.field);

        const detailFields = Object.values(alertDetails)
          .filter((item) => Boolean(item.alert) && item.alert?.source_name === cfgSourceName && item.alert?.title === cfgType)
          .flatMap((item) => Object.keys(parsedFieldsFromAlert(item.alert as AlertModel)));

        const merged = Array.from(new Set([...schemaFields, ...detailFields])).sort((a, b) =>
          a.localeCompare(b, "it", { sensitivity: "base" }),
        );
        setCfgAvailableFields(merged);
      } catch {
        setCfgAvailableFields([]);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [cfgSourceName, cfgType, alertDetails, hasValidCustomerId, scopedCustomerId]);

  useEffect(() => {
    if (!cfgSourceName || !cfgType) {
      setCfgDraftFields([]);
      return;
    }
    const key = detailConfigKey(cfgSourceName, cfgType);
    const configured = detailConfigMap[key];
    if (configured) {
      setCfgDraftFields(configured);
      return;
    }
    setCfgDraftFields(cfgAvailableFields);
  }, [cfgSourceName, cfgType, cfgAvailableFields, detailConfigMap]);

  useEffect(() => {
    setExpandedRows({});
    setAlertDetails({});
    setPage(0);
  }, [scopedCustomerId]);

  const toggleSort = (key: AlarmColumnKey) => {
    if (sortBy === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("asc");
    }
    setPage(0);
  };

  const clearFilters = () => {
    setSearchText("");
    setDescriptionFilter("");
    setTimestampFrom("");
    setTimestampTo("");
    setSeverityFilters([]);
    setSourceFilters([]);
    setStateFilters([]);
    setTypeFilters([]);
    setTagFilters([]);
    setPage(0);
  };

  const ensureAlertDetail = useCallback(async (alertId: number) => {
    let shouldFetch = false;
    setAlertDetails((current) => {
      const existing = current[alertId];
      if (existing?.loading || existing?.alert) {
        return current;
      }
      shouldFetch = true;
      return {
        ...current,
        [alertId]: { loading: true, error: null, alert: null },
      };
    });

    if (!shouldFetch) {
      return;
    }

    try {
      const detail = await fetchAlert(String(alertId));
      setAlertDetails((current) => ({
        ...current,
        [alertId]: { loading: false, error: null, alert: detail },
      }));
    } catch {
      setAlertDetails((current) => ({
        ...current,
        [alertId]: { loading: false, error: "Impossibile caricare dettaglio allarme.", alert: null },
      }));
    }
  }, []);

  const toggleRow = (alertId: number) => {
    const nextOpen = !expandedRows[alertId];
    setExpandedRows((current) => ({ ...current, [alertId]: nextOpen }));
    if (nextOpen) {
      void ensureAlertDetail(alertId);
    }
  };

  const saveDetailConfig = async () => {
    if (!cfgSourceName || !cfgType) {
      return;
    }
    setDetailConfigSaving(true);
    setDetailConfigError(null);
    try {
      const saved = await setAlertDetailFieldConfig(
        {
          source_name: cfgSourceName,
          alert_type: cfgType,
          visible_fields: cfgDraftFields,
        },
        scopedCustomerId,
      );
      setDetailConfigs((current) => {
        const next = current.filter(
          (item) =>
            !(item.source_name === saved.source_name && item.alert_type === saved.alert_type && item.customer === saved.customer),
        );
        next.push(saved);
        return next;
      });
    } catch {
      setDetailConfigError("Salvataggio configurazione campi dettagli non riuscito.");
    } finally {
      setDetailConfigSaving(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      const payload = buildSearchPayload(1, rowsPerPage);
      const blob = await exportAlertsConfigurable({
        ...payload,
        columns: ["id", "title", "severity", "state", "source_name", "source_id", "event_timestamp", "tags", "assignment"],
        all_results: true,
      });
      downloadCsvBlob(blob, `customer-${scopedCustomerId}-alarms.csv`);
    } catch {
      setError("Export allarmi non riuscito.");
    } finally {
      setExporting(false);
    }
  };

  if (!hasValidCustomerId) {
    return <Alert severity="error">Cliente non valido.</Alert>;
  }

  const customerLabel = customer ? customer.name : `Cliente #${scopedCustomerId}`;

  return (
    <Stack spacing={2} sx={{ minHeight: "calc(100vh - 148px)" }}>
      {error ? <Alert severity="error">{error}</Alert> : null}

      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }} spacing={1.2}>
        <Box>
          <Typography sx={{ color: "#f8fafc", fontSize: { xs: 26, md: 34 }, fontWeight: 700 }}>{customerLabel}</Typography>
          <Typography sx={{ color: "#64748b" }}>Allarmi del cliente con ricerca avanzata, filtri, ordinamento, export ed espansione.</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<FilterAltIcon />} sx={{ borderColor: "rgba(71,85,105,0.55)", color: "#cbd5e1" }} onClick={(event) => setFiltersAnchor(event.currentTarget)}>
            Filtri
          </Button>
          <Button variant="outlined" startIcon={<TuneIcon />} sx={{ borderColor: "rgba(71,85,105,0.55)", color: "#cbd5e1" }} onClick={(event) => setDetailCfgAnchor(event.currentTarget)}>
            Configura dettagli
          </Button>
          <Button variant="outlined" startIcon={<DownloadIcon />} disabled={exporting} sx={{ borderColor: "rgba(71,85,105,0.55)", color: "#cbd5e1" }} onClick={() => void handleExport()}>
            Export
          </Button>
          <Button
            variant="contained"
            startIcon={<SettingsIcon />}
            sx={{ background: "linear-gradient(180deg,#3b82f6,#1d4ed8)" }}
            onClick={() => navigate(`/customers/${scopedCustomerId}/settings`)}
          >
            Impostazioni
          </Button>
        </Stack>
      </Stack>

      <Stack direction={{ xs: "column", md: "row" }} spacing={1.2}>
        <Chip label={`Allarmi: ${alarms.length}/${totalCount}`} sx={{ color: "#fca5a5", border: "1px solid rgba(248,113,113,0.4)", background: "rgba(127,29,29,0.2)" }} />
        <Chip label={`Backend search: ${searchBackend}`} sx={{ color: "#86efac", border: "1px solid rgba(74,222,128,0.35)", background: "rgba(20,83,45,0.2)" }} />
        <Chip label={`Contesto: ${customerLabel}`} sx={{ color: "#93c5fd", border: "1px solid rgba(59,130,246,0.35)", background: "rgba(30,64,175,0.2)" }} />
      </Stack>

      <TextField
        placeholder="Ricerca elastic-style sugli allarmi del cliente..."
        value={searchText}
        onChange={(event) => {
          setSearchText(event.target.value);
          setPage(0);
        }}
        fullWidth
        sx={{
          input: { color: "#e2e8f0" },
          "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(148,163,184,0.24)" },
        }}
      />

      <Popover
        open={Boolean(filtersAnchor)}
        anchorEl={filtersAnchor}
        onClose={() => setFiltersAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        PaperProps={{ sx: { width: 520, p: 1.5, bgcolor: "var(--surface-2)", border: "1px solid var(--border-subtle)", color: "#e2e8f0" } }}
      >
        <Stack spacing={1.5}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography sx={{ fontWeight: 700, fontSize: 16 }}>Filtri allarmi cliente</Typography>
            <Button size="small" onClick={clearFilters} sx={{ color: "#93c5fd" }}>
              Reset
            </Button>
          </Stack>

          <Grid container spacing={1}>
            <Grid item xs={12}>
              <Typography sx={{ color: "#94a3b8", fontSize: 12, mb: 0.5 }}>Tag / etichette</Typography>
              <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                {tags.map((tag) => (
                  <Chip
                    key={tag.id}
                    label={tag.name}
                    size="small"
                    clickable
                    color={tagFilters.includes(tag.id) ? "primary" : "default"}
                    onClick={() => {
                      setTagFilters((current) => toggleSelection(current, tag.id));
                      setPage(0);
                    }}
                  />
                ))}
              </Stack>
            </Grid>

            <Grid item xs={12} md={6}>
              <Typography sx={{ color: "#94a3b8", fontSize: 12, mb: 0.5 }}>Severità</Typography>
              <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                {severityOrder.map((value) => (
                  <Chip
                    key={value}
                    label={value}
                    size="small"
                    clickable
                    color={severityFilters.includes(value) ? "primary" : "default"}
                    onClick={() => {
                      setSeverityFilters((current) => toggleSelection(current, value));
                      setPage(0);
                    }}
                  />
                ))}
              </Stack>
            </Grid>

            <Grid item xs={12} md={6}>
              <Typography sx={{ color: "#94a3b8", fontSize: 12, mb: 0.5 }}>Stato</Typography>
              <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                {states.map((state) => (
                  <Chip
                    key={state.id}
                    label={state.name}
                    size="small"
                    clickable
                    color={stateFilters.includes(state.id) ? "primary" : "default"}
                    onClick={() => {
                      setStateFilters((current) => toggleSelection(current, state.id));
                      setPage(0);
                    }}
                  />
                ))}
              </Stack>
            </Grid>

            <Grid item xs={12} md={6}>
              <Typography sx={{ color: "#94a3b8", fontSize: 12, mb: 0.5 }}>Fonte</Typography>
              <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                {sourceOptions.map((value) => (
                  <Chip
                    key={value}
                    label={value}
                    size="small"
                    clickable
                    color={sourceFilters.includes(value) ? "primary" : "default"}
                    onClick={() => {
                      setSourceFilters((current) => toggleSelection(current, value));
                      setPage(0);
                    }}
                  />
                ))}
              </Stack>
            </Grid>

            <Grid item xs={12} md={6}>
              <Typography sx={{ color: "#94a3b8", fontSize: 12, mb: 0.5 }}>Tipo allarme</Typography>
              <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                {typeOptions.map((value) => (
                  <Chip
                    key={value}
                    label={value}
                    size="small"
                    clickable
                    color={typeFilters.includes(value) ? "primary" : "default"}
                    onClick={() => {
                      setTypeFilters((current) => toggleSelection(current, value));
                      setPage(0);
                    }}
                  />
                ))}
              </Stack>
            </Grid>

            <Grid item xs={12}>
              <TextField
                label="Descrizione full-text"
                size="small"
                value={descriptionFilter}
                onChange={(event) => {
                  setDescriptionFilter(event.target.value);
                  setPage(0);
                }}
                fullWidth
                sx={{ input: { color: "#e2e8f0" }, label: { color: "#94a3b8" }, "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(148,163,184,0.24)" } }}
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                label="Timestamp da"
                type="datetime-local"
                size="small"
                value={timestampFrom}
                onChange={(event) => {
                  setTimestampFrom(event.target.value);
                  setPage(0);
                }}
                fullWidth
                InputLabelProps={{ shrink: true }}
                sx={{ input: { color: "#e2e8f0" }, label: { color: "#94a3b8" }, "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(148,163,184,0.24)" } }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Timestamp a"
                type="datetime-local"
                size="small"
                value={timestampTo}
                onChange={(event) => {
                  setTimestampTo(event.target.value);
                  setPage(0);
                }}
                fullWidth
                InputLabelProps={{ shrink: true }}
                sx={{ input: { color: "#e2e8f0" }, label: { color: "#94a3b8" }, "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(148,163,184,0.24)" } }}
              />
            </Grid>
          </Grid>
        </Stack>
      </Popover>

      <Popover
        open={Boolean(detailCfgAnchor)}
        anchorEl={detailCfgAnchor}
        onClose={() => setDetailCfgAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        PaperProps={{ sx: { width: 560, p: 1.5, bgcolor: "var(--surface-2)", border: "1px solid var(--border-subtle)", color: "#e2e8f0" } }}
      >
        <Stack spacing={1.5}>
          <Typography sx={{ fontWeight: 700, fontSize: 16 }}>Campi espansi per Fonte + Tipo allarme</Typography>
          {detailConfigError ? <Alert severity="error">{detailConfigError}</Alert> : null}
          {detailConfigLoading ? <LinearProgress sx={{ borderRadius: 2 }} /> : null}

          <Grid container spacing={1}>
            <Grid item xs={12} md={6}>
              <TextField
                select
                label="Fonte"
                size="small"
                value={cfgSourceName}
                onChange={(event) => setCfgSourceName(event.target.value)}
                fullWidth
                sx={{ input: { color: "#e2e8f0" }, label: { color: "#94a3b8" } }}
              >
                {cfgSourceOptions.map((sourceName) => (
                  <MenuItem key={sourceName} value={sourceName}>
                    {sourceName}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                select
                label="Tipo allarme"
                size="small"
                value={cfgType}
                onChange={(event) => setCfgType(event.target.value)}
                fullWidth
                sx={{ input: { color: "#e2e8f0" }, label: { color: "#94a3b8" } }}
              >
                {cfgTypeOptions.map((value) => (
                  <MenuItem key={value} value={value}>
                    {value}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>

          <Box>
            <Typography sx={{ color: "#94a3b8", fontSize: 12, mb: 0.5 }}>Campi parsati configurabili</Typography>
            <Grid container spacing={0.5}>
              {cfgAvailableFields.map((fieldKey) => (
                <Grid item xs={12} md={6} key={fieldKey}>
                  <Stack direction="row" alignItems="center" spacing={0.3}>
                    <Checkbox
                      size="small"
                      checked={cfgDraftFields.includes(fieldKey)}
                      onChange={() => setCfgDraftFields((current) => toggleSelection(current, fieldKey))}
                      sx={{ color: "#93c5fd", p: 0.5 }}
                    />
                    <Typography sx={{ fontSize: 12 }}>{fieldKey}</Typography>
                  </Stack>
                </Grid>
              ))}
            </Grid>
          </Box>

          <Button variant="contained" disabled={detailConfigSaving || !cfgSourceName || !cfgType} onClick={() => void saveDetailConfig()}>
            Salva configurazione
          </Button>
        </Stack>
      </Popover>

      <Paper sx={{ ...surfaceCardSx, display: "flex", flexDirection: "column", minHeight: { xs: 460, lg: 620 } }}>
        {loading ? <LinearProgress sx={{ borderRadius: 0 }} /> : null}
        <TableContainer sx={{ overflowX: "auto", overflowY: "auto", maxHeight: { xs: 500, lg: 660 } }}>
          <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 44, borderBottomColor: "rgba(71,85,105,0.35)" }} />
              {tableColumns.map((column) => (
                <TableCell key={column.key} sx={{ color: "#64748b", borderBottomColor: "rgba(71,85,105,0.35)", fontWeight: 700, minWidth: column.minWidth }}>
                  <TableSortLabel
                    active={sortBy === column.key}
                    direction={sortBy === column.key ? sortDir : "asc"}
                    onClick={() => toggleSort(column.key)}
                    sx={{ color: "inherit", "& .MuiTableSortLabel-icon": { color: "#64748b !important" } }}
                  >
                    {column.label}
                  </TableSortLabel>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {!loading && !alarms.length ? (
              <TableRow>
                <TableCell colSpan={tableColumns.length + 1} sx={{ color: "#94a3b8" }}>
                  Nessun allarme disponibile per i filtri correnti.
                </TableCell>
              </TableRow>
            ) : null}
            {alarms.map((row) => {
              const tone = severityTone(row.severity);
              const detailState = alertDetails[row.id];
              const detailAlert = detailState?.alert;
              const parsedFields = detailAlert ? parsedFieldsFromAlert(detailAlert) : {};
              const cfgKey = detailConfigKey(row.source_name, row.title);
              const configuredFields = detailConfigMap[cfgKey] ?? Object.keys(parsedFields);
              const visibleParsedFields = configuredFields.filter((field) =>
                Object.prototype.hasOwnProperty.call(parsedFields, field),
              );
              const baseEntries = Object.entries(baseFieldsFromAlert(detailAlert ?? row));

              return (
                <Fragment key={row.id}>
                  <TableRow
                    hover
                    sx={{
                      "&:nth-of-type(4n+1), &:nth-of-type(4n+2)": { backgroundColor: "rgba(15,23,42,0.3)" },
                    }}
                  >
                    <TableCell sx={{ borderBottomColor: "rgba(71,85,105,0.25)" }}>
                      <IconButton size="small" sx={{ color: "#93c5fd" }} onClick={() => toggleRow(row.id)}>
                        {expandedRows[row.id] ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
                      </IconButton>
                    </TableCell>
                    <TableCell sx={{ borderBottomColor: "rgba(71,85,105,0.25)" }}>
                      <Chip size="small" label={row.severity.toUpperCase()} sx={{ color: tone.fg, border: `1px solid ${tone.border}`, background: tone.bg }} />
                    </TableCell>
                    <TableCell sx={{ color: "#94a3b8", borderBottomColor: "rgba(71,85,105,0.25)" }}>{new Date(row.event_timestamp).toLocaleString("it-IT")}</TableCell>
                    <TableCell sx={{ color: "#e2e8f0", borderBottomColor: "rgba(71,85,105,0.25)" }}>{row.title}</TableCell>
                    <TableCell sx={{ color: "#94a3b8", borderBottomColor: "rgba(71,85,105,0.25)" }}>{row.source_name}</TableCell>
                    <TableCell sx={{ color: "#94a3b8", borderBottomColor: "rgba(71,85,105,0.25)" }}>{row.customer_detail?.name ?? "-"}</TableCell>
                    <TableCell sx={{ color: "#e2e8f0", borderBottomColor: "rgba(71,85,105,0.25)" }}>{statesMap[row.current_state] ?? row.current_state_detail?.name ?? "-"}</TableCell>
                    <TableCell sx={{ color: "#94a3b8", borderBottomColor: "rgba(71,85,105,0.25)" }}>{row.source_id}</TableCell>
                  </TableRow>

                  <TableRow>
                    <TableCell sx={{ p: 0, borderBottomColor: "rgba(71,85,105,0.25)" }} colSpan={tableColumns.length + 1}>
                      <Collapse in={Boolean(expandedRows[row.id])} timeout="auto" unmountOnExit>
                        <Box sx={{ p: { xs: 1.2, md: 1.7 }, bgcolor: "rgba(2,6,23,0.55)" }}>
                          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                            <Typography sx={{ color: "#cbd5e1", fontWeight: 600 }}>Dettaglio allarme</Typography>
                            <Typography sx={{ color: "#64748b", fontSize: 12 }}>
                              Config attiva: {row.source_name} + {row.title}
                            </Typography>
                          </Stack>
                          {detailState?.loading ? <LinearProgress sx={{ mb: 1, borderRadius: 2 }} /> : null}
                          {detailState?.error ? <Alert severity="error">{detailState.error}</Alert> : null}

                          <Typography sx={{ color: "#94a3b8", fontSize: 12, mb: 0.7 }}>Campi base (fissi)</Typography>
                          <Grid container spacing={1} sx={{ mb: 1.3 }}>
                            {baseEntries.map(([key, value]) => (
                              <Grid item xs={12} md={6} lg={4} key={`${row.id}-base-${key}`}>
                                <Box sx={{ border: "1px solid rgba(71,85,105,0.35)", borderRadius: 1.5, px: 1, py: 0.8, background: "rgba(15,23,42,0.5)" }}>
                                  <Typography sx={{ color: "#64748b", fontSize: 11 }}>{key}</Typography>
                                  <Typography sx={{ color: "#e2e8f0", fontSize: 13, wordBreak: "break-word" }}>
                                    {formatDisplayValue(value)}
                                  </Typography>
                                </Box>
                              </Grid>
                            ))}
                          </Grid>

                          <Typography sx={{ color: "#94a3b8", fontSize: 12, mb: 0.7 }}>Campi espansi configurabili</Typography>
                          {!detailAlert ? (
                            <Typography sx={{ color: "#64748b", fontSize: 13 }}>Apri la riga per caricare il payload parsato.</Typography>
                          ) : visibleParsedFields.length === 0 ? (
                            <Typography sx={{ color: "#64748b", fontSize: 13 }}>
                              Nessun campo visibile per questa combinazione fonte/tipo. Usa "Configura dettagli".
                            </Typography>
                          ) : (
                            <Grid container spacing={1}>
                              {visibleParsedFields.map((fieldKey) => (
                                <Grid item xs={12} md={6} lg={4} key={`${row.id}-${fieldKey}`}>
                                  <Box sx={{ border: "1px solid rgba(71,85,105,0.35)", borderRadius: 1.5, px: 1, py: 0.8, background: "rgba(15,23,42,0.5)" }}>
                                    <Typography sx={{ color: "#64748b", fontSize: 11 }}>{fieldKey}</Typography>
                                    <Typography sx={{ color: "#e2e8f0", fontSize: 13, wordBreak: "break-word" }}>
                                      {formatDisplayValue(parsedFields[fieldKey])}
                                    </Typography>
                                  </Box>
                                </Grid>
                              ))}
                            </Grid>
                          )}
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={totalCount}
          page={page}
          onPageChange={(_, nextPage) => setPage(nextPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(event) => {
            const next = Number(event.target.value);
            setRowsPerPage(next);
            setPage(0);
          }}
          rowsPerPageOptions={[10, 25, 50, 100]}
          sx={{ color: "#94a3b8", borderTop: "1px solid rgba(71,85,105,0.25)" }}
        />
      </Paper>
    </Stack>
  );
}
