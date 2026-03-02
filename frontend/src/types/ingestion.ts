export type SourceType = "imap" | "rest" | "webhook";

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
  name: string;
  type: SourceType;
  is_enabled: boolean;
  severity_map: Record<string, unknown>;
  config: SourceConfig;
  dedup_policy: DedupPolicy;
  webhook_endpoint: string | null;
  parser_definition_id: number | null;
  parser_definition_name: string | null;
  created_at: string;
  updated_at: string;
};

export type SourceWritePayload = {
  name: string;
  type: SourceType;
  is_enabled: boolean;
  severity_map: Record<string, unknown>;
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
  error_detail: string;
  metadata: Record<string, unknown>;
  events: IngestionEventLog[];
};

export type ConnectionTestResult = {
  ok: boolean;
  detail: string;
};
