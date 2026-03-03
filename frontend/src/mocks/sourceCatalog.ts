import { mockAlarms, mockCustomers, mockSources, type MockAlarm } from "./activeAlarmsData";

export type IngestionMethod =
  | "webhook_http"
  | "rest_poll"
  | "rest_push"
  | "imap_mailbox"
  | "syslog_udp"
  | "syslog_tcp"
  | "kafka_topic"
  | "s3_bucket"
  | "azure_event_hub"
  | "gcp_pubsub"
  | "sftp_drop";

export type AuthType = "none" | "api_key" | "basic" | "oauth2" | "bearer";
export type MatchMode = "exact" | "contains";

export type SourceParserEntry = {
  id: string;
  key: string;
  value: string;
};

export type SourceAlertTypeRule = {
  id: string;
  alertName: string;
  severity: MockAlarm["severity"];
  matchMode: MatchMode;
  enabled: boolean;
  notes: string;
  receivedCount: number;
  lastSeenAt: string | null;
};

export type GlobalSourceDefinition = {
  id: number;
  name: string;
  method: IngestionMethod;
  description: string;
  endpoint: string;
  authType: AuthType;
  pullIntervalSeconds: number;
  enabled: boolean;
  parserEntries: SourceParserEntry[];
  alertTypeRules: SourceAlertTypeRule[];
};

export type CustomerSourcePreferences = Record<number, Record<number, boolean>>;

const sourcesStorageKey = "socview_global_sources_v1";
const customerSourcePrefsStorageKey = "socview_customer_source_prefs_v1";

export const ingestionMethodOptions: Array<{ value: IngestionMethod; label: string; description: string }> = [
  { value: "webhook_http", label: "Webhook HTTP", description: "Ricezione eventi push via endpoint HTTP" },
  { value: "rest_poll", label: "REST Poll", description: "Pull periodico di eventi da API REST" },
  { value: "rest_push", label: "REST Push", description: "Push eventi da collector esterno" },
  { value: "imap_mailbox", label: "IMAP Mailbox", description: "Lettura casella mail SOC" },
  { value: "syslog_udp", label: "Syslog UDP", description: "Ricezione log su porta UDP" },
  { value: "syslog_tcp", label: "Syslog TCP", description: "Ricezione log su porta TCP" },
  { value: "kafka_topic", label: "Kafka Topic", description: "Consume eventi da topic Kafka" },
  { value: "s3_bucket", label: "S3 Bucket", description: "Polling oggetti da bucket S3" },
  { value: "azure_event_hub", label: "Azure Event Hub", description: "Subscribe da Event Hub" },
  { value: "gcp_pubsub", label: "GCP Pub/Sub", description: "Subscribe da topic Pub/Sub" },
  { value: "sftp_drop", label: "SFTP Drop", description: "Lettura file eventi da cartella SFTP" },
];

export const authTypeOptions: Array<{ value: AuthType; label: string }> = [
  { value: "none", label: "None" },
  { value: "api_key", label: "API Key" },
  { value: "basic", label: "Basic Auth" },
  { value: "oauth2", label: "OAuth2" },
  { value: "bearer", label: "Bearer Token" },
];

function readStorage(key: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(key);
}

function writeStorage(key: string, value: string) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(key, value);
}

function methodFromMockType(type: "imap" | "rest" | "webhook"): IngestionMethod {
  if (type === "imap") {
    return "imap_mailbox";
  }
  if (type === "rest") {
    return "rest_poll";
  }
  return "webhook_http";
}

function defaultParserEntries(): SourceParserEntry[] {
  return [
    { id: "p-event", key: "eventId", value: "event_id" },
    { id: "p-title", key: "title", value: "alert_name" },
    { id: "p-severity", key: "severity", value: "severity" },
    { id: "p-status", key: "status", value: "status" },
    { id: "p-ts", key: "timestamp", value: "detected_at" },
  ];
}

