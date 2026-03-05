import api from "./api";
import {
  ParserCreatePayload,
  ParserDefinition,
  ParserPreviewResponse,
  ParserRevisionDiffResponse,
  ParserRevisionListItem,
  ParserRunAllResponse,
  ParserTestCase,
  ParserTestCaseCreatePayload,
  ParserUpdatePayload,
} from "../types/parser";

export async function fetchParsers(sourceId?: number): Promise<ParserDefinition[]> {
  const response = await api.get<ParserDefinition[]>("/ingestion/parsers/", {
    params: sourceId ? { source_id: sourceId } : undefined,
  });
  return response.data;
}

export async function fetchParser(parserId: number): Promise<ParserDefinition> {
  const response = await api.get<ParserDefinition>(`/ingestion/parsers/${parserId}/`);
  return response.data;
}

export async function createParser(payload: ParserCreatePayload): Promise<ParserDefinition> {
  const response = await api.post<ParserDefinition>("/ingestion/parsers/", payload);
  return response.data;
}

export async function updateParser(parserId: number, payload: ParserUpdatePayload): Promise<ParserDefinition> {
  const response = await api.patch<ParserDefinition>(`/ingestion/parsers/${parserId}/`, payload);
  return response.data;
}

export async function previewParser(
  parserId: number,
  rawPayload: Record<string, unknown>,
  configText?: string,
  rawEvent?: string,
): Promise<ParserPreviewResponse> {
  const response = await api.post<ParserPreviewResponse>(`/ingestion/parsers/${parserId}/preview/`, {
    raw_payload: rawPayload,
    ...(rawEvent ? { raw_event: rawEvent } : {}),
    ...(configText ? { config_text: configText } : {}),
  });
  return response.data;
}

export async function previewParserConfig(configText: string, rawPayload: Record<string, unknown>): Promise<ParserPreviewResponse> {
  const response = await api.post<ParserPreviewResponse>("/ingestion/parsers/preview-config/", {
    config_text: configText,
    raw_payload: rawPayload,
  });
  return response.data;
}

export async function rollbackParser(parserId: number, revisionId: number): Promise<ParserDefinition> {
  const response = await api.post<ParserDefinition>(`/ingestion/parsers/${parserId}/rollback/`, {
    revision_id: revisionId,
  });
  return response.data;
}

export async function fetchParserRevisions(parserId: number): Promise<ParserRevisionListItem[]> {
  const response = await api.get<ParserRevisionListItem[]>(`/ingestion/parsers/${parserId}/revisions/`);
  return response.data;
}

export async function fetchParserRevisionDiff(
  parserId: number,
  revisionId: number,
  compareTo: number,
): Promise<ParserRevisionDiffResponse> {
  const response = await api.get<ParserRevisionDiffResponse>(`/ingestion/parsers/${parserId}/revisions/${revisionId}/diff/`, {
    params: { compare_to: compareTo },
  });
  return response.data;
}

export async function fetchParserTestCases(parserId: number): Promise<ParserTestCase[]> {
  const response = await api.get<ParserTestCase[]>(`/ingestion/parsers/${parserId}/test-cases/`);
  return response.data;
}

export async function createParserTestCase(parserId: number, payload: ParserTestCaseCreatePayload): Promise<ParserTestCase> {
  const response = await api.post<ParserTestCase>(`/ingestion/parsers/${parserId}/test-cases/`, payload);
  return response.data;
}

export async function deleteParserTestCase(parserId: number, testCaseId: number): Promise<void> {
  await api.delete(`/ingestion/parsers/${parserId}/test-cases/${testCaseId}/`);
}

export async function runAllParserTestCases(parserId: number): Promise<ParserRunAllResponse> {
  const response = await api.post<ParserRunAllResponse>(`/ingestion/parsers/${parserId}/test-cases/run-all/`, {});
  return response.data;
}
