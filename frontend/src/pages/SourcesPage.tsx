import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RefreshIcon from "@mui/icons-material/Refresh";
import ScienceIcon from "@mui/icons-material/Science";
import SaveIcon from "@mui/icons-material/Save";
import UndoIcon from "@mui/icons-material/Undo";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  Grid,
  IconButton,
  LinearProgress,
  MenuItem,
  Paper,
  Tab,
  Tabs,
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
import { useTheme } from "@mui/material/styles";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  createSource,
  fetchSourceCapabilities,
  deleteSource,
  fetchSourceErrorLog,
  fetchSourceStats,
  fetchIngestionRuns,
  fetchSources,
  runSourceNow,
  testSourceConnection,
  updateSource,
} from "../services/ingestionApi";
import MonacoDiff from "../components/MonacoDiff";
import MonacoEditor from "../components/MonacoEditor";
import ParserTestCases from "../components/ParserTestCases";
import SchedulingForm from "../components/SchedulingForm";
import {
  createParser,
  fetchParserRevisionDiff,
  fetchParserRevisions,
  fetchParsers,
  previewParser,
  previewParserConfig,
  rollbackParser,
  updateParser,
} from "../services/parserApi";
import { surfaceCardSx } from "../styles/surfaces";
import {
  IngestionRun,
  Source,
  SourceAlertTypeRule,
  SourceCapabilitiesResponse,
  SourceErrorLogEntry,
  SourceStats,
  SourceType,
  SourceTypeCapability,
  SourceWritePayload,
} from "../types/ingestion";
import {
  ParserDefinition,
  ParserPreviewResponse,
  ParserRevisionDiffResponse,
  ParserRevisionListItem,
} from "../types/parser";

type DraftAlertRule = {
  id?: number;
  alert_name: string;
  match_mode: "exact" | "contains" | "regex";
  severity: "low" | "medium" | "high" | "critical";
  is_enabled: boolean;
  notes: string;
  received_count?: number;
  last_seen_at?: string | null;
};

type SourceDraft = {
  id: number | null;
  name: string;
  description: string;
  type: SourceType;
  is_enabled: boolean;
  severityMapText: string;
  configJsonText: string;
  pollIntervalSeconds: number;
  secretsRef: string;
  webhookApiKey: string;
  rateLimitPerMinute: number;
  fingerprintFieldsText: string;
  dedupStrategy: "increment_occurrence";
  scheduleCron: string | null;
  scheduleIntervalMinutes: number | null;
  alertTypeRules: DraftAlertRule[];
};

type Notice = { severity: "success" | "error" | "info"; text: string } | null;

const severityOptions: Array<"low" | "medium" | "high" | "critical"> = ["low", "medium", "high", "critical"];
const matchModeOptions: Array<"exact" | "contains" | "regex"> = ["exact", "contains", "regex"];

const parserTemplate = `{
  "extract": [
    { "type": "jsonpath", "name": "event_id", "path": "$.event_id" },
    { "type": "jsonpath", "name": "title", "path": "$.title" },
    { "type": "jsonpath", "name": "severity", "path": "$.severity" }
  ],
  "transform": [],
  "normalize": {
    "ecs": {
      "event.id": "event_id",
      "event.summary": "title",
      "event.severity": "severity"
    }
  },
  "output": { "mode": "normalized" }
}`;

const previewPayloadTemplate = `{
  "event_id": "evt-demo-1",
  "title": "Credential dumping detected",
  "severity": "high"
}`;

function defaultConfigForType(type: SourceType): Record<string, unknown> {
  if (type === "imap") {
    return { host: "imap.example.com", port: 993, tls: true, user: "soc@example.com", pass: "CHANGEME", folder: "INBOX", search: "UNSEEN" };
  }
  if (type === "rest") {
    return { url: "https://api.vendor.example/events", method: "GET", timeout: 15, headers: {} };
  }
  return { endpoint: "https://collector.example/webhook" };
}

