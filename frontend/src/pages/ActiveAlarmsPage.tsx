import DownloadIcon from "@mui/icons-material/Download";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import TuneIcon from "@mui/icons-material/Tune";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  LinearProgress,
  MenuItem,
  Paper,
  Popover,
  Snackbar,
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
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import BulkActionToolbar from "../components/BulkActionToolbar";
import ExportPreviewDialog from "../components/ExportPreviewDialog";
import FilterChips, { FilterChipItem } from "../components/FilterChips";
import { useCustomer } from "../context/CustomerContext";
import {
  addAlertTag,
  assignAlert,
  bulkAlertsAction,
  changeAlertState,
  exportAlertsConfigurable,
  exportAlertsPreviewConfigurable,
  fetchAlert,
  fetchAlertDetailFieldConfigs,
  fetchAlertStates,
  fetchSourceFieldSchemas,
  fetchTags,
  fetchUsers,
  searchAlerts,
  setAlertDetailFieldConfig,
} from "../services/alertsApi";
import { surfaceCardSx } from "../styles/surfaces";
import { Alert as AlertModel, AlertDetailFieldConfig, AlertState, SearchRequest, Tag, UserSummary } from "../types/alerts";

type SortDirection = "asc" | "desc";
type AlarmColumnKey = "severity" | "timestamp" | "title" | "source" | "tenant" | "status" | "event";
type InStateOption = "" | "1h" | "24h" | "7d";
type SortItem = { key: AlarmColumnKey; dir: SortDirection };

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

const inStateLabels: Record<InStateOption, string> = {
  "": "Qualsiasi durata",
  "1h": "Più di 1h",
  "24h": "Più di 24h",
  "7d": "Più di 7gg",
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

function inStateSinceIso(option: InStateOption): string | undefined {
  if (!option) {
    return undefined;
  }
  const now = Date.now();
  const delta =
    option === "1h"
      ? 60 * 60 * 1000
      : option === "24h"
        ? 24 * 60 * 60 * 1000
        : 7 * 24 * 60 * 60 * 1000;
  return new Date(now - delta).toISOString();
}

function parseSortModel(raw: unknown): SortItem[] {
  if (!Array.isArray(raw)) {
    return [{ key: "timestamp", dir: "desc" }];
  }
  const normalized: SortItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = item as { key?: string; dir?: string };
    if (!row.key || !(row.key in sortFieldMap)) {
      continue;
    }
    const direction: SortDirection = row.dir === "asc" ? "asc" : "desc";
    if (normalized.some((entry) => entry.key === row.key)) {
      continue;
    }
    normalized.push({ key: row.key as AlarmColumnKey, dir: direction });
    if (normalized.length >= 2) {
      break;
    }
  }
  return normalized.length ? normalized : [{ key: "timestamp", dir: "desc" }];
}

function serializeFilters(payload: Record<string, unknown>): string {
  return encodeURIComponent(JSON.stringify(payload));
}

function deserializeFilters(raw: string | null): Record<string, unknown> | null {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(decodeURIComponent(raw)) as Record<string, unknown>;
  } catch {
    return null;
  }
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

