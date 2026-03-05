export type AlertState = {
  id: number;
  name: string;
  order: number;
  is_final: boolean;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type Tag = {
  id: number;
  name: string;
  scope: "tenant" | "source" | "alert";
  color: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type UserSummary = {
  id: number;
  username: string;
  email: string;
  role: string;
};

export type Assignment = {
  id: number;
  assigned_to: number | null;
  assigned_to_detail?: UserSummary;
  assigned_by: number | null;
  assigned_by_detail?: UserSummary;
  created_at: string;
  updated_at: string;
};

export type CommentNote = {
  id: number;
  alert: number;
  author: number | null;
  author_detail?: UserSummary;
  body: string;
  created_at: string;
  updated_at: string;
};

export type Attachment = {
  id: number;
  alert: number;
  filename: string;
  file_url?: string | null;
  download_url?: string | null;
  content_type: string;
  size: number;
  scan_status: "clean" | "suspicious" | "failed";
  scan_detail: string;
  uploaded_by: number | null;
  uploaded_by_detail?: UserSummary;
  created_at: string;
  updated_at: string;
};

export type AlertOccurrence = {
  count: number;
  first_seen: string;
  last_seen: string;
};

export type IocCollection = {
  ips: string[];
  hashes: string[];
  urls: string[];
  emails: string[];
};

export type SlaStatus = {
  response: "ok" | "warning" | "breached";
  resolution: "ok" | "warning" | "breached";
  response_remaining_minutes: number;
};

export type CustomerSummary = {
  id: number;
  name: string;
  code: string;
  is_enabled: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type CustomerOverview = CustomerSummary & {
  active_alerts_total: number;
  active_alerts_critical: number;
  active_alerts_high: number;
  active_alerts_medium: number;
  active_alerts_low: number;
  active_alerts_by_severity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
};

export type CustomerSettingsApi = {
  tier: "Bronze" | "Silver" | "Gold" | "Platinum";
  timezone: string;
  sla_target: string;
  primary_contact: string;
  contact_email: string;
  contact_phone: string;
  notify_channels: string;
  escalation_matrix: string;
  maintenance_window: string;
  default_severity: "low" | "medium" | "high" | "critical";
  auto_assign_team: string;
  notify_on_critical: boolean;
  notify_on_high: boolean;
  allow_suppress: boolean;
  retention_days: number;
  tag_defaults: string;
  enrich_geo: boolean;
  enrich_threat_intel: boolean;
  allow_external_sharing: boolean;
  created_at: string;
  updated_at: string;
};

export type CustomerSourceCatalogEntry = {
  source_id: number;
  name: string;
  type: string;
  description: string;
  globally_enabled: boolean;
  customer_enabled: boolean;
  parser_definition_name: string | null;
  alert_type_rules_count: number;
};

export type CustomerSettingsResponse = {
  customer: CustomerSummary;
  settings: CustomerSettingsApi;
  sources: CustomerSourceCatalogEntry[];
  updated_at: string;
};

export type CustomerSettingsUpdatePayload = {
  settings?: Partial<Omit<CustomerSettingsApi, "created_at" | "updated_at">>;
  source_overrides?: Array<{ source_id: number; is_enabled: boolean }>;
};

export type Alert = {
  id: number;
  title: string;
  customer?: number | null;
  customer_detail?: CustomerSummary | null;
  severity: "low" | "medium" | "high" | "critical";
  event_timestamp: string;
  source_name: string;
  source_id: string;
  raw_payload: Record<string, unknown>;
  parsed_payload: Record<string, unknown> | null;
  parsed_field_schema: Array<{ field: string; type: string }>;
  parse_error_detail: string;
  iocs?: IocCollection | null;
  mitre_technique_id?: string | null;
  current_state: number;
  current_state_detail: AlertState;
  is_active: boolean;
  dedup_fingerprint: string;
  occurrence?: AlertOccurrence;
  assignment?: Assignment;
  sla_status?: SlaStatus | null;
  tags: Tag[];
  comments?: CommentNote[];
  attachments?: Attachment[];
  created_at: string;
  updated_at: string;
};

export type RelatedAlert = {
  id: number;
  title: string;
  severity: Alert["severity"];
  created_at: string;
  event_timestamp: string;
  current_state_detail: AlertState;
};

export type SlaConfig = {
  id: number;
  severity: Alert["severity"];
  response_minutes: number;
  resolution_minutes: number;
  created_at: string;
  updated_at: string;
};

export type AuditLog = {
  id: number;
  actor: number | null;
  actor_detail?: UserSummary;
  action: string;
  object_type: string;
  object_id: string;
  diff: Record<string, unknown>;
  alert: number | null;
  timestamp: string;
  ip_address: string | null;
  user_agent: string;
};

export type DynamicFilterType = "keyword" | "number" | "date" | "boolean";

export type DynamicFilter = {
  field: string;
  type: DynamicFilterType;
  operator: "eq" | "contains" | "in" | "gt" | "gte" | "lt" | "lte";
  value: unknown;
};

export type SearchRequest = {
  text?: string;
  source_name?: string;
  source_names?: string[];
  state_id?: number;
  state_ids?: number[];
  severity?: Alert["severity"];
  severities?: Alert["severity"][];
  alert_types?: string[];
  tag_ids?: number[];
  event_timestamp_from?: string;
  event_timestamp_to?: string;
  is_active?: boolean;
  assignee?: string;
  in_state_since?: string;
  dynamic_filters?: DynamicFilter[];
  ordering?: string;
  page?: number;
  page_size?: number;
};

export type ExportPreviewResponse = {
  count: number;
  rows: Array<Record<string, unknown>>;
  columns: string[];
};

export type BulkActionRequest = {
  action: "change_state" | "assign" | "add_tag";
  ids?: number[];
  select_all?: boolean;
  filters?: SearchRequest;
  state_id?: number;
  assigned_to_id?: number | null;
  tag_ids?: number[];
};

export type BulkActionResponse = {
  updated: number;
  errors: number;
};

export type SearchResponse = {
  backend: string;
  count: number;
  page: number;
  page_size: number;
  results: Alert[];
};

export type SourceFieldSchema = {
  source_name: string;
  fields: Array<{ field: string; type: DynamicFilterType }>;
};

export type SavedSearch = {
  id: number;
  name: string;
  text_query: string;
  source_name: string;
  state_id: number | null;
  severity: "" | Alert["severity"];
  is_active: boolean | null;
  dynamic_filters: DynamicFilter[];
  ordering: string;
  visible_columns: string[];
  created_at: string;
  updated_at: string;
};

export type AlertTimelineEvent = {
  timestamp: string;
  type: string;
  title: string;
  detail?: Record<string, unknown>;
};

export type NotificationEvent = {
  id: number;
  alert: number;
  alert_title: string;
  title: string;
  message: string;
  severity: "low" | "medium" | "high" | "critical";
  metadata: Record<string, unknown>;
  is_active: boolean;
  is_read: boolean;
  snoozed_until?: string | null;
  created_at: string;
  updated_at: string;
};

export type NotificationListResponse = {
  unread_count: number;
  results: NotificationEvent[];
};

export type NotificationPreferences = {
  min_severity: "all" | Alert["severity"];
  customer_filter: number[];
  channels: {
    ui: boolean;
    email: boolean;
  };
  created_at: string;
  updated_at: string;
};

export type AlertDetailFieldConfig = {
  id: number;
  customer: number | null;
  customer_detail?: CustomerSummary | null;
  source_name: string;
  alert_type: string;
  visible_fields: string[];
  created_at: string;
  updated_at: string;
};
