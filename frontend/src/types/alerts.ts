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
  file: string;
  file_url: string;
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

export type Alert = {
  id: number;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  event_timestamp: string;
  source_name: string;
  source_id: string;
  raw_payload: Record<string, unknown>;
  parsed_payload: Record<string, unknown> | null;
  parsed_field_schema: Array<{ field: string; type: string }>;
  parse_error_detail: string;
  current_state: number;
  current_state_detail: AlertState;
  is_active: boolean;
  dedup_fingerprint: string;
  occurrence?: AlertOccurrence;
  assignment?: Assignment;
  tags: Tag[];
  comments?: CommentNote[];
  attachments?: Attachment[];
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
  state_id?: number;
  severity?: Alert["severity"];
  is_active?: boolean;
  dynamic_filters?: DynamicFilter[];
  ordering?: string;
  page?: number;
  page_size?: number;
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
  created_at: string;
  updated_at: string;
};

export type NotificationListResponse = {
  unread_count: number;
  results: NotificationEvent[];
};
