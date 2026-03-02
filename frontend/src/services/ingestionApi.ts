import api from "./api";
import { ConnectionTestResult, IngestionRun, Source, SourceWritePayload } from "../types/ingestion";

export async function fetchSources(): Promise<Source[]> {
  const response = await api.get<Source[]>("/ingestion/sources/");
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
