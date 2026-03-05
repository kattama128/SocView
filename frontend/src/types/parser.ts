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

export type ParserRevisionListItem = {
  revision_id: number;
  version: number;
  created_at: string;
  created_by: { id: number; username: string } | null;
  config_snapshot: Record<string, unknown>;
};

export type ParserRevisionDiffResponse = {
  left: {
    revision_id: number;
    version: number;
    config_text: string;
    config_snapshot: Record<string, unknown>;
  };
  right: {
    revision_id: number;
    version: number;
    config_text: string;
    config_snapshot: Record<string, unknown>;
  };
  diff: Array<{
    path: string;
    type: "add" | "remove" | "change";
    old: unknown;
    new: unknown;
  }>;
};

export type ParserTestCase = {
  id: number;
  parser: number;
  name: string;
  input_raw: string;
  expected_output: Record<string, unknown>;
  created_by: number | null;
  created_by_username: string | null;
  created_at: string;
  updated_at: string;
};

export type ParserTestCaseCreatePayload = {
  name: string;
  input_raw: string;
  expected_output: Record<string, unknown>;
};

export type ParserRunAllResult = {
  tc_id: number;
  name: string;
  passed: boolean;
  actual_output: Record<string, unknown>;
  diff: Array<{
    path: string;
    type: "add" | "remove" | "change";
    old: unknown;
    new: unknown;
  }>;
};

export type ParserRunAllResponse = {
  results: ParserRunAllResult[];
  passed: number;
  failed: number;
};
