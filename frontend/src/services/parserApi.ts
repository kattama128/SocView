import api from "./api";
import {
  ParserCreatePayload,
  ParserDefinition,
  ParserPreviewResponse,
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

export async function previewParser(parserId: number, rawPayload: Record<string, unknown>, configText?: string): Promise<ParserPreviewResponse> {
  const response = await api.post<ParserPreviewResponse>(`/ingestion/parsers/${parserId}/preview/`, {
    raw_payload: rawPayload,
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
