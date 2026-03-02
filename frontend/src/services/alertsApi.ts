import api from "./api";
import {
  Alert,
  AlertState,
  Attachment,
  AlertTimelineEvent,
  AuditLog,
  CommentNote,
  NotificationListResponse,
  SavedSearch,
  SearchRequest,
  SearchResponse,
  SourceFieldSchema,
  Tag,
  UserSummary,
} from "../types/alerts";

export type AlertFilters = {
  state?: string;
  severity?: string;
  text?: string;
  is_active?: string;
};

export async function fetchAlerts(filters: AlertFilters = {}): Promise<Alert[]> {
  const response = await api.get<Alert[]>("/alerts/alerts/", { params: filters });
  return response.data;
}

export async function searchAlerts(payload: SearchRequest): Promise<SearchResponse> {
  const response = await api.post<SearchResponse>("/alerts/search/", payload);
  return response.data;
}

export async function fetchSourceFieldSchemas(sourceName?: string): Promise<SourceFieldSchema[]> {
  const response = await api.get<SourceFieldSchema[]>("/alerts/field-schemas/", {
    params: sourceName ? { source_name: sourceName } : undefined,
  });
  return response.data;
}

export async function fetchSavedSearches(): Promise<SavedSearch[]> {
  const response = await api.get<SavedSearch[]>("/alerts/saved-searches/");
  return response.data;
}

export async function createSavedSearch(payload: Omit<SavedSearch, "id" | "created_at" | "updated_at">): Promise<SavedSearch> {
  const response = await api.post<SavedSearch>("/alerts/saved-searches/", payload);
  return response.data;
}

export async function updateSavedSearch(
  savedSearchId: number,
  payload: Partial<Omit<SavedSearch, "id" | "created_at" | "updated_at">>,
): Promise<SavedSearch> {
  const response = await api.patch<SavedSearch>(`/alerts/saved-searches/${savedSearchId}/`, payload);
  return response.data;
}

export async function deleteSavedSearch(savedSearchId: number): Promise<void> {
  await api.delete(`/alerts/saved-searches/${savedSearchId}/`);
}

export async function fetchAlert(alertId: string): Promise<Alert> {
  const response = await api.get<Alert>(`/alerts/alerts/${alertId}/`);
  return response.data;
}

export async function fetchAlertStates(): Promise<AlertState[]> {
  const response = await api.get<AlertState[]>("/alerts/states/");
  return response.data;
}

export async function fetchTags(): Promise<Tag[]> {
  const response = await api.get<Tag[]>("/alerts/tags/");
  return response.data;
}

export async function fetchUsers(): Promise<UserSummary[]> {
  const response = await api.get<UserSummary[]>("/auth/users/");
  return response.data;
}

export async function fetchAuditLogs(alertId?: string): Promise<AuditLog[]> {
  const response = await api.get<AuditLog[]>("/alerts/audit-logs/", {
    params: alertId ? { alert_id: alertId } : undefined,
  });
  return response.data;
}

export async function changeAlertState(alertId: string, stateId: number): Promise<Alert> {
  const response = await api.post<Alert>(`/alerts/alerts/${alertId}/change-state/`, { state_id: stateId });
  return response.data;
}

export async function assignAlert(alertId: string, assignedToId: number | null): Promise<Alert> {
  const response = await api.post<Alert>(`/alerts/alerts/${alertId}/assign/`, { assigned_to_id: assignedToId });
  return response.data;
}

export async function addAlertTag(alertId: string, tagId: number): Promise<Alert> {
  const response = await api.post<Alert>(`/alerts/alerts/${alertId}/add-tag/`, { tag_id: tagId });
  return response.data;
}

export async function removeAlertTag(alertId: string, tagId: number): Promise<Alert> {
  const response = await api.post<Alert>(`/alerts/alerts/${alertId}/remove-tag/`, { tag_id: tagId });
  return response.data;
}

export async function addComment(alertId: string, body: string): Promise<CommentNote> {
  const response = await api.post<CommentNote>(`/alerts/alerts/${alertId}/comments/`, { body });
  return response.data;
}

export async function uploadAttachment(alertId: string, file: File): Promise<Attachment> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post<Attachment>(`/alerts/alerts/${alertId}/attachments/`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

export async function fetchAlertTimeline(alertId: string): Promise<AlertTimelineEvent[]> {
  const response = await api.get<AlertTimelineEvent[]>(`/alerts/alerts/${alertId}/timeline/`);
  return response.data;
}

export async function exportAlertsConfigurable(
  payload: SearchRequest & { columns: string[]; all_results?: boolean },
): Promise<Blob> {
  const response = await api.post("/alerts/alerts/export-configurable/", payload, {
    responseType: "blob",
  });
  return response.data as Blob;
}

export async function fetchNotifications(status: "all" | "unread" = "all", limit = 30): Promise<NotificationListResponse> {
  const response = await api.get<NotificationListResponse>("/alerts/notifications/", {
    params: { status, limit },
  });
  return response.data;
}

export async function ackNotification(notificationId: number): Promise<void> {
  await api.post(`/alerts/notifications/${notificationId}/ack/`, {});
}

export async function ackAllNotifications(): Promise<void> {
  await api.post("/alerts/notifications/ack-all/", {});
}

export async function createState(payload: Partial<AlertState>): Promise<AlertState> {
  const response = await api.post<AlertState>("/alerts/states/", payload);
  return response.data;
}

export async function updateState(stateId: number, payload: Partial<AlertState>): Promise<AlertState> {
  const response = await api.patch<AlertState>(`/alerts/states/${stateId}/`, payload);
  return response.data;
}

export async function deleteState(stateId: number): Promise<void> {
  await api.delete(`/alerts/states/${stateId}/`);
}

export async function reorderStates(stateIds: number[]): Promise<AlertState[]> {
  const response = await api.post<AlertState[]>("/alerts/states/reorder/", { state_ids: stateIds });
  return response.data;
}

export async function createTag(payload: Partial<Tag>): Promise<Tag> {
  const response = await api.post<Tag>("/alerts/tags/", payload);
  return response.data;
}

export async function updateTag(tagId: number, payload: Partial<Tag>): Promise<Tag> {
  const response = await api.patch<Tag>(`/alerts/tags/${tagId}/`, payload);
  return response.data;
}

export async function deleteTag(tagId: number): Promise<void> {
  await api.delete(`/alerts/tags/${tagId}/`);
}
