import api from "./api";
import {
  Alert,
  AlertState,
  Attachment,
  AlertDetailFieldConfig,
  AlertTimelineEvent,
  AuditLog,
  CommentNote,
  CustomerSettingsResponse,
  CustomerSettingsUpdatePayload,
  CustomerOverview,
  CustomerSummary,
  NotificationListResponse,
  NotificationPreferences,
  RelatedAlert,
  SavedSearch,
  SearchRequest,
  SearchResponse,
  SlaConfig,
  SourceFieldSchema,
  Tag,
  UserSummary,
  ExportPreviewResponse,
  BulkActionRequest,
  BulkActionResponse,
} from "../types/alerts";

export type AlertFilters = {
  state?: string;
  severity?: string;
  text?: string;
  is_active?: string;
  page?: number;
  page_size?: number;
};

export async function fetchAlerts(filters: AlertFilters = {}): Promise<Alert[]> {
  const response = await api.get<Alert[] | { results: Alert[] }>("/alerts/alerts/", { params: filters });
  if (Array.isArray(response.data)) {
    return response.data;
  }
  return response.data.results ?? [];
}

export async function fetchCustomers(isEnabled = true): Promise<CustomerSummary[]> {
  const response = await api.get<CustomerSummary[] | { results: CustomerSummary[] }>("/alerts/customers/", {
    params: { is_enabled: isEnabled ? "true" : undefined },
  });
  if (Array.isArray(response.data)) {
    return response.data;
  }
  return response.data.results ?? [];
}

export async function fetchCustomersOverview(ordering = "name", isEnabled = true): Promise<CustomerOverview[]> {
  const response = await api.get<CustomerOverview[]>("/alerts/customers/overview/", {
    params: {
      ordering,
      is_enabled: isEnabled ? "true" : undefined,
    },
  });
  return response.data;
}

export async function fetchCustomerSettings(customerId: number): Promise<CustomerSettingsResponse> {
  const response = await api.get<CustomerSettingsResponse>(`/alerts/customers/${customerId}/settings/`);
  return response.data;
}

export async function updateCustomerSettings(
  customerId: number,
  payload: CustomerSettingsUpdatePayload,
): Promise<CustomerSettingsResponse> {
  const response = await api.patch<CustomerSettingsResponse>(`/alerts/customers/${customerId}/settings/`, payload);
  return response.data;
}

export type CustomerMembershipRecord = {
  id: number;
  user_id: number;
  username: string;
  email: string;
  scope: "viewer" | "triage" | "manager";
  is_active: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
};

export async function fetchCustomerMemberships(customerId: number): Promise<CustomerMembershipRecord[]> {
  const response = await api.get<CustomerMembershipRecord[]>(`/alerts/customers/${customerId}/memberships/`);
  return response.data;
}

export async function upsertCustomerMembership(
  customerId: number,
  payload: { user_id: number; scope: "viewer" | "triage" | "manager"; is_active?: boolean; notes?: string },
): Promise<CustomerMembershipRecord[]> {
  const response = await api.post<CustomerMembershipRecord[]>(`/alerts/customers/${customerId}/memberships/`, payload);
  return response.data;
}

export async function deleteCustomerMembership(customerId: number, userId: number): Promise<CustomerMembershipRecord[]> {
  const response = await api.delete<CustomerMembershipRecord[]>(`/alerts/customers/${customerId}/memberships/`, {
    data: { user_id: userId },
  });
  return response.data;
}

export async function searchAlerts(payload: SearchRequest, customerId?: number | null): Promise<SearchResponse> {
  const response = await api.post<SearchResponse>("/alerts/search/", payload, {
    params: customerId ? { customer_id: customerId } : undefined,
  });
  return response.data;
}

export async function fetchSourceFieldSchemas(sourceName?: string, customerId?: number | null): Promise<SourceFieldSchema[]> {
  const response = await api.get<SourceFieldSchema[]>("/alerts/field-schemas/", {
    params: {
      ...(sourceName ? { source_name: sourceName } : {}),
      ...(customerId ? { customer_id: customerId } : {}),
    },
  });
  return response.data;
}

export async function fetchAlertDetailFieldConfigs(customerId?: number | null): Promise<AlertDetailFieldConfig[]> {
  const response = await api.get<AlertDetailFieldConfig[]>("/alerts/detail-field-configs/", {
    params: customerId ? { customer_id: customerId } : undefined,
  });
  return response.data;
}