function buildDefaultAlertRules(sourceId: number): SourceAlertTypeRule[] {
  const alarms = mockAlarms.filter((item) => item.sourceId === sourceId);
  const grouped = new Map<string, { count: number; lastSeenAt: string | null; severity: MockAlarm["severity"] }>();

  alarms.forEach((alarm) => {
    const current = grouped.get(alarm.title);
    if (!current) {
      grouped.set(alarm.title, {
        count: 1,
        lastSeenAt: alarm.detectedAt,
        severity: alarm.severity,
      });
      return;
    }
    grouped.set(alarm.title, {
      count: current.count + 1,
      lastSeenAt: current.lastSeenAt && current.lastSeenAt > alarm.detectedAt ? current.lastSeenAt : alarm.detectedAt,
      severity: current.severity,
    });
  });

  return Array.from(grouped.entries()).map(([alertName, data], idx) => ({
    id: `r-${sourceId}-${idx + 1}`,
    alertName,
    severity: data.severity,
    matchMode: "exact",
    enabled: true,
    notes: "",
    receivedCount: data.count,
    lastSeenAt: data.lastSeenAt,
  }));
}

function buildExtraGlobalSources(startId: number): GlobalSourceDefinition[] {
  return [
    {
      id: startId,
      name: "Core Syslog UDP Collector",
      method: "syslog_udp",
      description: "Collector centralizzato syslog su UDP 514",
      endpoint: "udp://socview.local:514",
      authType: "none",
      pullIntervalSeconds: 60,
      enabled: true,
      parserEntries: defaultParserEntries(),
      alertTypeRules: [],
    },
    {
      id: startId + 1,
      name: "Threat Intel Kafka Stream",
      method: "kafka_topic",
      description: "Topic Kafka per feed eventi threat-intel",
      endpoint: "kafka://broker1.socview.local:9092/threat.alerts",
      authType: "bearer",
      pullIntervalSeconds: 20,
      enabled: true,
      parserEntries: defaultParserEntries(),
      alertTypeRules: [],
    },
    {
      id: startId + 2,
      name: "Archive S3 Batch Import",
      method: "s3_bucket",
      description: "Import batch eventi storici da bucket S3",
      endpoint: "s3://socview-alerts-prod/daily/",
      authType: "api_key",
      pullIntervalSeconds: 600,
      enabled: true,
      parserEntries: defaultParserEntries(),
      alertTypeRules: [],
    },
    {
      id: startId + 3,
      name: "Azure SIEM Event Hub",
      method: "azure_event_hub",
      description: "Ingest da Event Hub per eventi SIEM esterni",
      endpoint: "sb://socview-eh.servicebus.windows.net/siem-events",
      authType: "oauth2",
      pullIntervalSeconds: 30,
      enabled: true,
      parserEntries: defaultParserEntries(),
      alertTypeRules: [],
    },
    {
      id: startId + 4,
      name: "Canary Tools Incident Feed",
      method: "rest_poll",
      description:
        "Polling API incidenti Canary Tools: /api/v1/incidents/unacknowledged oppure /all con cursor e incidents_since.",
      endpoint: "https://<console>.canary.tools/api/v1/incidents/unacknowledged",
      authType: "api_key",
      pullIntervalSeconds: 45,
      enabled: true,
      parserEntries: [
        { id: "canary-id", key: "eventId", value: "id" },
        { id: "canary-title", key: "title", value: "description" },
        { id: "canary-sev", key: "severity", value: "severity" },
        { id: "canary-ts", key: "timestamp", value: "created_std" },
        { id: "canary-node", key: "nodeId", value: "node_id" },
        { id: "canary-src-ip", key: "srcIp", value: "src_host" },
        { id: "canary-logtype", key: "logType", value: "logtype" },
      ],
      alertTypeRules: [
        {
          id: "canary-rule-1",
          alertName: "Canarytoken",
          severity: "critical",
          matchMode: "contains",
          enabled: true,
          notes: "Trigger su token ad alta fedelta.",
          receivedCount: 0,
          lastSeenAt: null,
        },
        {
          id: "canary-rule-2",
          alertName: "SMB",
          severity: "high",
          matchMode: "contains",
          enabled: true,
          notes: "Interazione su share/trappola SMB.",
          receivedCount: 0,
          lastSeenAt: null,
        },
      ],
    },
    {
      id: startId + 5,
      name: "SentinelOne Threat & Activities API",
      method: "rest_poll",
      description:
        "Polling API SentinelOne (threats + activities) da management console /web/api/v2.1 con token bearer.",
      endpoint: "https://<tenant>.sentinelone.net/web/api/v2.1/threats",
      authType: "bearer",
      pullIntervalSeconds: 30,
      enabled: true,
      parserEntries: [
        { id: "s1-id", key: "eventId", value: "id" },
        { id: "s1-title", key: "title", value: "threatInfo.threatName" },
        { id: "s1-sev", key: "severity", value: "threatInfo.classification" },
        { id: "s1-ts", key: "timestamp", value: "createdAt" },
        { id: "s1-agent", key: "agentName", value: "agentComputerName" },
        { id: "s1-site", key: "siteName", value: "siteName" },
        { id: "s1-status", key: "status", value: "mitigationStatus" },
      ],
      alertTypeRules: [
        {
          id: "s1-rule-1",
          alertName: "malicious",
          severity: "critical",
          matchMode: "contains",
          enabled: true,
          notes: "Threat classificata malicious da motore SentinelOne.",
          receivedCount: 0,
          lastSeenAt: null,
        },
        {
          id: "s1-rule-2",
          alertName: "suspicious",
          severity: "high",
          matchMode: "contains",
          enabled: true,
          notes: "Threat suspicious da investigare in triage.",
          receivedCount: 0,
          lastSeenAt: null,
        },
      ],
    },
  ];
}

