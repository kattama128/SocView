import FilterAltIcon from "@mui/icons-material/FilterAlt";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import SettingsIcon from "@mui/icons-material/Settings";
import TuneIcon from "@mui/icons-material/Tune";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Collapse,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Popover,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Typography,
} from "@mui/material";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useCustomer } from "../context/CustomerContext";
import { MockAlarm, mockAlarms, mockCustomers, mockSources } from "../mocks/activeAlarmsData";
import { isSourceEnabledForCustomer, loadCustomerSourcePreferences, loadGlobalSourcesConfig, resolveAlarmSeverity } from "../mocks/sourceCatalog";

type SortDirection = "asc" | "desc";
type AlarmColumnKey = "severity" | "timestamp" | "title" | "source" | "tenant" | "status" | "event";

type AlarmRow = MockAlarm & {
  sourceName: string;
  tenantName: string;
  parsedFields: Record<string, unknown>;
  searchBlob: string;
  timestampRaw: number;
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

const detailConfigStorageKey = "socview_costumer_alarms_detail_config";
type DetailConfigMap = Record<string, string[]>;

function severityTone(severity: MockAlarm["severity"]) {
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

function loadDetailConfig(): DetailConfigMap {
  try {
    const raw = localStorage.getItem(detailConfigStorageKey);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as DetailConfigMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function detailKey(sourceId: number, alertType: string): string {
  return `${sourceId}::${alertType}`;
}

function toggleSelection(values: string[], value: string): string[] {
  if (values.includes(value)) {
    return values.filter((item) => item !== value);
  }
  return [...values, value];
}

function sortableValue(row: AlarmRow, key: AlarmColumnKey): string | number {
  if (key === "timestamp") return row.timestampRaw;
  if (key === "severity") return row.severity;
  if (key === "title") return row.title;
  if (key === "source") return row.sourceName;
  if (key === "tenant") return row.tenantName;
  if (key === "status") return row.status;
  return row.eventId;
}

export default function CustomerAlarmsPage() {
  const navigate = useNavigate();
  const { setSelectedCustomerId } = useCustomer();
  const globalSources = useMemo(() => loadGlobalSourcesConfig(), []);
  const sourcePreferences = useMemo(() => loadCustomerSourcePreferences(), []);
  const params = useParams<{ customerId: string }>();
  const customerId = Number(params.customerId ?? 0);

  const customer = useMemo(
    () => mockCustomers.find((item) => item.id === customerId) ?? null,
    [customerId],
  );

  useEffect(() => {
    if (customerId) {
      setSelectedCustomerId(customerId);
    }
  }, [customerId, setSelectedCustomerId]);

  const [searchText, setSearchText] = useState("");
  const [sortBy, setSortBy] = useState<AlarmColumnKey>("timestamp");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

  const [filtersAnchor, setFiltersAnchor] = useState<HTMLElement | null>(null);
  const [detailCfgAnchor, setDetailCfgAnchor] = useState<HTMLElement | null>(null);

  const [severityFilters, setSeverityFilters] = useState<string[]>([]);
  const [sourceFilters, setSourceFilters] = useState<string[]>([]);
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [typeFilters, setTypeFilters] = useState<string[]>([]);
  const [descriptionFilter, setDescriptionFilter] = useState("");
  const [timestampFrom, setTimestampFrom] = useState("");
  const [timestampTo, setTimestampTo] = useState("");

  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});
  const [detailConfigMap, setDetailConfigMap] = useState<DetailConfigMap>(loadDetailConfig);

  const rows = useMemo<AlarmRow[]>(() => {
    return mockAlarms
      .filter((alarm) => alarm.customerId === customerId)
      .filter((alarm) => isSourceEnabledForCustomer(customerId, alarm.sourceId, sourcePreferences))
      .map((alarm, index) => {
        const source = mockSources.find((item) => item.id === alarm.sourceId);
        const customerName = customer?.name ?? `Costumer ${alarm.customerId}`;
        const normalizedSeverity = resolveAlarmSeverity(alarm.sourceId, alarm.title, alarm.severity, globalSources);
        const parsedFields: Record<string, unknown> = {
          event_id: alarm.eventId,
          source_type: source?.type ?? null,
          source_status: source?.status ?? null,
          customer_code: customer?.code ?? null,
          customer_sector: customer?.sector ?? null,
          assignee: alarm.assignee,
          workflow_status: alarm.status,
          severity_raw: alarm.severity,
          severity_effective: normalizedSeverity,
          rule_name: alarm.title,
          ingest_lag_seconds: 12 + (index % 9) * 7,
          confidence: 45 + (index % 11) * 5,
        };

        const searchBlob = [
          alarm.title,
          alarm.eventId,
          source?.name,
          customerName,
          alarm.status,
          normalizedSeverity,
          ...Object.values(parsedFields).map((value) => String(value)),
        ]
          .join(" ")
          .toLowerCase();

        return {
          ...alarm,
          severity: normalizedSeverity,
          sourceName: source?.name ?? `Source ${alarm.sourceId}`,
          tenantName: customerName,
          parsedFields,
          searchBlob,
          timestampRaw: new Date(alarm.detectedAt).getTime(),
        };
      });
  }, [customerId, customer, sourcePreferences, globalSources]);

  const severityOptions = useMemo(() => Array.from(new Set(rows.map((row) => row.severity))), [rows]);
  const sourceOptions = useMemo(
    () => Array.from(new Set(rows.map((row) => row.sourceName))).sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" })),
    [rows],
  );
  const statusOptions = useMemo(
    () => Array.from(new Set(rows.map((row) => row.status))).sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" })),
    [rows],
  );
  const typeOptions = useMemo(
    () => Array.from(new Set(rows.map((row) => row.title))).sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" })),
    [rows],
  );

  const sourceTypePairs = useMemo(
    () =>
      Array.from(
        new Map(
          rows.map((row) => [detailKey(row.sourceId, row.title), { sourceId: row.sourceId, sourceName: row.sourceName, type: row.title }]),
        ).values(),
      ),
    [rows],
  );

  const [cfgSourceId, setCfgSourceId] = useState<number>(sourceTypePairs[0]?.sourceId ?? 0);
  const [cfgType, setCfgType] = useState<string>(sourceTypePairs[0]?.type ?? "");

  const availableDetailFields = useMemo(() => {
    const keys = new Set<string>();
    rows.forEach((row) => {
      if (row.sourceId === cfgSourceId && row.title === cfgType) {
        Object.keys(row.parsedFields).forEach((key) => keys.add(key));
      }
    });
    return Array.from(keys).sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));
  }, [rows, cfgSourceId, cfgType]);

  const activeCfgKey = detailKey(cfgSourceId, cfgType);
  const activeCfgFields = detailConfigMap[activeCfgKey] ?? availableDetailFields;

  const filteredSortedRows = useMemo(() => {
    const fromMs = timestampFrom ? new Date(timestampFrom).getTime() : null;
    const toMs = timestampTo ? new Date(timestampTo).getTime() : null;
    const descNeedle = descriptionFilter.trim().toLowerCase();
    const tokens = searchText.toLowerCase().split(" ").map((token) => token.trim()).filter(Boolean);

    const filtered = rows.filter((row) => {
      if (severityFilters.length && !severityFilters.includes(row.severity)) return false;
      if (sourceFilters.length && !sourceFilters.includes(row.sourceName)) return false;
      if (statusFilters.length && !statusFilters.includes(row.status)) return false;
      if (typeFilters.length && !typeFilters.includes(row.title)) return false;
      if (descNeedle && !row.title.toLowerCase().includes(descNeedle)) return false;
      if (fromMs !== null && Number.isFinite(fromMs) && row.timestampRaw < fromMs) return false;
      if (toMs !== null && Number.isFinite(toMs) && row.timestampRaw > toMs) return false;
      if (tokens.length && !tokens.every((token) => row.searchBlob.includes(token))) return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      const av = sortableValue(a, sortBy);
      const bv = sortableValue(b, sortBy);
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv), "it", { sensitivity: "base" })
        : String(bv).localeCompare(String(av), "it", { sensitivity: "base" });
    });
  }, [rows, severityFilters, sourceFilters, statusFilters, typeFilters, descriptionFilter, timestampFrom, timestampTo, searchText, sortBy, sortDir]);

  const clearFilters = () => {
    setSeverityFilters([]);
    setSourceFilters([]);
    setStatusFilters([]);
    setTypeFilters([]);
    setDescriptionFilter("");
    setTimestampFrom("");
    setTimestampTo("");
    setSearchText("");
  };

  const toggleSort = (key: AlarmColumnKey) => {
    if (sortBy === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(key);
    setSortDir("asc");
  };

  const toggleRow = (alarmId: number) => {
    setExpandedRows((current) => ({ ...current, [alarmId]: !current[alarmId] }));
  };

  const updateDetailFieldConfig = (fieldKey: string) => {
    const next = toggleSelection(activeCfgFields, fieldKey);
    const updatedMap = { ...detailConfigMap, [activeCfgKey]: next };
    setDetailConfigMap(updatedMap);
    localStorage.setItem(detailConfigStorageKey, JSON.stringify(updatedMap));
  };

  if (!customer) {
    return (
      <Paper sx={{ p: 2, borderRadius: 3, border: "1px solid rgba(148,163,184,0.24)", background: "rgba(15,23,42,0.9)" }}>
        <Typography sx={{ color: "#fca5a5" }}>Cliente non trovato.</Typography>
      </Paper>
    );
  }

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }} spacing={1.2}>
        <Box>
          <Typography sx={{ color: "#f8fafc", fontSize: { xs: 26, md: 34 }, fontWeight: 700 }}>{customer.name}</Typography>
          <Typography sx={{ color: "#64748b" }}>Allarmi del cliente in tabella (filtri, ordinamento, ricerca, espansione).</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<FilterAltIcon />} sx={{ borderColor: "rgba(71,85,105,0.55)", color: "#cbd5e1" }} onClick={(event) => setFiltersAnchor(event.currentTarget)}>
            Filtri
          </Button>
          <Button variant="outlined" startIcon={<TuneIcon />} sx={{ borderColor: "rgba(71,85,105,0.55)", color: "#cbd5e1" }} onClick={(event) => setDetailCfgAnchor(event.currentTarget)}>
            Configura dettagli
          </Button>
          <Button variant="contained" startIcon={<SettingsIcon />} sx={{ background: "linear-gradient(180deg,#3b82f6,#1d4ed8)" }} onClick={() => navigate(`/configurazione?customerId=${customer.id}&customer=${encodeURIComponent(customer.name)}`)}>
            Impostazioni
          </Button>
        </Stack>
      </Stack>

      <TextField
        placeholder="Ricerca full-text (elastic-like) negli allarmi del cliente..."
        value={searchText}
        onChange={(event) => setSearchText(event.target.value)}
        fullWidth
        sx={{ input: { color: "#e2e8f0" }, "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(148,163,184,0.24)" } }}
      />

      <Popover
        open={Boolean(filtersAnchor)}
        anchorEl={filtersAnchor}
        onClose={() => setFiltersAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        PaperProps={{ sx: { width: 500, p: 1.5, bgcolor: "#0b1731", border: "1px solid rgba(71,85,105,0.55)", color: "#e2e8f0" } }}
      >
        <Stack spacing={1.5}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography sx={{ fontWeight: 700, fontSize: 16 }}>Filtri allarmi cliente</Typography>
            <Button size="small" onClick={clearFilters} sx={{ color: "#93c5fd" }}>Reset</Button>
          </Stack>

          <Grid container spacing={1}>
            <Grid item xs={12} md={6}>
              <Typography sx={{ color: "#94a3b8", fontSize: 12, mb: 0.5 }}>Severity (etichette)</Typography>
              <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                {severityOptions.map((value) => (
                  <Chip key={value} label={value} size="small" clickable color={severityFilters.includes(value) ? "primary" : "default"} onClick={() => setSeverityFilters((current) => toggleSelection(current, value))} />
                ))}
              </Stack>
            </Grid>

            <Grid item xs={12} md={6}>
              <Typography sx={{ color: "#94a3b8", fontSize: 12, mb: 0.5 }}>Stato (etichette)</Typography>
              <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                {statusOptions.map((value) => (
                  <Chip key={value} label={value} size="small" clickable color={statusFilters.includes(value) ? "primary" : "default"} onClick={() => setStatusFilters((current) => toggleSelection(current, value))} />
                ))}
              </Stack>
            </Grid>

            <Grid item xs={12} md={6}>
              <Typography sx={{ color: "#94a3b8", fontSize: 12, mb: 0.5 }}>Fonte (etichette)</Typography>
              <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                {sourceOptions.map((value) => (
                  <Chip key={value} label={value} size="small" clickable color={sourceFilters.includes(value) ? "primary" : "default"} onClick={() => setSourceFilters((current) => toggleSelection(current, value))} />
                ))}
              </Stack>
            </Grid>

            <Grid item xs={12} md={6}>
              <Typography sx={{ color: "#94a3b8", fontSize: 12, mb: 0.5 }}>Tipo allarme (etichette)</Typography>
              <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                {typeOptions.map((value) => (
                  <Chip key={value} label={value} size="small" clickable color={typeFilters.includes(value) ? "primary" : "default"} onClick={() => setTypeFilters((current) => toggleSelection(current, value))} />
                ))}
              </Stack>
            </Grid>

            <Grid item xs={12}>
              <TextField label="Descrizione / tipo allarme (testo libero)" size="small" value={descriptionFilter} onChange={(event) => setDescriptionFilter(event.target.value)} fullWidth sx={{ input: { color: "#e2e8f0" }, label: { color: "#94a3b8" }, "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(148,163,184,0.24)" } }} />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField label="Timestamp da" type="datetime-local" size="small" value={timestampFrom} onChange={(event) => setTimestampFrom(event.target.value)} fullWidth InputLabelProps={{ shrink: true }} sx={{ input: { color: "#e2e8f0" }, label: { color: "#94a3b8" }, "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(148,163,184,0.24)" } }} />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField label="Timestamp a" type="datetime-local" size="small" value={timestampTo} onChange={(event) => setTimestampTo(event.target.value)} fullWidth InputLabelProps={{ shrink: true }} sx={{ input: { color: "#e2e8f0" }, label: { color: "#94a3b8" }, "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(148,163,184,0.24)" } }} />
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
        PaperProps={{ sx: { width: 520, p: 1.5, bgcolor: "#0b1731", border: "1px solid rgba(71,85,105,0.55)", color: "#e2e8f0" } }}
      >
        <Stack spacing={1.5}>
          <Typography sx={{ fontWeight: 700, fontSize: 16 }}>Campi dettagli per Fonte + Tipo allarme</Typography>

          <Grid container spacing={1}>
            <Grid item xs={12} md={6}>
              <TextField select label="Fonte" size="small" value={cfgSourceId} onChange={(event) => setCfgSourceId(Number(event.target.value))} fullWidth sx={{ input: { color: "#e2e8f0" }, label: { color: "#94a3b8" } }}>
                {Array.from(new Map(sourceTypePairs.map((pair) => [pair.sourceId, pair.sourceName])).entries()).map(([sourceId, sourceName]) => (
                  <MenuItem key={sourceId} value={sourceId}>{sourceName}</MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField select label="Tipo allarme (nome)" size="small" value={cfgType} onChange={(event) => setCfgType(event.target.value)} fullWidth sx={{ input: { color: "#e2e8f0" }, label: { color: "#94a3b8" } }}>
                {sourceTypePairs.filter((pair) => pair.sourceId === cfgSourceId).map((pair) => (
                  <MenuItem key={`${pair.sourceId}-${pair.type}`} value={pair.type}>{pair.type}</MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>

          <Grid container spacing={0.5}>
            {availableDetailFields.map((fieldKey) => (
              <Grid item xs={12} md={6} key={fieldKey}>
                <Stack direction="row" alignItems="center" spacing={0.3}>
                  <Checkbox size="small" checked={activeCfgFields.includes(fieldKey)} onChange={() => updateDetailFieldConfig(fieldKey)} sx={{ color: "#93c5fd", p: 0.5 }} />
                  <Typography sx={{ fontSize: 12 }}>{fieldKey}</Typography>
                </Stack>
              </Grid>
            ))}
          </Grid>
        </Stack>
      </Popover>

      <Paper sx={{ borderRadius: 3, border: "1px solid rgba(148,163,184,0.24)", background: "linear-gradient(180deg, rgba(15,23,42,0.88), rgba(15,23,42,0.72))" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 44, borderBottomColor: "rgba(71,85,105,0.35)" }} />
              {tableColumns.map((column) => (
                <TableCell key={column.key} sx={{ color: "#64748b", borderBottomColor: "rgba(71,85,105,0.35)", fontWeight: 700, minWidth: column.minWidth }}>
                  <TableSortLabel active={sortBy === column.key} direction={sortBy === column.key ? sortDir : "asc"} onClick={() => toggleSort(column.key)} sx={{ color: "inherit", "& .MuiTableSortLabel-icon": { color: "#64748b !important" } }}>
                    {column.label}
                  </TableSortLabel>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredSortedRows.map((row) => {
              const tone = severityTone(row.severity);
              const rowDetailKey = detailKey(row.sourceId, row.title);
              const selectedFields = detailConfigMap[rowDetailKey] ?? Object.keys(row.parsedFields);
              const visibleFields = selectedFields.filter((key) => Object.prototype.hasOwnProperty.call(row.parsedFields, key));

              return (
                <Fragment key={row.id}>
                  <TableRow>
                    <TableCell sx={{ borderBottomColor: "rgba(71,85,105,0.25)" }}>
                      <IconButton size="small" sx={{ color: "#93c5fd" }} onClick={() => toggleRow(row.id)}>
                        {expandedRows[row.id] ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
                      </IconButton>
                    </TableCell>
                    <TableCell sx={{ borderBottomColor: "rgba(71,85,105,0.25)" }}>
                      <Chip size="small" label={row.severity.toUpperCase()} sx={{ color: tone.fg, border: `1px solid ${tone.border}`, background: tone.bg }} />
                    </TableCell>
                    <TableCell sx={{ color: "#94a3b8", borderBottomColor: "rgba(71,85,105,0.25)" }}>{new Date(row.detectedAt).toLocaleString("it-IT")}</TableCell>
                    <TableCell sx={{ color: "#e2e8f0", borderBottomColor: "rgba(71,85,105,0.25)" }}>{row.title}</TableCell>
                    <TableCell sx={{ color: "#94a3b8", borderBottomColor: "rgba(71,85,105,0.25)" }}>{row.sourceName}</TableCell>
                    <TableCell sx={{ color: "#94a3b8", borderBottomColor: "rgba(71,85,105,0.25)" }}>{row.tenantName}</TableCell>
                    <TableCell sx={{ color: "#e2e8f0", borderBottomColor: "rgba(71,85,105,0.25)" }}>{row.status}</TableCell>
                    <TableCell sx={{ color: "#94a3b8", borderBottomColor: "rgba(71,85,105,0.25)" }}>{row.eventId}</TableCell>
                  </TableRow>

                  <TableRow>
                    <TableCell sx={{ p: 0, borderBottomColor: "rgba(71,85,105,0.25)" }} colSpan={tableColumns.length + 1}>
                      <Collapse in={Boolean(expandedRows[row.id])} timeout="auto" unmountOnExit>
                        <Box sx={{ p: 1.5, bgcolor: "rgba(2,6,23,0.55)" }}>
                          <Typography sx={{ color: "#cbd5e1", fontWeight: 600, mb: 1 }}>Campi parsati</Typography>
                          <Grid container spacing={1}>
                            {visibleFields.map((fieldKey) => (
                              <Grid item xs={12} md={6} key={`${row.id}-${fieldKey}`}>
                                <Box sx={{ border: "1px solid rgba(71,85,105,0.35)", borderRadius: 1.5, px: 1, py: 0.8 }}>
                                  <Typography sx={{ color: "#64748b", fontSize: 11 }}>{fieldKey}</Typography>
                                  <Typography sx={{ color: "#e2e8f0", fontSize: 13, wordBreak: "break-word" }}>{String(row.parsedFields[fieldKey])}</Typography>
                                </Box>
                              </Grid>
                            ))}
                          </Grid>
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </Paper>
    </Stack>
  );
}