function safeJsonParse<T>(text: string, label: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${label} non valido: inserire JSON valido.`);
  }
}

function draftFromSource(source: Source): SourceDraft {
  return {
    id: source.id,
    name: source.name,
    description: source.description ?? "",
    type: source.type,
    is_enabled: source.is_enabled,
    severityMapText: JSON.stringify(source.severity_map ?? {}, null, 2),
    configJsonText: JSON.stringify(source.config?.config_json ?? {}, null, 2),
    pollIntervalSeconds: source.config?.poll_interval_seconds ?? 300,
    secretsRef: source.config?.secrets_ref ?? "",
    webhookApiKey: source.config?.webhook_api_key ?? "",
    rateLimitPerMinute: source.config?.rate_limit_per_minute ?? 60,
    fingerprintFieldsText: (source.dedup_policy?.fingerprint_fields ?? []).join(", "),
    dedupStrategy: source.dedup_policy?.strategy ?? "increment_occurrence",
    scheduleCron: source.schedule_cron ?? null,
    scheduleIntervalMinutes: source.schedule_interval_minutes ?? null,
    alertTypeRules: (source.alert_type_rules ?? []).map((rule: SourceAlertTypeRule) => ({
      id: rule.id,
      alert_name: rule.alert_name,
      match_mode: rule.match_mode,
      severity: rule.severity,
      is_enabled: rule.is_enabled,
      notes: rule.notes ?? "",
      received_count: rule.received_count,
      last_seen_at: rule.last_seen_at,
    })),
  };
}

function createDraft(type: SourceType = "webhook"): SourceDraft {
  return {
    id: null,
    name: "Nuova fonte globale",
    description: "",
    type,
    is_enabled: true,
    severityMapText: JSON.stringify({ field: "severity", default: "medium", map: {} }, null, 2),
    configJsonText: JSON.stringify(defaultConfigForType(type), null, 2),
    pollIntervalSeconds: 300,
    secretsRef: "",
    webhookApiKey: "",
    rateLimitPerMinute: 60,
    fingerprintFieldsText: "event_id",
    dedupStrategy: "increment_occurrence",
    scheduleCron: null,
    scheduleIntervalMinutes: null,
    alertTypeRules: [],
  };
}

function payloadFromDraft(draft: SourceDraft): SourceWritePayload {
  const severityMap = safeJsonParse<Record<string, unknown>>(draft.severityMapText, "Severity map");
  const configJson = safeJsonParse<Record<string, unknown>>(draft.configJsonText, "Config JSON");
  const fingerprintFields = draft.fingerprintFieldsText
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    type: draft.type,
    is_enabled: draft.is_enabled,
    severity_map: severityMap,
    schedule_cron: draft.scheduleCron,
    schedule_interval_minutes: draft.scheduleIntervalMinutes,
    alert_type_rules: draft.alertTypeRules.map((rule) => ({
      ...(rule.id ? { id: rule.id } : {}),
      alert_name: rule.alert_name.trim(),
      match_mode: rule.match_mode,
      severity: rule.severity,
      is_enabled: rule.is_enabled,
      notes: rule.notes.trim(),
    })),
    config: {
      config_json: configJson,
      poll_interval_seconds: draft.pollIntervalSeconds,
      secrets_ref: draft.secretsRef.trim(),
      ...(draft.webhookApiKey.trim() ? { webhook_api_key: draft.webhookApiKey.trim() } : {}),
      rate_limit_per_minute: draft.rateLimitPerMinute,
    },
    dedup_policy: {
      fingerprint_fields: fingerprintFields,
      strategy: draft.dedupStrategy,
    },
  };
}

function formatRunTimestamp(run: IngestionRun): string {
  return new Date(run.started_at).toLocaleString("it-IT");
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("it-IT").format(value);
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) {
    return "-";
  }
  return `${seconds.toFixed(1)} s`;
}

function runStatusLabel(status: SourceStats["last_run_status"]): string {
  if (status === "success") return "Ultimo run OK";
  if (status === "partial") return "Ultimo run parziale";
  if (status === "error") return "Ultimo run in errore";
  return "Nessun run";
}

export default function SourcesPage() {
  const theme = useTheme();
  const [sources, setSources] = useState<Source[]>([]);
  const [capabilities, setCapabilities] = useState<SourceCapabilitiesResponse | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<number | null>(null);
  const [draft, setDraft] = useState<SourceDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [sourceSearch, setSourceSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState<"all" | "global" | "customer">("all");

  const [runs, setRuns] = useState<IngestionRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [sourceStatsById, setSourceStatsById] = useState<Record<number, SourceStats>>({});
  const [statsLoading, setStatsLoading] = useState(false);
  const [sourceErrorLog, setSourceErrorLog] = useState<SourceErrorLogEntry[]>([]);
  const [errorLogLoading, setErrorLogLoading] = useState(false);
  const [expandedErrorRunIds, setExpandedErrorRunIds] = useState<number[]>([]);
  const [insightTab, setInsightTab] = useState(0);

  const [parserLoading, setParserLoading] = useState(false);
  const [parserSaving, setParserSaving] = useState(false);
  const [parserDefinition, setParserDefinition] = useState<ParserDefinition | null>(null);
  const [parserRevisions, setParserRevisions] = useState<ParserRevisionListItem[]>([]);
  const [selectedRevisionIds, setSelectedRevisionIds] = useState<number[]>([]);
  const [revisionDiff, setRevisionDiff] = useState<ParserRevisionDiffResponse | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [parserName, setParserName] = useState("");
  const [parserDescription, setParserDescription] = useState("");
  const [parserConfigText, setParserConfigText] = useState(parserTemplate);
  const [previewRawText, setPreviewRawText] = useState(previewPayloadTemplate);
  const [previewResult, setPreviewResult] = useState<ParserPreviewResponse | null>(null);

  const selectedSource = useMemo(
    () => sources.find((item) => item.id === selectedSourceId) ?? null,
    [sources, selectedSourceId],
  );
  const visibleSources = useMemo(() => {
    const term = sourceSearch.trim().toLowerCase();
    return sources.filter((source) => {
      if (scopeFilter === "global" && source.customer !== null) {
        return false;
      }
      if (scopeFilter === "customer" && source.customer === null) {
        return false;
      }
      if (!term) {
        return true;
      }
      return (
        source.name.toLowerCase().includes(term) ||
        source.type.toLowerCase().includes(term) ||
        (source.customer_name ?? "").toLowerCase().includes(term)
      );
    });
  }, [scopeFilter, sourceSearch, sources]);

  const capabilitiesByType = useMemo(() => {
    const matrix = new Map<SourceType, SourceTypeCapability>();
    for (const item of capabilities?.types ?? []) {
      matrix.set(item.type, item);
    }
    return matrix;
  }, [capabilities]);

  const createableTypeOptions = useMemo(
    () => (capabilities?.types ?? []).filter((item) => item.create_enabled),
    [capabilities],
  );
  const sourceTypeSelectOptions = useMemo(() => {
    if (!draft) {
      return createableTypeOptions;
    }
    const current = capabilitiesByType.get(draft.type);
    if (!current) {
      return createableTypeOptions;
    }
    if (createableTypeOptions.some((item) => item.type === current.type)) {
      return createableTypeOptions;
    }
    return [current, ...createableTypeOptions];
  }, [draft, createableTypeOptions, capabilitiesByType]);
  const selectedSourceCapability = useMemo(
    () => (selectedSource ? capabilitiesByType.get(selectedSource.type) ?? null : null),
    [selectedSource, capabilitiesByType],
  );
  const selectedSourceStats = useMemo(
    () => (selectedSource ? sourceStatsById[selectedSource.id] ?? null : null),
    [selectedSource, sourceStatsById],
  );
  const recentRuns = useMemo(() => runs.slice(0, 5), [runs]);
  const statsChartData = useMemo(() => {
    const threshold = Date.now() - 14 * 24 * 60 * 60 * 1000;
    return runs
      .filter((run) => new Date(run.started_at).getTime() >= threshold)
      .slice()
      .reverse()
      .map((run) => ({
        id: run.id,
        startedAt: new Date(run.started_at).toLocaleString("it-IT", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }),
        records: run.processed_count,
      }));
  }, [runs]);

  const hydrateParser = useCallback((parser: ParserDefinition | null, sourceName: string) => {
    setParserDefinition(parser);
    setParserRevisions([]);
    setSelectedRevisionIds([]);
    setRevisionDiff(null);
    setPreviewResult(null);
    if (!parser) {
      setParserName(sourceName ? `${sourceName} Parser` : "Parser Sorgente");
      setParserDescription("Parser key:value con revisioni");
      setParserConfigText(parserTemplate);
      return;
    }
    setParserName(parser.name);
    setParserDescription(parser.description || "");
    setParserConfigText(parser.active_config_text || parserTemplate);
  }, []);

  const loadCapabilities = useCallback(async () => {
    try {
      const data = await fetchSourceCapabilities();
      setCapabilities(data);
    } catch {
      setCapabilities(null);
      setNotice({ severity: "error", text: "Impossibile caricare i metadati dei tipi fonte." });
    }
  }, []);

  const loadStatsForSources = useCallback(async (items: Source[]) => {
    if (!items.length) {
      setSourceStatsById({});
      return;
    }
    setStatsLoading(true);
    try {
      const settled = await Promise.allSettled(
        items.map(async (item) => ({ id: item.id, stats: await fetchSourceStats(item.id) })),
      );
      const next: Record<number, SourceStats> = {};
      settled.forEach((result) => {
        if (result.status === "fulfilled") {
          next[result.value.id] = result.value.stats;
        }
      });
      setSourceStatsById(next);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadSourcesData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSources({ scope: "all" });
      setSources(data);
      void loadStatsForSources(data);
      setNotice(null);
      setSelectedSourceId((current) => {
        if (current && data.some((item) => item.id === current)) {
          return current;
        }
        return data.length ? data[0].id : null;
      });
    } catch {
      setSources([]);
      setSourceStatsById({});
      setSelectedSourceId(null);
      setNotice({ severity: "error", text: "Impossibile caricare le fonti globali." });
    } finally {
      setLoading(false);
    }
  }, [loadStatsForSources]);

  useEffect(() => {
    void loadCapabilities();
    void loadSourcesData();
  }, [loadCapabilities, loadSourcesData]);

  useEffect(() => {
    if (!selectedSource) {
      setDraft(null);
      return;
    }
    setDraft(draftFromSource(selectedSource));
  }, [selectedSource]);

  const loadRuns = useCallback(async (sourceId: number) => {
    setRunsLoading(true);
    try {
      const data = await fetchIngestionRuns(sourceId);
      setRuns(data);
    } catch {
      setRuns([]);
    } finally {
      setRunsLoading(false);
    }
  }, []);

  const loadErrorLog = useCallback(async (sourceId: number) => {
    setErrorLogLoading(true);
    setExpandedErrorRunIds([]);
    try {
      const data = await fetchSourceErrorLog(sourceId);
      setSourceErrorLog(data);
    } catch {
      setSourceErrorLog([]);
    } finally {
      setErrorLogLoading(false);
    }
  }, []);

  const loadParserForSource = useCallback(
    async (sourceId: number, sourceName: string) => {
      setParserLoading(true);
      try {
        const parsers = await fetchParsers(sourceId);
        const parser = parsers[0] ?? null;
        hydrateParser(parser, sourceName);
        if (parser) {
          const revisions = await fetchParserRevisions(parser.id);
          setParserRevisions(revisions);
        }
      } catch {
        hydrateParser(null, sourceName);
      } finally {
        setParserLoading(false);
      }
    },
    [hydrateParser],
  );

  useEffect(() => {
    if (!selectedSource) {
      setRuns([]);
      setSourceErrorLog([]);
      setExpandedErrorRunIds([]);
      setInsightTab(0);
      hydrateParser(null, "");
      return;
    }
    void loadRuns(selectedSource.id);
    void loadErrorLog(selectedSource.id);
    void loadParserForSource(selectedSource.id, selectedSource.name);
  }, [selectedSource, loadRuns, loadErrorLog, loadParserForSource, hydrateParser]);

  const saveSource = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const payload = payloadFromDraft(draft);
      if (!payload.name) {
        throw new Error("Nome fonte obbligatorio.");
      }
      if (draft.id) {
        const updated = await updateSource(draft.id, payload);
        setNotice({ severity: "success", text: `Fonte aggiornata: ${updated.name}` });
        await loadSourcesData();
        setSelectedSourceId(updated.id);
      } else {
        const created = await createSource(payload);
        setNotice({ severity: "success", text: `Fonte creata: ${created.name}` });
        await loadSourcesData();
        setSelectedSourceId(created.id);
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : "Salvataggio fonte non riuscito.";
      setNotice({ severity: "error", text });
    } finally {
      setSaving(false);
    }
  };

  const createNewSource = () => {
    const defaultType = createableTypeOptions[0]?.type ?? "webhook";
    const next = createDraft(defaultType);
    setSelectedSourceId(null);
    setDraft(next);
    hydrateParser(null, next.name);
  };

  const removeSelectedSource = async () => {
    if (!draft?.id) return;
    try {
      await deleteSource(draft.id);
      setNotice({ severity: "success", text: "Fonte eliminata." });
      await loadSourcesData();
    } catch {
      setNotice({ severity: "error", text: "Eliminazione fonte non riuscita." });
    }
  };

  const executeTestConnection = async () => {
    if (!draft?.id) {
      setNotice({ severity: "info", text: "Salva prima la fonte, poi esegui il test connessione." });
      return;
    }
    setNotice({ severity: "info", text: "Test connessione in corso..." });
    try {
      const result = await testSourceConnection(draft.id);
      setNotice({ severity: result.ok ? "success" : "error", text: `Test connessione: ${result.detail}` });
      await loadSourcesData();
    } catch {
      setNotice({ severity: "error", text: "Test connessione non riuscito." });
    }
  };

  const executeRunNow = async () => {
    if (!draft?.id) {
      setNotice({ severity: "info", text: "Salva prima la fonte, poi avvia run now." });
      return;
    }
    try {
      const result = await runSourceNow(draft.id);
      setNotice({ severity: "success", text: `${result.detail} (task ${result.task_id})` });
      await loadRuns(draft.id);
      await loadSourcesData();
    } catch {
      setNotice({ severity: "error", text: "Run now non disponibile o non riuscito per questa fonte." });
    }
  };

  const saveParserWorkflow = async () => {
    if (!draft?.id) return;
    setParserSaving(true);
    try {
      if (parserDefinition) {
        const updated = await updateParser(parserDefinition.id, {
          name: parserName.trim(),
          description: parserDescription.trim(),
          is_enabled: true,
          config_text: parserConfigText,
        });
        hydrateParser(updated, draft.name);
        const revisions = await fetchParserRevisions(updated.id);
        setParserRevisions(revisions);
      } else {
        const created = await createParser({
          source: draft.id,
          name: parserName.trim() || `${draft.name} Parser`,
          description: parserDescription.trim(),
          is_enabled: true,
          config_text: parserConfigText,
        });
        hydrateParser(created, draft.name);
        const revisions = await fetchParserRevisions(created.id);
        setParserRevisions(revisions);
      }
      setNotice({ severity: "success", text: "Parser salvato con nuova revisione." });
      await loadSourcesData();
    } catch (error) {
      const text = error instanceof Error ? error.message : "Salvataggio parser non riuscito.";
      setNotice({ severity: "error", text });
    } finally {
      setParserSaving(false);
    }
  };

  const previewParserWorkflow = async () => {
    try {
      const result = parserDefinition
        ? await previewParser(
            parserDefinition.id,
            safeJsonParse<Record<string, unknown>>(previewPayloadTemplate, "Raw payload preview"),
            parserConfigText,
            previewRawText.trim() ? previewRawText : undefined,
          )
        : await previewParserConfig(
            parserConfigText,
            previewRawText.trim()
              ? (() => {
                  try {
                    return safeJsonParse<Record<string, unknown>>(previewRawText, "Raw payload preview");
                  } catch {
                    return { message: previewRawText };
                  }
                })()
              : {},
          );
      setPreviewResult(result);
      setNotice({ severity: "success", text: "Preview parser completata." });
    } catch (error) {
      const text = error instanceof Error ? error.message : "Preview parser non riuscita.";
      setNotice({ severity: "error", text });
      setPreviewResult({
        ok: false,
        parsed_payload: { error: text },
        field_schema: [],
        detail: text,
        errors: [text],
      });
    }
  };

  const rollbackParserWorkflow = async (revisionId: number) => {
    if (!parserDefinition) return;
    setParserSaving(true);
    try {
      const updated = await rollbackParser(parserDefinition.id, revisionId);
      hydrateParser(updated, draft?.name ?? "");
      const revisions = await fetchParserRevisions(updated.id);
      setParserRevisions(revisions);
      setNotice({ severity: "success", text: "Rollback parser completato." });
    } catch {
      setNotice({ severity: "error", text: "Rollback parser non riuscito." });
    } finally {
      setParserSaving(false);
    }
  };

  const toggleRevisionSelection = (revisionId: number) => {
    setSelectedRevisionIds((current) => {
      if (current.includes(revisionId)) {
        return current.filter((item) => item !== revisionId);
      }
      if (current.length >= 2) {
        return [current[1], revisionId];
      }
      return [...current, revisionId];
    });
  };

  const compareSelectedRevisions = async () => {
    if (!parserDefinition || selectedRevisionIds.length !== 2) {
      return;
    }
    const [leftRevisionId, rightRevisionId] = selectedRevisionIds;
    setDiffLoading(true);
    try {
      const diffPayload = await fetchParserRevisionDiff(parserDefinition.id, leftRevisionId, rightRevisionId);
      setRevisionDiff(diffPayload);
    } catch {
      setNotice({ severity: "error", text: "Confronto revisioni non riuscito." });
      setRevisionDiff(null);
    } finally {
      setDiffLoading(false);
    }
  };

  const updateDraft = (partial: Partial<SourceDraft>) => {
    setDraft((current) => (current ? { ...current, ...partial } : current));
  };

  const addAlertRule = () => {
    updateDraft({
      alertTypeRules: [
        ...(draft?.alertTypeRules ?? []),
        {
          alert_name: "New alert type",
          match_mode: "exact",
          severity: "medium",
          is_enabled: true,
          notes: "",
        },
      ],
    });
  };

  const updateAlertRule = (index: number, patch: Partial<DraftAlertRule>) => {
    if (!draft) return;
    const next = [...draft.alertTypeRules];
    next[index] = { ...next[index], ...patch };
    updateDraft({ alertTypeRules: next });
  };

  const removeAlertRule = (index: number) => {
    if (!draft) return;
    updateDraft({ alertTypeRules: draft.alertTypeRules.filter((_, idx) => idx !== index) });
  };

  const toggleErrorRow = (runId: number) => {
    setExpandedErrorRunIds((current) =>
      current.includes(runId) ? current.filter((item) => item !== runId) : [...current, runId],
    );
  };

  return (
    <Stack spacing={2} sx={{ minHeight: "calc(100vh - 148px)" }}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }} spacing={1.5}>
        <Box>
          <Typography sx={{ color: "#f8fafc", fontSize: { xs: 26, md: 34 }, fontWeight: 700 }}>Fonti</Typography>
          <Typography sx={{ color: "#64748b" }}>
            Panoramica completa delle fonti configurate con possibilita di aggiunta e modifica.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => void loadSourcesData()} sx={{ borderColor: "rgba(71,85,105,0.55)", color: "#cbd5e1" }}>
            Refresh
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={createNewSource} sx={{ background: "linear-gradient(180deg,#3b82f6,#1d4ed8)" }}>
            Nuova Fonte
          </Button>
        </Stack>
      </Stack>

      {notice ? <Alert severity={notice.severity} data-testid="connection-result">{notice.text}</Alert> : null}

      <Paper sx={{ ...surfaceCardSx, p: 1.4 }}>
        <Stack direction={{ xs: "column", lg: "row" }} spacing={1.2} justifyContent="space-between" alignItems={{ xs: "flex-start", lg: "center" }}>
          <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap">
            <Chip label={`Fonti totali: ${sources.length}`} sx={{ color: "#bfdbfe", border: "1px solid rgba(59,130,246,0.35)", background: "rgba(30,64,175,0.16)" }} />
            <Chip label={`Globali: ${sources.filter((item) => item.customer === null).length}`} sx={{ color: "#86efac", border: "1px solid rgba(34,197,94,0.35)", background: "rgba(20,83,45,0.16)" }} />
            <Chip label={`Cliente-specifiche: ${sources.filter((item) => item.customer !== null).length}`} sx={{ color: "#fcd34d", border: "1px solid rgba(234,179,8,0.35)", background: "rgba(113,63,18,0.16)" }} />
          </Stack>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
            <TextField
              size="small"
              placeholder="Filtra fonti (nome, tipo, cliente)"
              value={sourceSearch}
              onChange={(event) => setSourceSearch(event.target.value)}
              sx={{ minWidth: { xs: 240, md: 320 } }}
            />
            <TextField select size="small" value={scopeFilter} onChange={(event) => setScopeFilter(event.target.value as "all" | "global" | "customer")} sx={{ minWidth: 170 }}>
              <MenuItem value="all">Tutte</MenuItem>
              <MenuItem value="global">Solo globali</MenuItem>
              <MenuItem value="customer">Solo cliente</MenuItem>
            </TextField>
          </Stack>
        </Stack>
      </Paper>

      <Grid container spacing={2}>
        <Grid item xs={12} md={4} lg={3}>
          <Paper sx={{ ...surfaceCardSx, p: 1.2, height: "100%" }} data-testid="sources-list">
            {loading || statsLoading ? <LinearProgress sx={{ mb: 1 }} /> : null}
            <Stack spacing={1} sx={{ maxHeight: { xs: 320, md: 680 }, overflowY: "auto", pr: 0.5 }}>
              {loading && visibleSources.length === 0 ? (
                <Box
                  data-testid="parser-item"
                  sx={{ p: 1.1, borderRadius: 1.5, border: "1px solid var(--border-subtle)", bgcolor: "var(--surface-3)" }}
                >
                  <Box data-testid="source-item">
                    <Typography sx={{ color: "#94a3b8", fontSize: 13 }}>Caricamento fonti...</Typography>
                  </Box>
                </Box>
              ) : null}
              {visibleSources.map((source) => {
                const stats = sourceStatsById[source.id];
                const statusColor =
                  stats?.last_run_status === "success"
                    ? theme.palette.success.main
                    : stats?.last_run_status === "partial"
                      ? theme.palette.warning.main
                      : stats?.last_run_status === "error"
                        ? theme.palette.error.main
                        : theme.palette.grey[500];
                return (
                  <Box
                    key={source.id}
                    data-testid="parser-item"
                    onClick={() => setSelectedSourceId(source.id)}
                    sx={{
                      p: 1.1,
                      borderRadius: 1.5,
                      border: source.id === selectedSourceId ? "1px solid rgba(59,130,246,0.6)" : "1px solid var(--border-subtle)",
                      bgcolor: source.id === selectedSourceId ? "rgba(59,130,246,0.12)" : "var(--surface-3)",
                      cursor: "pointer",
                    }}
                  >
                    <Box data-testid="source-item">
                      <Typography sx={{ color: "#e2e8f0", fontWeight: 600 }}>{source.name}</Typography>
                    <Typography sx={{ color: "#64748b", fontSize: 12 }}>
                      {source.description || "Nessuna descrizione"}
                    </Typography>
                    <Stack direction="row" spacing={0.6} sx={{ mt: 0.7 }} useFlexGap flexWrap="wrap">
                      <Chip
                        size="small"
                        label={source.customer === null ? "Globale" : `Cliente: ${source.customer_name ?? source.customer}`}
                        sx={{
                          color: source.customer === null ? "#86efac" : "#fcd34d",
                          border: source.customer === null ? "1px solid rgba(34,197,94,0.35)" : "1px solid rgba(234,179,8,0.35)",
                        }}
                      />
                      <Chip
                        size="small"
                        label={capabilitiesByType.get(source.type)?.label ?? source.type}
                        sx={{ color: "#93c5fd", border: "1px solid rgba(59,130,246,0.35)" }}
                      />
                      <Chip size="small" label={source.is_enabled ? "enabled" : "disabled"} sx={{ color: source.is_enabled ? "#86efac" : "#fca5a5", border: "1px solid rgba(148,163,184,0.24)" }} />
                      <Chip
                        size="small"
                        label={runStatusLabel(stats?.last_run_status ?? null)}
                        icon={<Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: statusColor }} />}
                        sx={{ color: "#cbd5f5", border: "1px solid rgba(148,163,184,0.24)" }}
                      />
                      <Chip
                        size="small"
                        label={`${formatInteger(stats?.records_today ?? 0)} record oggi`}
                        data-testid="records-today-badge"
                        sx={{ color: "#93c5fd", border: "1px solid rgba(59,130,246,0.35)" }}
                      />
                      {stats?.last_run_status === "error" ? (
                        <Chip
                          size="small"
                          color="error"
                          label="Errore ultimo run"
                          sx={{ border: "1px solid rgba(220,38,38,0.4)" }}
                        />
                      ) : null}
                    </Stack>
                    </Box>
                  </Box>
                );
              })}
              {!visibleSources.length && !loading ? <Typography sx={{ color: "#64748b" }}>Nessuna fonte configurata per il filtro selezionato.</Typography> : null}
            </Stack>
          </Paper>
        </Grid>

        <Grid item xs={12} md={8} lg={9}>
          <Stack spacing={2}>
            <Paper sx={{ ...surfaceCardSx, p: 1.5 }} data-testid="source-detail">
              <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={1} sx={{ mb: 1.2 }}>
                <Typography sx={{ color: "#e2e8f0", fontWeight: 700 }}>Source Configuration</Typography>
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    startIcon={<ScienceIcon />}
                    onClick={() => void executeTestConnection()}
                    data-testid="test-connection-button"
                  >
                    Test connessione
                  </Button>
                  <Button
                    size="small"
                    startIcon={<PlayArrowIcon />}
                    disabled={draft?.id ? selectedSourceCapability?.supports_run_now === false : false}
                    onClick={() => void executeRunNow()}
                  >
                    Run now
                  </Button>
                  <Button size="small" startIcon={<SaveIcon />} disabled={!draft || saving} onClick={() => void saveSource()}>
                    Salva
                  </Button>
                  <Button size="small" color="error" startIcon={<DeleteIcon />} disabled={!draft?.id} onClick={() => void removeSelectedSource()}>
                    Elimina
                  </Button>
                </Stack>
              </Stack>
              {selectedSourceStats ? (
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 1.2 }}>
                  <Chip
                    size="small"
                    label={`Run oggi: ${selectedSourceStats.runs_today}`}
                    sx={{ color: "#bfdbfe", border: "1px solid rgba(59,130,246,0.35)" }}
                  />
                  <Chip
                    size="small"
                    label={`Record oggi: ${formatInteger(selectedSourceStats.records_today)}`}
                    sx={{ color: "#93c5fd", border: "1px solid rgba(59,130,246,0.35)" }}
                  />
                  <Chip
                    size="small"
                    label={`Error rate 7gg: ${(selectedSourceStats.error_rate_7d * 100).toFixed(1)}%`}
                    sx={{ color: "#fcd34d", border: "1px solid rgba(234,179,8,0.35)" }}
                  />
                  <Chip
                    size="small"
                    label={`Durata media: ${formatDuration(selectedSourceStats.avg_duration_seconds)}`}
                    sx={{ color: "#c4b5fd", border: "1px solid rgba(139,92,246,0.35)" }}
                  />
                </Stack>
              ) : null}

              {!draft ? (
                <Alert severity="info">Seleziona o crea una fonte globale.</Alert>
              ) : (
                <Grid container spacing={1.2}>
                  <Grid item xs={12} md={6}>
                    <TextField fullWidth label="Nome fonte" value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      select
                      fullWidth
                      label="Tipo fonte"
                      value={draft.type}
                      onChange={(event) => {
                        const nextType = event.target.value as SourceType;
                        const supportsSchedule = nextType === "imap" || nextType === "rest";
                        updateDraft({
                          type: nextType,
                          configJsonText: JSON.stringify(defaultConfigForType(nextType), null, 2),
                          ...(supportsSchedule ? {} : { scheduleCron: null, scheduleIntervalMinutes: null }),
                        });
                      }}
                    >
                      {sourceTypeSelectOptions.map((option) => (
                        <MenuItem key={option.type} value={option.type} disabled={!option.create_enabled}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid item xs={12}>
                    <TextField fullWidth label="Descrizione" value={draft.description} onChange={(event) => updateDraft({ description: event.target.value })} />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <TextField
                      type="number"
                      fullWidth
                      label="Poll interval (sec)"
                      value={draft.pollIntervalSeconds}
                      onChange={(event) => updateDraft({ pollIntervalSeconds: Number(event.target.value) || 1 })}
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <TextField
                      type="number"
                      fullWidth
                      label="Rate limit / min"
                      value={draft.rateLimitPerMinute}
                      onChange={(event) => updateDraft({ rateLimitPerMinute: Number(event.target.value) || 1 })}
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ height: "100%" }}>
                      <Typography sx={{ color: "#e2e8f0" }}>Fonte attiva</Typography>
                      <Switch checked={draft.is_enabled} onChange={(event) => updateDraft({ is_enabled: event.target.checked })} />
                    </Stack>
                  </Grid>
                  <Grid item xs={12}>
                    <Box data-testid="scheduling-section">
                      <SchedulingForm
                        sourceType={draft.type}
                        scheduleCron={draft.scheduleCron}
                        scheduleIntervalMinutes={draft.scheduleIntervalMinutes}
                        onChange={(next) =>
                          updateDraft({
                            scheduleCron: next.schedule_cron,
                            scheduleIntervalMinutes: next.schedule_interval_minutes,
                          })
                        }
                      />
                    </Box>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField fullWidth label="Secrets ref" value={draft.secretsRef} onChange={(event) => updateDraft({ secretsRef: event.target.value })} />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField fullWidth label="Webhook API key (override)" value={draft.webhookApiKey} onChange={(event) => updateDraft({ webhookApiKey: event.target.value })} />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Dedup fields (comma-separated)"
                      value={draft.fingerprintFieldsText}
                      onChange={(event) => updateDraft({ fingerprintFieldsText: event.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField fullWidth label="Dedup strategy" value={draft.dedupStrategy} disabled />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      multiline
                      minRows={6}
                      label="Severity map JSON"
                      value={draft.severityMapText}
                      onChange={(event) => updateDraft({ severityMapText: event.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      multiline
                      minRows={6}
                      label="Type-specific config JSON"
                      value={draft.configJsonText}
                      onChange={(event) => updateDraft({ configJsonText: event.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <Typography sx={{ color: "#94a3b8", fontSize: 12 }}>
                      Health attuale: {selectedSource?.config?.status ?? "never"} | Last success: {selectedSource?.config?.last_success ?? "-"} | Last error: {selectedSource?.config?.last_error || "-"}
                    </Typography>
                    {selectedSourceCapability ? (
                      <Typography sx={{ color: "#94a3b8", fontSize: 12 }}>
                        Tipo fonte: {selectedSourceCapability.label}
                      </Typography>
                    ) : null}
                    {selectedSource?.webhook_endpoint ? (
                      <Typography sx={{ color: "#94a3b8", fontSize: 12 }}>Webhook endpoint: {selectedSource.webhook_endpoint}</Typography>
                    ) : null}
                  </Grid>
                </Grid>
              )}
            </Paper>

            <Paper sx={{ ...surfaceCardSx, p: 1.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography sx={{ color: "#e2e8f0", fontWeight: 700 }}>Catalogo tipi allarme per fonte</Typography>
                <Button size="small" startIcon={<AddIcon />} disabled={!draft} onClick={addAlertRule}>
                  Aggiungi regola
                </Button>
              </Stack>
              {!draft ? (
                <Alert severity="info">Seleziona una fonte per gestire il catalogo.</Alert>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ color: "#94a3b8" }}>Nome tipo</TableCell>
                      <TableCell sx={{ color: "#94a3b8" }}>Match</TableCell>
                      <TableCell sx={{ color: "#94a3b8" }}>Severity</TableCell>
                      <TableCell sx={{ color: "#94a3b8" }}>Attiva</TableCell>
                      <TableCell sx={{ color: "#94a3b8" }}>Count</TableCell>
                      <TableCell sx={{ color: "#94a3b8" }}>Ultimo evento</TableCell>
                      <TableCell sx={{ color: "#94a3b8" }}>Note</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {draft.alertTypeRules.map((rule, index) => (
                      <TableRow key={`${rule.id ?? "new"}-${index}`}>
                        <TableCell>
                          <TextField size="small" value={rule.alert_name} onChange={(event) => updateAlertRule(index, { alert_name: event.target.value })} />
                        </TableCell>
                        <TableCell>
                          <TextField
                            size="small"
                            select
                            value={rule.match_mode}
                            onChange={(event) => updateAlertRule(index, { match_mode: event.target.value as DraftAlertRule["match_mode"] })}
                          >
                            {matchModeOptions.map((option) => (
                              <MenuItem key={option} value={option}>
                                {option}
                              </MenuItem>
                            ))}
                          </TextField>
                        </TableCell>
                        <TableCell>
                          <TextField
                            size="small"
                            select
                            value={rule.severity}
                            onChange={(event) => updateAlertRule(index, { severity: event.target.value as DraftAlertRule["severity"] })}
                          >
                            {severityOptions.map((option) => (
                              <MenuItem key={option} value={option}>
                                {option}
                              </MenuItem>
                            ))}
                          </TextField>
                        </TableCell>
                        <TableCell>
                          <Switch checked={rule.is_enabled} onChange={(event) => updateAlertRule(index, { is_enabled: event.target.checked })} />
                        </TableCell>
                        <TableCell sx={{ color: "#cbd5e1" }}>{rule.received_count ?? 0}</TableCell>
                        <TableCell sx={{ color: "#94a3b8" }}>{rule.last_seen_at ? new Date(rule.last_seen_at).toLocaleString("it-IT") : "-"}</TableCell>
                        <TableCell>
                          <TextField size="small" value={rule.notes} onChange={(event) => updateAlertRule(index, { notes: event.target.value })} />
                        </TableCell>
                        <TableCell>
                          <IconButton size="small" color="error" onClick={() => removeAlertRule(index)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!draft.alertTypeRules.length ? (
                      <TableRow>
                        <TableCell colSpan={8} sx={{ color: "#64748b" }}>
                          Nessuna regola configurata. Le nuove tipologie vengono censite automaticamente in ingestion.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              )}
            </Paper>

            <Paper sx={{ ...surfaceCardSx, p: 1.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography sx={{ color: "#e2e8f0", fontWeight: 700 }}>Parser key:value con revisioni</Typography>
                <Stack direction="row" spacing={1}>
                  <Button size="small" onClick={() => void previewParserWorkflow()} data-testid="preview-button">
                    Preview
                  </Button>
                  <Button size="small" startIcon={<SaveIcon />} disabled={!draft?.id || parserSaving} onClick={() => void saveParserWorkflow()}>
                    Salva revisione
                  </Button>
                </Stack>
              </Stack>
              <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                <Button size="small" data-testid="revisions-tab">
                  Storia Revisioni
                </Button>
                <Button size="small" data-testid="test-cases-tab">
                  Test Cases
                </Button>
              </Stack>
              {parserLoading ? <LinearProgress sx={{ mb: 1 }} /> : null}
              <Grid container spacing={1.2}>
                <Grid item xs={12} md={6}>
                  <TextField fullWidth label="Nome parser" value={parserName} onChange={(event) => setParserName(event.target.value)} />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField fullWidth label="Descrizione" value={parserDescription} onChange={(event) => setParserDescription(event.target.value)} />
                </Grid>
                <Grid item xs={12} md={6}>
                  <MonacoEditor
                    label="Config parser (JSON)"
                    value={parserConfigText}
                    onChange={setParserConfigText}
                    language="json"
                    onSave={() => {
                      void saveParserWorkflow();
                    }}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    multiline
                    minRows={8}
                    label="Incolla un evento reale (testo/JSON)"
                    value={previewRawText}
                    inputProps={{ "data-testid": "custom-event-input" }}
                    onChange={(event) => setPreviewRawText(event.target.value)}
                  />
                </Grid>
              </Grid>

              {previewResult ? (
                <Box sx={{ mt: 1.2 }} data-testid="preview-result">
                  <Typography sx={{ color: "#94a3b8", fontSize: 12 }}>Output preview</Typography>
                  <Paper sx={{ p: 1, bgcolor: "rgba(2,6,23,0.45)", border: "1px solid rgba(71,85,105,0.35)" }}>
                    <Typography component="pre" sx={{ m: 0, color: "#cbd5e1", fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      {JSON.stringify(previewResult.parsed_payload, null, 2)}
                    </Typography>
                  </Paper>
                </Box>
              ) : null}

              <Divider sx={{ my: 1.2 }} />
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.8 }}>
                <Typography sx={{ color: "#e2e8f0", fontWeight: 600 }}>Revisioni parser</Typography>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={selectedRevisionIds.length !== 2 || diffLoading || !parserDefinition}
                  onClick={() => {
                    void compareSelectedRevisions();
                  }}
                >
                  Confronta
                </Button>
              </Stack>
              <Stack spacing={0.8} data-testid="revisions-list">
                {parserRevisions.map((revision) => (
                  <Stack key={revision.revision_id} direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }} sx={{ p: 0.8, borderRadius: 1.3, border: "1px solid rgba(71,85,105,0.35)" }}>
                    <Typography sx={{ color: "#94a3b8", fontSize: 12 }}>
                      v{revision.version} - {new Date(revision.created_at).toLocaleString("it-IT")} - {revision.created_by?.username || "system"}
                    </Typography>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Checkbox
                        size="small"
                        checked={selectedRevisionIds.includes(revision.revision_id)}
                        onChange={() => toggleRevisionSelection(revision.revision_id)}
                      />
                      {parserDefinition?.active_revision_detail?.id === revision.revision_id ? (
                        <Chip size="small" label="Attiva" sx={{ color: "#86efac", border: "1px solid rgba(34,197,94,0.35)" }} />
                      ) : (
                        <Button
                          size="small"
                          startIcon={<UndoIcon />}
                          disabled={parserSaving}
                          onClick={() => void rollbackParserWorkflow(revision.revision_id)}
                        >
                          Ripristina questa revisione
                        </Button>
                      )}
                    </Stack>
                  </Stack>
                ))}
                {!parserRevisions.length ? (
                  <Typography sx={{ color: "#64748b", fontSize: 13 }}>
                    Nessuna revisione parser disponibile per questa fonte.
                  </Typography>
                ) : null}
              </Stack>

              {diffLoading ? <LinearProgress sx={{ mt: 1 }} /> : null}
              {revisionDiff ? (
                <Box sx={{ mt: 1.2 }}>
                  <Typography sx={{ color: "#94a3b8", fontSize: 12, mb: 0.6 }}>
                    Diff revisioni v{revisionDiff.left.version} vs v{revisionDiff.right.version}
                  </Typography>
                  <MonacoDiff language="json" original={revisionDiff.left.config_text} modified={revisionDiff.right.config_text} />
                </Box>
              ) : null}

              <Divider sx={{ my: 1.2 }} />
              <ParserTestCases parserId={parserDefinition?.id ?? null} disabled={parserSaving} />
            </Paper>

            <Paper sx={{ ...surfaceCardSx, p: 1.5 }}>
              <Tabs value={insightTab} onChange={(_, value: number) => setInsightTab(value)} textColor="inherit">
                <Tab label="Statistiche" data-testid="source-stats-tab" />
                <Tab label="Log Errori" data-testid="source-errors-tab" />
              </Tabs>

              {insightTab === 0 ? (
                <Stack spacing={1.2} sx={{ mt: 1 }}>
                  <Typography sx={{ color: "#e2e8f0", fontWeight: 700 }}>
                    Record ingeriti per run (ultimi 14 giorni)
                  </Typography>
                  {runsLoading ? <LinearProgress sx={{ mb: 1 }} /> : null}
                  <Box sx={{ height: 280, width: "100%" }}>
                    <ResponsiveContainer>
                      <LineChart data={statsChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
                        <XAxis dataKey="startedAt" tick={{ fill: theme.palette.text.secondary, fontSize: 11 }} />
                        <YAxis tick={{ fill: theme.palette.text.secondary, fontSize: 11 }} />
                        <Tooltip />
                        <Line
                          type="monotone"
                          dataKey="records"
                          stroke={theme.palette.primary.main}
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </Box>
                  {!statsChartData.length && !runsLoading ? (
                    <Typography sx={{ color: "#64748b", fontSize: 13 }}>
                      Nessun run negli ultimi 14 giorni.
                    </Typography>
                  ) : null}

                  <Divider />
                  <Typography sx={{ color: "#e2e8f0", fontWeight: 600 }}>Run recenti</Typography>
                  <Stack spacing={0.8}>
                    {recentRuns.map((run) => (
                      <Box key={run.id} sx={{ p: 0.9, borderRadius: 1.3, border: "1px solid rgba(71,85,105,0.35)" }}>
                        <Typography sx={{ color: "#cbd5e1", fontSize: 13 }}>
                          #{run.id} - {run.status} - {formatRunTimestamp(run)}
                        </Typography>
                        <Typography sx={{ color: "#94a3b8", fontSize: 12 }}>
                          processed={run.processed_count} created={run.created_count} updated={run.updated_count} errors={run.error_count}
                        </Typography>
                      </Box>
                    ))}
                    {!recentRuns.length && !runsLoading ? (
                      <Typography sx={{ color: "#64748b", fontSize: 13 }}>Nessun run disponibile.</Typography>
                    ) : null}
                  </Stack>
                </Stack>
              ) : null}

              {insightTab === 1 ? (
                <Stack spacing={1.2} sx={{ mt: 1 }}>
                  <Typography sx={{ color: "#e2e8f0", fontWeight: 700 }}>Ultimi 20 run in errore</Typography>
                  {errorLogLoading ? <LinearProgress sx={{ mb: 1 }} /> : null}
                  <Table size="small" data-testid="error-log-table">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ color: "#94a3b8" }}>Timestamp</TableCell>
                        <TableCell sx={{ color: "#94a3b8" }}>Durata</TableCell>
                        <TableCell sx={{ color: "#94a3b8" }}>Messaggio errore</TableCell>
                        <TableCell sx={{ color: "#94a3b8", width: 60 }} />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {sourceErrorLog.map((item) => {
                        const isExpanded = expandedErrorRunIds.includes(item.id);
                        return (
                          <Fragment key={item.id}>
                            <TableRow>
                              <TableCell sx={{ color: "#cbd5e1" }}>
                                {new Date(item.started_at).toLocaleString("it-IT")}
                              </TableCell>
                              <TableCell sx={{ color: "#cbd5e1" }}>{formatDuration(item.duration_seconds)}</TableCell>
                              <TableCell sx={{ color: "#fda4af" }}>{item.error_message || "-"}</TableCell>
                              <TableCell>
                                <IconButton
                                  size="small"
                                  onClick={() => toggleErrorRow(item.id)}
                                  aria-label={isExpanded ? "Riduci dettaglio errore" : "Espandi dettaglio errore"}
                                >
                                  {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                                </IconButton>
                              </TableCell>
                            </TableRow>
                            {isExpanded ? (
                              <TableRow>
                                <TableCell colSpan={4}>
                                  <Box
                                    sx={{
                                      backgroundColor: theme.palette.background.default,
                                      border: `1px solid ${theme.palette.divider}`,
                                      borderRadius: 1,
                                      p: 1,
                                    }}
                                  >
                                    <Typography
                                      component="pre"
                                      sx={{
                                        m: 0,
                                        color: theme.palette.text.secondary,
                                        fontSize: 12,
                                        fontFamily: "monospace",
                                        whiteSpace: "pre-wrap",
                                        wordBreak: "break-word",
                                      }}
                                    >
                                      {JSON.stringify(item.error_detail ?? {}, null, 2)}
                                    </Typography>
                                  </Box>
                                </TableCell>
                              </TableRow>
                            ) : null}
                          </Fragment>
                        );
                      })}
                      {!sourceErrorLog.length && !errorLogLoading ? (
                        <TableRow>
                          <TableCell colSpan={4} sx={{ color: "#64748b" }}>
                            Nessun errore registrato per questa sorgente.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </Stack>
              ) : null}
            </Paper>
          </Stack>
        </Grid>
      </Grid>
    </Stack>
  );
}