function hasVendorSource(source: GlobalSourceDefinition, vendor: "canary" | "sentinelone"): boolean {
  const haystack = `${source.name} ${source.description} ${source.endpoint}`.toLowerCase();
  if (vendor === "canary") {
    return haystack.includes("canary");
  }
  return haystack.includes("sentinelone") || haystack.includes("sentinel one");
}

function ensureVendorSources(sources: GlobalSourceDefinition[]): GlobalSourceDefinition[] {
  const next = [...sources];
  const maxId = next.reduce((acc, item) => Math.max(acc, item.id), 1000);

  if (!next.some((source) => hasVendorSource(source, "canary"))) {
    const canary = buildExtraGlobalSources(maxId + 1).find((item) => item.name === "Canary Tools Incident Feed");
    if (canary) {
      next.push(canary);
    }
  }

  const maxIdAfterCanary = next.reduce((acc, item) => Math.max(acc, item.id), 1000);
  if (!next.some((source) => hasVendorSource(source, "sentinelone"))) {
    const sentinel = buildExtraGlobalSources(maxIdAfterCanary + 1).find(
      (item) => item.name === "SentinelOne Threat & Activities API",
    );
    if (sentinel) {
      next.push(sentinel);
    }
  }

  return next;
}

export function buildDefaultGlobalSources(): GlobalSourceDefinition[] {
  const fromMocks: GlobalSourceDefinition[] = mockSources.map((source) => ({
    id: source.id,
    name: source.name,
    method: methodFromMockType(source.type),
    description: `Fonte globale importata da catalogo demo (${source.type})`,
    endpoint: `https://collector.socview.local/source/${source.id}`,
    authType: source.type === "webhook" ? "api_key" : source.type === "rest" ? "oauth2" : "basic",
    pullIntervalSeconds: source.type === "imap" ? 120 : source.type === "rest" ? 60 : 30,
    enabled: source.status !== "offline",
    parserEntries: defaultParserEntries(),
    alertTypeRules: buildDefaultAlertRules(source.id),
  }));

  const maxId = fromMocks.reduce((acc, item) => Math.max(acc, item.id), 100);
  return [...fromMocks, ...buildExtraGlobalSources(maxId + 1)];
}