export default function ActiveAlarmsPage() {
  const { selectedCustomer, selectedCustomerId } = useCustomer();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

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
  const [assigneeMe, setAssigneeMe] = useState(false);
  const [inStateOption, setInStateOption] = useState<InStateOption>("");

  const [sortModel, setSortModel] = useState<SortItem[]>([{ key: "timestamp", dir: "desc" }]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const [selectedAlertIds, setSelectedAlertIds] = useState<number[]>([]);
  const [allFilteredSelected, setAllFilteredSelected] = useState(false);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkDialog, setBulkDialog] = useState<"" | "state" | "assign" | "tag">("");
  const [selectedStateId, setSelectedStateId] = useState<number | "">("");
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<number | "">("");
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<UserSummary[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewCount, setPreviewCount] = useState(0);
  const [previewColumns, setPreviewColumns] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Array<Record<string, unknown>>>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);
  const urlInitializedRef = useRef(false);

  useEffect(() => {
    if (urlInitializedRef.current) {
      return;
    }
    urlInitializedRef.current = true;
    const parsed = deserializeFilters(searchParams.get("filter"));
    if (!parsed) {
      const assignee = searchParams.get("assignee");
      if (assignee === "me") {
        setAssigneeMe(true);
      }
      return;
    }

    const asStringArray = (value: unknown): string[] =>
      Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
    const asNumberArray = (value: unknown): number[] =>
      Array.isArray(value) ? value.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0) : [];

    setSearchText(typeof parsed.searchText === "string" ? parsed.searchText : "");
    setDescriptionFilter(typeof parsed.descriptionFilter === "string" ? parsed.descriptionFilter : "");
    setTimestampFrom(typeof parsed.timestampFrom === "string" ? parsed.timestampFrom : "");
    setTimestampTo(typeof parsed.timestampTo === "string" ? parsed.timestampTo : "");
    setSeverityFilters(
      asStringArray(parsed.severityFilters).filter(
        (item): item is AlertModel["severity"] => item === "critical" || item === "high" || item === "medium" || item === "low",
      ),
    );
    setSourceFilters(asStringArray(parsed.sourceFilters));
    setTypeFilters(asStringArray(parsed.typeFilters));
    setStateFilters(asNumberArray(parsed.stateFilters));
    setTagFilters(asNumberArray(parsed.tagFilters));
    setAssigneeMe(Boolean(parsed.assigneeMe));
    const parsedInState = typeof parsed.inStateOption === "string" ? parsed.inStateOption : "";
    setInStateOption(parsedInState === "1h" || parsedInState === "24h" || parsedInState === "7d" ? parsedInState : "");
    setSortModel(parseSortModel(parsed.sortModel));
    setPage(Number.isFinite(Number(parsed.page)) ? Math.max(0, Number(parsed.page)) : 0);
    setRowsPerPage(Number.isFinite(Number(parsed.rowsPerPage)) ? Math.max(1, Number(parsed.rowsPerPage)) : 25);
  }, [searchParams]);

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
      const [statesData, tagsData, usersData] = await Promise.all([fetchAlertStates(), fetchTags(), fetchUsers()]);
      setStates(statesData);
      setTags(tagsData);
      setAssignableUsers(usersData);
    } catch {
      // best effort; page remains usable with reduced filters
    }
  }, []);

  const loadDetailConfigs = useCallback(async () => {
    setDetailConfigLoading(true);
    setDetailConfigError(null);
    try {
      const configs = await fetchAlertDetailFieldConfigs(selectedCustomerId);
      setDetailConfigs(configs);
    } catch {
      setDetailConfigs([]);
      setDetailConfigError("Impossibile caricare la configurazione campi dettagli.");
    } finally {
      setDetailConfigLoading(false);
    }
  }, [selectedCustomerId]);

  const buildSearchPayload = useCallback(
    (targetPage: number, targetPageSize: number): SearchRequest => {
      const textQuery = [searchText.trim(), descriptionFilter.trim()].filter(Boolean).join(" ");
      const ordering = sortModel
        .map((item) => {
          const orderingField = sortFieldMap[item.key];
          return `${item.dir === "desc" ? "-" : ""}${orderingField}`;
        })
        .join(",") || "-event_timestamp";

      return {
        text: textQuery || undefined,
        source_names: sourceFilters.length ? sourceFilters : undefined,
        state_ids: stateFilters.length ? stateFilters : undefined,
        severities: severityFilters.length ? severityFilters : undefined,
        alert_types: typeFilters.length ? typeFilters : undefined,
        tag_ids: tagFilters.length ? tagFilters : undefined,
        assignee: assigneeMe ? "me" : undefined,
        in_state_since: inStateSinceIso(inStateOption),
        event_timestamp_from: toIsoOrUndefined(timestampFrom),
        event_timestamp_to: toIsoOrUndefined(timestampTo),
        ordering,
        page: targetPage,
        page_size: targetPageSize,
      };
    },
    [
      assigneeMe,
      descriptionFilter,
      inStateOption,
      searchText,
      severityFilters,
      sortModel,
      sourceFilters,
      stateFilters,
      tagFilters,
      timestampFrom,
      timestampTo,
      typeFilters,
    ],
  );

  const loadAlarms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = buildSearchPayload(page + 1, rowsPerPage);
      const response = await searchAlerts(payload, selectedCustomerId);
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
  }, [buildSearchPayload, page, rowsPerPage, selectedCustomerId]);

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
        const schema = await fetchSourceFieldSchemas(cfgSourceName, selectedCustomerId);
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
  }, [cfgSourceName, cfgType, alertDetails, selectedCustomerId]);

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
    setSelectedAlertIds([]);
    setAllFilteredSelected(false);
  }, [selectedCustomerId]);

  useEffect(() => {
    if (allFilteredSelected) {
      return;
    }
    const visibleIds = new Set(alarms.map((item) => item.id));
    setSelectedAlertIds((current) => current.filter((id) => visibleIds.has(id)));
  }, [alarms, allFilteredSelected]);

  useEffect(() => {
    if (!urlInitializedRef.current) {
      return;
    }
    const filterPayload: Record<string, unknown> = {
      searchText: searchText || undefined,
      descriptionFilter: descriptionFilter || undefined,
      timestampFrom: timestampFrom || undefined,
      timestampTo: timestampTo || undefined,
      severityFilters: severityFilters.length ? severityFilters : undefined,
      sourceFilters: sourceFilters.length ? sourceFilters : undefined,
      stateFilters: stateFilters.length ? stateFilters : undefined,
      typeFilters: typeFilters.length ? typeFilters : undefined,
      tagFilters: tagFilters.length ? tagFilters : undefined,
      assigneeMe: assigneeMe || undefined,
      inStateOption: inStateOption || undefined,
      sortModel,
      page,
      rowsPerPage,
    };
    const compactPayload = Object.fromEntries(
      Object.entries(filterPayload).filter(([, value]) => value !== undefined && value !== ""),
    );
    const hasFilters = Object.keys(compactPayload).length > 0;
    const encoded = hasFilters ? serializeFilters(compactPayload) : null;
    const inStateSince = inStateSinceIso(inStateOption);

    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (encoded) {
        next.set("filter", encoded);
      } else {
        next.delete("filter");
      }
      if (assigneeMe) {
        next.set("assignee", "me");
      } else {
        next.delete("assignee");
      }
      if (inStateSince) {
        next.set("in_state_since", inStateSince);
      } else {
        next.delete("in_state_since");
      }
      if (next.toString() === previous.toString()) {
        return previous;
      }
      return next;
    }, { replace: true });
  }, [
    assigneeMe,
    descriptionFilter,
    inStateOption,
    page,
    rowsPerPage,
    searchText,
    setSearchParams,
    severityFilters,
    sortModel,
    sourceFilters,
    stateFilters,
    tagFilters,
    timestampFrom,
    timestampTo,
    typeFilters,
  ]);

  const toggleSort = (key: AlarmColumnKey) => {
    setSortModel((current): SortItem[] => {
      const existing = current.find((item) => item.key === key);
      if (!existing) {
        return [{ key, dir: "asc" as const }, ...current].slice(0, 2);
      }
      if (existing.dir === "asc") {
        return current.map((item): SortItem => (item.key === key ? { ...item, dir: "desc" } : item));
      }
      return current.filter((item) => item.key !== key);
    });
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
    setAssigneeMe(false);
    setInStateOption("");
    setSortModel([{ key: "timestamp", dir: "desc" }]);
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
        selectedCustomerId,
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

  const exportColumns = useMemo(
    () => ["id", "title", "severity", "state", "source_name", "source_id", "event_timestamp", "tags", "assignment"],
    [],
  );

  const openExportPreview = async () => {
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewRows([]);
    setPreviewColumns([]);
    setPreviewCount(0);
    try {
      const payload = buildSearchPayload(1, rowsPerPage);
      const response = await exportAlertsPreviewConfigurable({
        ...payload,
        columns: exportColumns,
        all_results: true,
        preview: true,
        limit: 5,
      });
      setPreviewCount(response.count);
      setPreviewRows(response.rows);
      setPreviewColumns(response.columns);
    } catch {
      setPreviewError("Anteprima export non disponibile.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleExportDownload = async () => {
    setExporting(true);
    setError(null);
    try {
      const payload = buildSearchPayload(1, rowsPerPage);
      const blob = await exportAlertsConfigurable({
        ...payload,
        columns: exportColumns,
        all_results: true,
      });
      downloadCsvBlob(blob, "active-alarms.csv");
      setPreviewOpen(false);
    } catch {
      setError("Export allarmi non riuscito.");
    } finally {
      setExporting(false);
    }
  };

  const allVisibleSelected = alarms.length > 0 && alarms.every((item) => selectedAlertIds.includes(item.id));
  const hasSomeVisibleSelected = alarms.some((item) => selectedAlertIds.includes(item.id));

  const toggleSelectPage = (checked: boolean) => {
    if (checked) {
      const ids = alarms.map((item) => item.id);
      setSelectedAlertIds((current) => Array.from(new Set([...current, ...ids])));
      return;
    }
    const idsToRemove = new Set(alarms.map((item) => item.id));
    setSelectedAlertIds((current) => current.filter((id) => !idsToRemove.has(id)));
    setAllFilteredSelected(false);
  };

  const toggleSelectRow = (alertId: number, checked: boolean) => {
    setSelectedAlertIds((current) => {
      if (checked) {
        return current.includes(alertId) ? current : [...current, alertId];
      }
      return current.filter((id) => id !== alertId);
    });
    if (!checked) {
      setAllFilteredSelected(false);
    }
  };

  const clearBulkSelection = () => {
    setSelectedAlertIds([]);
    setAllFilteredSelected(false);
    setBulkDialog("");
  };

  const runBulkAction = async () => {
    if (!allFilteredSelected && !selectedAlertIds.length) {
      return;
    }
    setBulkProcessing(true);
    setError(null);
    let updated = 0;
    let errors = 0;

    try {
      if (allFilteredSelected) {
        const filters = buildSearchPayload(1, rowsPerPage);
        if (bulkDialog === "state" && selectedStateId !== "") {
          const response = await bulkAlertsAction({
            action: "change_state",
            select_all: true,
            filters,
            state_id: selectedStateId,
          });
          updated = response.updated;
          errors = response.errors;
        }
        if (bulkDialog === "assign") {
          const response = await bulkAlertsAction({
            action: "assign",
            select_all: true,
            filters,
            assigned_to_id: selectedAssigneeId === "" ? null : selectedAssigneeId,
          });
          updated = response.updated;
          errors = response.errors;
        }
        if (bulkDialog === "tag" && selectedTagIds.length) {
          const response = await bulkAlertsAction({
            action: "add_tag",
            select_all: true,
            filters,
            tag_ids: selectedTagIds,
          });
          updated = response.updated;
          errors = response.errors;
        }
      } else {
        if (bulkDialog === "state" && selectedStateId !== "") {
          const result = await Promise.allSettled(
            selectedAlertIds.map((alertId) => changeAlertState(String(alertId), selectedStateId)),
          );
          updated = result.filter((item) => item.status === "fulfilled").length;
          errors = result.length - updated;
        }
        if (bulkDialog === "assign") {
          const result = await Promise.allSettled(
            selectedAlertIds.map((alertId) => assignAlert(String(alertId), selectedAssigneeId === "" ? null : selectedAssigneeId)),
          );
          updated = result.filter((item) => item.status === "fulfilled").length;
          errors = result.length - updated;
        }
        if (bulkDialog === "tag" && selectedTagIds.length) {
          const result = await Promise.allSettled(
            selectedAlertIds.map(async (alertId) => {
              for (const tagId of selectedTagIds) {
                await addAlertTag(String(alertId), tagId);
              }
            }),
          );
          updated = result.filter((item) => item.status === "fulfilled").length;
          errors = result.length - updated;
        }
      }

      setSnackbarMessage(`${updated} alert aggiornati, ${errors} errori`);
      clearBulkSelection();
      await loadAlarms();
    } catch {
      setError("Operazione bulk non riuscita.");
    } finally {
      setBulkProcessing(false);
    }
  };

  const activeFilterChips = useMemo<FilterChipItem[]>(() => {
    const chips: FilterChipItem[] = [];
    if (searchText.trim()) {
      chips.push({ id: "searchText", label: `Ricerca: ${searchText.trim()}`, onDelete: () => setSearchText("") });
    }
    if (descriptionFilter.trim()) {
      chips.push({
        id: "descriptionFilter",
        label: `Descrizione: ${descriptionFilter.trim()}`,
        onDelete: () => setDescriptionFilter(""),
      });
    }
    if (assigneeMe) {
      chips.push({ id: "assigneeMe", label: "Assegnato a me", onDelete: () => setAssigneeMe(false) });
    }
    if (inStateOption) {
      chips.push({
        id: "inState",
        label: `Tempo in stato: ${inStateLabels[inStateOption]}`,
        onDelete: () => setInStateOption(""),
      });
    }
    severityFilters.forEach((value) =>
      chips.push({
        id: `severity-${value}`,
        label: `Severità: ${value}`,
        onDelete: () => setSeverityFilters((current) => current.filter((item) => item !== value)),
      }),
    );
    stateFilters.forEach((value) =>
      chips.push({
        id: `state-${value}`,
        label: `Stato: ${statesMap[value] ?? value}`,
        onDelete: () => setStateFilters((current) => current.filter((item) => item !== value)),
      }),
    );
    sourceFilters.forEach((value) =>
      chips.push({
        id: `source-${value}`,
        label: `Fonte: ${value}`,
        onDelete: () => setSourceFilters((current) => current.filter((item) => item !== value)),
      }),
    );
    typeFilters.forEach((value) =>
      chips.push({
        id: `type-${value}`,
        label: `Tipo: ${value}`,
        onDelete: () => setTypeFilters((current) => current.filter((item) => item !== value)),
      }),
    );
    tagFilters.forEach((value) => {
      const tag = tags.find((item) => item.id === value);
      chips.push({
        id: `tag-${value}`,
        label: `Tag: ${tag?.name ?? value}`,
        onDelete: () => setTagFilters((current) => current.filter((item) => item !== value)),
      });
    });
    return chips;
  }, [
    assigneeMe,
    descriptionFilter,
    inStateOption,
    searchText,
    severityFilters,
    sourceFilters,
    stateFilters,
    statesMap,
    tagFilters,
    tags,
    typeFilters,
  ]);

  return (
    <Stack spacing={2} sx={{ minHeight: "calc(100vh - 148px)" }}>
      {error ? <Alert severity="error">{error}</Alert> : null}

      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }} spacing={1.2}>
        <Box>
          <Typography sx={{ color: "#f8fafc", fontSize: { xs: 26, md: 34 }, fontWeight: 700 }}>Active Alarms</Typography>
          <Typography sx={{ color: "#64748b" }}>Allarmi data-driven con ricerca avanzata, filtri reali e dettagli configurabili.</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<FilterAltIcon />} sx={{ borderColor: "rgba(71,85,105,0.55)", color: "#cbd5e1" }} onClick={(event) => setFiltersAnchor(event.currentTarget)}>
            Filtri
          </Button>
          <Button variant="outlined" startIcon={<TuneIcon />} sx={{ borderColor: "rgba(71,85,105,0.55)", color: "#cbd5e1" }} onClick={(event) => setDetailCfgAnchor(event.currentTarget)}>
            Configura dettagli
          </Button>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            disabled={exporting}
            sx={{ borderColor: "rgba(71,85,105,0.55)", color: "#cbd5e1" }}
            onClick={() => void openExportPreview()}
            data-testid="export-button"
          >
            Export
          </Button>
          <Button
            variant="outlined"
            disabled={exporting}
            sx={{ borderColor: "rgba(71,85,105,0.55)", color: "#cbd5e1" }}
            onClick={() => void openExportPreview()}
          >
            Anteprima
          </Button>
          <Button
            variant="contained"
            disabled={exporting}
            onClick={() => void handleExportDownload()}
            data-testid="export-download-button"
          >
            Scarica CSV
          </Button>
        </Stack>
      </Stack>

      <Stack direction={{ xs: "column", md: "row" }} spacing={1.2}>
        <Chip label={`Allarmi: ${alarms.length}/${totalCount}`} sx={{ color: "#fca5a5", border: "1px solid rgba(248,113,113,0.4)", background: "rgba(127,29,29,0.2)" }} />
        <Chip label={`Backend search: ${searchBackend}`} sx={{ color: "#86efac", border: "1px solid rgba(74,222,128,0.35)", background: "rgba(20,83,45,0.2)" }} />
        <Chip label={`Contesto: ${selectedCustomer ? selectedCustomer.name : "tutti i clienti"}`} sx={{ color: "#93c5fd", border: "1px solid rgba(59,130,246,0.35)", background: "rgba(30,64,175,0.2)" }} />
      </Stack>

      <TextField
        placeholder="Ricerca elastic-style: titolo, event id, fonte, fingerprint, payload..."
        value={searchText}
        onChange={(event) => {
          setSearchText(event.target.value);
          setPage(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            setPage(0);
            void loadAlarms();
          }
        }}
        fullWidth
        sx={{
          input: { color: "#e2e8f0" },
          "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(148,163,184,0.24)" },
        }}
      />
      <FilterChips items={activeFilterChips} onClearAll={clearFilters} />

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
            <Typography sx={{ fontWeight: 700, fontSize: 16 }}>Filtri Active Alarms</Typography>
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

            <Grid item xs={12} md={6}>
              <Typography sx={{ color: "#94a3b8", fontSize: 12, mb: 0.5 }}>Assegnazione</Typography>
              <Chip
                label="Assegnato a me"
                size="small"
                clickable
                color={assigneeMe ? "primary" : "default"}
                data-testid="filter-assignee-me"
                onClick={() => {
                  setAssigneeMe((current) => !current);
                  setPage(0);
                }}
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                select
                label="Tempo in stato"
                size="small"
                value={inStateOption}
                onChange={(event) => {
                  const value = event.target.value as InStateOption;
                  setInStateOption(value);
                  setPage(0);
                }}
                fullWidth
                sx={{ input: { color: "#e2e8f0" }, label: { color: "#94a3b8" } }}
              >
                {(Object.keys(inStateLabels) as InStateOption[]).map((key) => (
                  <MenuItem key={key} value={key}>
                    {inStateLabels[key]}
                  </MenuItem>
                ))}
              </TextField>
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
          <Table size="small" stickyHeader data-testid="alerts-table">
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 42, borderBottomColor: "rgba(71,85,105,0.35)" }}>
                <Checkbox
                  size="small"
                  checked={allVisibleSelected}
                  indeterminate={!allVisibleSelected && hasSomeVisibleSelected}
                  onChange={(event) => toggleSelectPage(event.target.checked)}
                />
              </TableCell>
              <TableCell sx={{ width: 44, borderBottomColor: "rgba(71,85,105,0.35)" }} />
              {tableColumns.map((column) => (
                <TableCell key={column.key} sx={{ color: "#64748b", borderBottomColor: "rgba(71,85,105,0.35)", fontWeight: 700, minWidth: column.minWidth }}>
                  <TableSortLabel
                    active={sortModel.some((item) => item.key === column.key)}
                    direction={(sortModel.find((item) => item.key === column.key)?.dir ?? "asc") as SortDirection}
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
                <TableCell colSpan={tableColumns.length + 2} sx={{ color: "#94a3b8" }}>
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
                    data-testid="alert-row"
                    onClick={() => navigate(`/alerts/${row.id}`)}
                    sx={{
                      cursor: "pointer",
                      "&:nth-of-type(4n+1), &:nth-of-type(4n+2)": { backgroundColor: "rgba(15,23,42,0.3)" },
                    }}
                  >
                    <TableCell sx={{ borderBottomColor: "rgba(71,85,105,0.25)" }}>
                      <Checkbox
                        size="small"
                        checked={allFilteredSelected || selectedAlertIds.includes(row.id)}
                        data-testid="alert-checkbox"
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => toggleSelectRow(row.id, event.target.checked)}
                      />
                    </TableCell>
                    <TableCell sx={{ borderBottomColor: "rgba(71,85,105,0.25)" }}>
                      <IconButton
                        size="small"
                        sx={{ color: "#93c5fd" }}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleRow(row.id);
                        }}
                      >
                        {expandedRows[row.id] ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
                      </IconButton>
                    </TableCell>
                    <TableCell sx={{ borderBottomColor: "rgba(71,85,105,0.25)" }}>
                      <Chip size="small" label={row.severity.toUpperCase()} sx={{ color: tone.fg, border: `1px solid ${tone.border}`, background: tone.bg }} />
                    </TableCell>
                    <TableCell sx={{ color: "#94a3b8", borderBottomColor: "rgba(71,85,105,0.25)" }}>{new Date(row.event_timestamp).toLocaleString("it-IT")}</TableCell>
                    <TableCell sx={{ color: "#e2e8f0", borderBottomColor: "rgba(71,85,105,0.25)" }}>
                      <Button
                        size="small"
                        variant="text"
                        data-testid="open-alert-detail"
                        sx={{ textTransform: "none", color: "#e2e8f0", px: 0, minWidth: "auto" }}
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate(`/alerts/${row.id}`);
                        }}
                      >
                        {row.title}
                      </Button>
                    </TableCell>
                    <TableCell sx={{ color: "#94a3b8", borderBottomColor: "rgba(71,85,105,0.25)" }}>{row.source_name}</TableCell>
                    <TableCell sx={{ color: "#94a3b8", borderBottomColor: "rgba(71,85,105,0.25)" }}>{row.customer_detail?.name ?? "-"}</TableCell>
                    <TableCell sx={{ color: "#e2e8f0", borderBottomColor: "rgba(71,85,105,0.25)" }}>{statesMap[row.current_state] ?? row.current_state_detail?.name ?? "-"}</TableCell>
                    <TableCell sx={{ color: "#94a3b8", borderBottomColor: "rgba(71,85,105,0.25)" }}>{row.source_id}</TableCell>
                  </TableRow>

                  <TableRow>
                    <TableCell sx={{ p: 0, borderBottomColor: "rgba(71,85,105,0.25)" }} colSpan={tableColumns.length + 2}>
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

      <BulkActionToolbar
        selectedCount={selectedAlertIds.length}
        totalCount={totalCount}
        allFilteredSelected={allFilteredSelected}
        processing={bulkProcessing}
        onToggleAllFiltered={setAllFilteredSelected}
        onOpenChangeState={() => {
          setSelectedStateId(states[0]?.id ?? "");
          setBulkDialog("state");
        }}
        onOpenAssign={() => {
          setSelectedAssigneeId("");
          setBulkDialog("assign");
        }}
        onOpenAddTag={() => {
          setSelectedTagIds([]);
          setBulkDialog("tag");
        }}
        onClearSelection={clearBulkSelection}
      />

      <Dialog open={bulkDialog === "state"} onClose={() => setBulkDialog("")} fullWidth maxWidth="sm">
        <DialogTitle>Cambia stato alert</DialogTitle>
        <DialogContent>
          <TextField
            select
            label="Nuovo stato"
            fullWidth
            sx={{ mt: 1 }}
            data-testid="state-select"
            value={selectedStateId}
            onChange={(event) => setSelectedStateId(Number(event.target.value))}
          >
            {states.map((state) => (
              <MenuItem key={state.id} value={state.id}>
                {state.name}
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkDialog("")}>Annulla</Button>
          <Button variant="contained" type="submit" onClick={() => void runBulkAction()} disabled={bulkProcessing || selectedStateId === ""}>
            Applica
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={bulkDialog === "assign"} onClose={() => setBulkDialog("")} fullWidth maxWidth="sm">
        <DialogTitle>Assegna alert</DialogTitle>
        <DialogContent>
          <TextField
            select
            label="Utente"
            fullWidth
            sx={{ mt: 1 }}
            value={selectedAssigneeId}
            onChange={(event) => {
              const value = event.target.value;
              setSelectedAssigneeId(value === "" ? "" : Number(value));
            }}
          >
            <MenuItem value="">Non assegnato</MenuItem>
            {assignableUsers.map((user) => (
              <MenuItem key={user.id} value={user.id}>
                {user.username}
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkDialog("")}>Annulla</Button>
          <Button variant="contained" type="submit" onClick={() => void runBulkAction()} disabled={bulkProcessing}>
            Applica
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={bulkDialog === "tag"} onClose={() => setBulkDialog("")} fullWidth maxWidth="sm">
        <DialogTitle>Aggiungi tag</DialogTitle>
        <DialogContent>
          <Autocomplete
            multiple
            options={tags}
            getOptionLabel={(option) => option.name}
            value={tags.filter((tag) => selectedTagIds.includes(tag.id))}
            onChange={(_, value) => setSelectedTagIds(value.map((tag) => tag.id))}
            renderInput={(params) => <TextField {...params} label="Tag" sx={{ mt: 1 }} />}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkDialog("")}>Annulla</Button>
          <Button
            variant="contained"
            type="submit"
            onClick={() => void runBulkAction()}
            disabled={bulkProcessing || !selectedTagIds.length}
          >
            Applica
          </Button>
        </DialogActions>
      </Dialog>

      <ExportPreviewDialog
        open={previewOpen}
        loading={previewLoading || exporting}
        error={previewError}
        count={previewCount}
        columns={previewColumns}
        rows={previewRows}
        onClose={() => setPreviewOpen(false)}
        onConfirm={() => void handleExportDownload()}
      />

      <Snackbar
        open={Boolean(snackbarMessage)}
        autoHideDuration={4500}
        onClose={() => setSnackbarMessage(null)}
        message={snackbarMessage ?? ""}
        data-testid="snackbar-success"
      />
    </Stack>
  );
}
