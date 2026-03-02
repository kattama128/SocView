export type ParserRevision = {
  id: number;
  version: number;
  config_text: string;
  config_data: Record<string, unknown>;
  rollback_from: number | null;
  rollback_from_version: number | null;
  created_by: number | null;
  created_by_username: string | null;
  created_at: string;
  updated_at: string;
};

export type ParserDefinition = {
  id: number;
  source: number;
  source_name: string;
  name: string;
  description: string;
  is_enabled: boolean;
  active_revision: number | null;
  active_revision_detail: ParserRevision | null;
  active_config_text: string;
  active_config_data: Record<string, unknown>;
  revisions: ParserRevision[];
  created_at: string;
  updated_at: string;
};

export type ParserCreatePayload = {
  source: number;
  name: string;
  description: string;
  is_enabled: boolean;
  config_text: string;
};

export type ParserUpdatePayload = Partial<ParserCreatePayload>;

export type ParserPreviewResponse = {
  ok: boolean;
  parsed_payload: Record<string, unknown>;
  field_schema: Array<{ field: string; type: string }>;
  detail?: string;
  errors?: string[];
};
