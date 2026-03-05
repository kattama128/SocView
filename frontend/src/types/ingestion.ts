export type SourceType =
  | "imap"
  | "rest"
  | "webhook"
  | "syslog_udp"
  | "syslog_tcp"
  | "kafka_topic"
  | "s3_bucket"
  | "azure_event_hub"
  | "gcp_pubsub"
  | "sftp_drop";

export type SourceSupportStatus = "ga" | "beta" | "planned";

export type SourceTypeCapability = {
  type: SourceType;
  label: string;
  status: SourceSupportStatus;
  is_operational: boolean;
  create_enabled: boolean;
  supports_test_connection: boolean;
  supports_run_now: boolean;
  supports_polling: boolean;
  supports_push: boolean;
  notes: string;
};

export type SourcePresetCapability = {
  key: string;
  label: string;
  description: string;
  source_type: SourceType;
  status: SourceSupportStatus;
  auto_parser: boolean;
};

export type SourceCapabilitiesResponse = {
  types: SourceTypeCapability[];
  presets: SourcePresetCapability[];
};

export type SourceAlertTypeRule = {
  id: number;
  alert_name: string;
  match_mode: "exact" | "contains" | "regex";
  severity: "low" | "medium" | "high" | "critical";
  is_enabled: boolean;
  notes: string;
  received_count: number;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SourceConfig = {
  config_json: Record<string, unknown>;
  poll_interval_seconds: number;
  secrets_ref: string;
  webhook_api_key: string;
  rate_limit_per_minute: number;
  last_polled_at: string | null;
  last_success: string | null;
  last_error: string;
  status: "never" | "healthy" | "error";
  health_details: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type DedupPolicy = {
  fingerprint_fields: string[];
  strategy: "increment_occurrence";
  created_at: string;
  updated_at: string;
};

export type Source = {
  id: number;
  customer: number | null;
  customer_name: string | null;
  name: string;
  description: string;
  type: SourceType;
  is_enabled: boolean;
  severity_map: Record<string, unknown>;
  schedule_cron: string | null;
  schedule_interval_minutes: number | null;
  config: SourceConfig;
  dedup_policy: DedupPolicy;
  alert_type_rules: SourceAlertTypeRule[];
  webhook_endpoint: string | null;
  parser_definition_id: number | null;
  parser_definition_name: string | null;
  created_at: string;
  updated_at: string;
};

export type SourceWritePayload = {
  customer?: number | null;
  name: string;
  description?: string;
  type: SourceType;
  is_enabled: boolean;
  severity_map: Record<string, unknown>;
  schedule_cron?: string | null;
  schedule_interval_minutes?: number | null;
  alert_type_rules?: Array<{
    id?: number;
    alert_name: string;
    match_mode: "exact" | "contains" | "regex";
    severity: "low" | "medium" | "high" | "critical";
    is_enabled: boolean;
    notes: string;
  }>;
  config: {
    config_json: Record<string, unknown>;
    poll_interval_seconds: number;
    secrets_ref: string;
    webhook_api_key?: string;
    rate_limit_per_minute: number;
  };
  dedup_policy: {
    fingerprint_fields: string[];
    strategy: "increment_occurrence";
  };
};

export type IngestionEventLog = {
  id: number;
  run: number;
  source: number;
  alert: number | null;
  fingerprint: string;
  action: string;
  parse_error: string;
  error_detail: string;
  raw_preview: Record<string, unknown>;
  created_at: string;
};

export type IngestionRun = {
  id: number;
  source: number;
  trigger: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  processed_count: number;
  created_count: number;
  updated_count: number;
  error_count: number;
  error_message: string;
  error_detail: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  events: IngestionEventLog[];
};

export type SourceStats = {
  last_run_at: string | null;
  last_run_status: "success" | "error" | "partial" | null;
  runs_today: number;
  records_today: number;
  error_rate_7d: number;
  avg_duration_seconds: number | null;
};

export type SourceErrorLogEntry = {
  id: number;
  status: string;
  started_at: string;
  finished_at: string | null;
  duration_seconds: number | null;
  error_message: string;
  error_detail: Record<string, unknown> | null;
};

export type ConnectionTestResult = {
  ok: boolean;
  detail: string;
};
