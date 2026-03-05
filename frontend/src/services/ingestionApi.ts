import api from "./api";
import {
  ConnectionTestResult,
  IngestionRun,
  SourceErrorLogEntry,
  Source,
  SourceCapabilitiesResponse,
  SourceStats,
  SourceWritePayload,
} from "../types/ingestion";

export async function fetchSources(options?: { scope?: "all" | "global"; customerId?: number | null }): Promise<Source[]> {
  const response = await api.get<Source[]>("/ingestion/sources/", {
    params: {
      ...(options?.scope ? { scope: options.scope } : {}),
      ...(options?.customerId ? { customer_id: options.customerId } : {}),
    },
  });
  return response.data;
}

export async function createSource(payload: SourceWritePayload): Promise<Source> {
  const response = await api.post<Source>("/ingestion/sources/", payload);
  return response.data;
}

export async function updateSource(sourceId: number, payload: Partial<SourceWritePayload>): Promise<Source> {
  const response = await api.patch<Source>(`/ingestion/sources/${sourceId}/`, payload);
  return response.data;
}

export async function deleteSource(sourceId: number): Promise<void> {
  await api.delete(`/ingestion/sources/${sourceId}/`);
}

export async function fetchSourceCapabilities(): Promise<SourceCapabilitiesResponse> {
  const response = await api.get<SourceCapabilitiesResponse>("/ingestion/sources/capabilities/");
  return response.data;
}

export async function createSourceFromPreset(payload: {
  preset_key: string;
  name?: string;
  description?: string;
  customer_id?: number | null;
}): Promise<Source> {
  const response = await api.post<Source>("/ingestion/sources/create-from-preset/", payload);
  return response.data;
}

export async function testSourceConnection(sourceId: number): Promise<ConnectionTestResult> {
  const response = await api.post<ConnectionTestResult>(`/ingestion/sources/${sourceId}/test-connection/`);
  return response.data;
}

export async function runSourceNow(sourceId: number): Promise<{ task_id: string; detail: string }> {
  const response = await api.post<{ task_id: string; detail: string }>(`/ingestion/sources/${sourceId}/run-now/`);
  return response.data;
}

export async function fetchIngestionRuns(sourceId?: number): Promise<IngestionRun[]> {
  const response = await api.get<IngestionRun[]>("/ingestion/runs/", {
    params: sourceId ? { source_id: sourceId } : undefined,
  });
  return response.data;
}

export async function fetchSourceStats(sourceId: number): Promise<SourceStats> {
  const response = await api.get<SourceStats>(`/ingestion/sources/${sourceId}/stats/`);
  return response.data;
}

export async function fetchSourceErrorLog(sourceId: number): Promise<SourceErrorLogEntry[]> {
  const response = await api.get<SourceErrorLogEntry[]>(`/ingestion/sources/${sourceId}/error-log/`);
  return response.data;
}