export async function setAlertDetailFieldConfig(
  payload: {
    source_name: string;
    alert_type: string;
    visible_fields: string[];
  },
  customerId?: number | null,
): Promise<AlertDetailFieldConfig> {
  const response = await api.put<AlertDetailFieldConfig>("/alerts/detail-field-configs/set/", payload, {
    params: customerId ? { customer_id: customerId } : undefined,
  });
  return response.data;
}

export async function fetchSavedSearches(): Promise<SavedSearch[]> {
  const response = await api.get<SavedSearch[] | { results: SavedSearch[] }>("/alerts/saved-searches/");
  if (Array.isArray(response.data)) {
    return response.data;
  }
  return response.data.results ?? [];
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
  const response = await api.get<Tag[] | { results: Tag[] }>("/alerts/tags/");
  if (Array.isArray(response.data)) {
    return response.data;
  }
  return response.data.results ?? [];
}

export async function fetchUsers(): Promise<UserSummary[]> {
  const response = await api.get<UserSummary[]>("/auth/users/assignable/");
  return response.data;
}

export async function fetchAuditLogs(alertId?: string): Promise<AuditLog[]> {
  const response = await api.get<AuditLog[] | { results: AuditLog[] }>("/alerts/audit-logs/", {
    params: alertId ? { alert_id: alertId } : undefined,
  });
  if (Array.isArray(response.data)) {
    return response.data;
  }
  return response.data.results ?? [];
}

export async function changeAlertState(alertId: string, stateId: number): Promise<Alert> {
  const response = await api.patch<Alert>(`/alerts/alerts/${alertId}/change-state/`, { state_id: stateId });
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

export async function downloadAttachment(attachmentId: number): Promise<Blob> {
  const response = await api.get(`/alerts/attachments/${attachmentId}/download/`, {
    responseType: "blob",
  });
  return response.data as Blob;
}

export async function fetchAlertTimeline(alertId: string): Promise<AlertTimelineEvent[]> {
  const response = await api.get<AlertTimelineEvent[]>(`/alerts/alerts/${alertId}/timeline/`);
  return response.data;
}

export async function fetchRelatedAlerts(alertId: string): Promise<RelatedAlert[]> {
  const response = await api.get<RelatedAlert[]>(`/alerts/alerts/${alertId}/related/`);
  return response.data;
}

export async function updateAlert(alertId: string, payload: Partial<Alert>): Promise<Alert> {
  const response = await api.patch<Alert>(`/alerts/alerts/${alertId}/`, payload);
  return response.data;
}

export async function fetchSlaConfig(): Promise<SlaConfig[]> {
  const response = await api.get<SlaConfig[]>("/alerts/sla-config/");
  return response.data;
}

export async function saveSlaConfig(payload: {
  severity: string;
  response_minutes: number;
  resolution_minutes: number;
}): Promise<SlaConfig> {
  const response = await api.post<SlaConfig>("/alerts/sla-config/", payload);
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

export async function exportAlertsPreviewConfigurable(
  payload: SearchRequest & { columns: string[]; all_results?: boolean; preview: true; limit?: number },
): Promise<ExportPreviewResponse> {
  const response = await api.post<ExportPreviewResponse>("/alerts/alerts/export-configurable/", payload);
  return response.data;
}

export async function bulkAlertsAction(payload: BulkActionRequest): Promise<BulkActionResponse> {
  const response = await api.post<BulkActionResponse>("/alerts/alerts/bulk-action/", payload);
  return response.data;
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

export async function snoozeNotification(notificationId: number, payload: { minutes?: number; snooze_until?: string }): Promise<void> {
  await api.post(`/alerts/notifications/${notificationId}/snooze/`, payload);
}

export async function fetchNotificationPreferences(): Promise<NotificationPreferences> {
  const response = await api.get<NotificationPreferences>("/alerts/notification-preferences/");
  return response.data;
}

export async function updateNotificationPreferences(
  payload: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  const response = await api.patch<NotificationPreferences>("/alerts/notification-preferences/", payload);
  return response.data;
}

export async function registerPushSubscription(payload: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<void> {
  await api.post("/alerts/push-subscriptions/", payload);
}

export async function fetchWebSocketToken(): Promise<string> {
  const response = await api.get<{ access: string }>("/auth/ws-token/");
  return response.data.access;
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