export function loadGlobalSourcesConfig(): GlobalSourceDefinition[] {
  try {
    const raw = readStorage(sourcesStorageKey);
    if (!raw) {
      const defaults = ensureVendorSources(buildDefaultGlobalSources());
      writeStorage(sourcesStorageKey, JSON.stringify(defaults));
      return defaults;
    }
    const parsed = JSON.parse(raw) as GlobalSourceDefinition[];
    if (!Array.isArray(parsed) || !parsed.length) {
      const defaults = ensureVendorSources(buildDefaultGlobalSources());
      writeStorage(sourcesStorageKey, JSON.stringify(defaults));
      return defaults;
    }
    const reconciled = ensureVendorSources(parsed);
    if (reconciled.length !== parsed.length) {
      writeStorage(sourcesStorageKey, JSON.stringify(reconciled));
    }
    return reconciled;
  } catch {
    const defaults = ensureVendorSources(buildDefaultGlobalSources());
    writeStorage(sourcesStorageKey, JSON.stringify(defaults));
    return defaults;
  }
}

export function saveGlobalSourcesConfig(sources: GlobalSourceDefinition[]) {
  writeStorage(sourcesStorageKey, JSON.stringify(sources));
}

export function loadCustomerSourcePreferences(): CustomerSourcePreferences {
  const sources = loadGlobalSourcesConfig();
  const fallback: CustomerSourcePreferences = Object.fromEntries(
    mockCustomers.map((customer) => [
      customer.id,
      Object.fromEntries(sources.map((source) => [source.id, true])),
    ]),
  );

  try {
    const raw = readStorage(customerSourcePrefsStorageKey);
    if (!raw) {
      writeStorage(customerSourcePrefsStorageKey, JSON.stringify(fallback));
      return fallback;
    }
    const parsed = JSON.parse(raw) as CustomerSourcePreferences;
    if (!parsed || typeof parsed !== "object") {
      writeStorage(customerSourcePrefsStorageKey, JSON.stringify(fallback));
      return fallback;
    }

    // Reconcile sources/customers added later
    mockCustomers.forEach((customer) => {
      if (!parsed[customer.id]) {
        parsed[customer.id] = {};
      }
      sources.forEach((source) => {
        if (typeof parsed[customer.id][source.id] !== "boolean") {
          parsed[customer.id][source.id] = true;
        }
      });
    });

    writeStorage(customerSourcePrefsStorageKey, JSON.stringify(parsed));
    return parsed;
  } catch {
    writeStorage(customerSourcePrefsStorageKey, JSON.stringify(fallback));
    return fallback;
  }
}

export function saveCustomerSourcePreferences(preferences: CustomerSourcePreferences) {
  writeStorage(customerSourcePrefsStorageKey, JSON.stringify(preferences));
}

export function isSourceEnabledForCustomer(
  customerId: number,
  sourceId: number,
  preferences: CustomerSourcePreferences,
): boolean {
  const customerPrefs = preferences[customerId];
  if (!customerPrefs) {
    return true;
  }
  if (typeof customerPrefs[sourceId] !== "boolean") {
    return true;
  }
  return customerPrefs[sourceId];
}

export function resolveAlarmSeverity(
  sourceId: number,
  alertName: string,
  fallback: MockAlarm["severity"],
  sources?: GlobalSourceDefinition[],
): MockAlarm["severity"] {
  const allSources = sources ?? loadGlobalSourcesConfig();
  const source = allSources.find((item) => item.id === sourceId);
  if (!source) {
    return fallback;
  }

  const byExact = source.alertTypeRules.find(
    (rule) => rule.enabled && rule.matchMode === "exact" && rule.alertName.toLowerCase() === alertName.toLowerCase(),
  );
  if (byExact) {
    return byExact.severity;
  }

  const byContains = source.alertTypeRules.find(
    (rule) => rule.enabled && rule.matchMode === "contains" && alertName.toLowerCase().includes(rule.alertName.toLowerCase()),
  );
  if (byContains) {
    return byContains.severity;
  }

  return fallback;
}
