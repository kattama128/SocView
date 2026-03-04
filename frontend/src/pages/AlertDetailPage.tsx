import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  IconButton,
  LinearProgress,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  addAlertTag,
  addComment,
  assignAlert,
  changeAlertState,
  downloadAttachment,
  fetchAlert,
  fetchAlertStates,
  fetchAuditLogs,
  fetchAlertTimeline,
  fetchTags,
  fetchUsers,
  removeAlertTag,
  uploadAttachment,
} from "../services/alertsApi";
import { canWriteAlerts } from "../services/roleUtils";
import { useAuth } from "../context/AuthContext";
import { Alert as AlertModel, AlertState, AlertTimelineEvent, AuditLog, Tag, UserSummary } from "../types/alerts";

export default function AlertDetailPage() {
  const { alertId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [alertData, setAlertData] = useState<AlertModel | null>(null);
  const [states, setStates] = useState<AlertState[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<AlertTimelineEvent[]>([]);

  const [selectedState, setSelectedState] = useState<number | "">("");
  const [selectedTag, setSelectedTag] = useState<number | "">("");
  const [selectedAssignee, setSelectedAssignee] = useState<number | "">("");
  const [commentBody, setCommentBody] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [payloadView, setPayloadView] = useState<"raw" | "parsed">("raw");

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const writable = canWriteAlerts(user?.role, user?.permissions);

  const loadData = async () => {
    if (!alertId) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [alertResp, stateResp, tagResp, userResp, auditResp, timelineResp] = await Promise.all([
        fetchAlert(alertId),
        fetchAlertStates(),
        fetchTags(),
        fetchUsers(),
        fetchAuditLogs(alertId),
        fetchAlertTimeline(alertId),
      ]);
      setAlertData(alertResp);
      setStates(stateResp.filter((state) => state.is_enabled));
      setTags(tagResp);
      setUsers(userResp);
      setAuditLogs(auditResp);
      setTimelineEvents(timelineResp);

      setSelectedState(alertResp.current_state);
      setSelectedAssignee(alertResp.assignment?.assigned_to ?? "");
    } catch {
      setError("Impossibile caricare i dettagli alert.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [alertId]);

  const availableTags = useMemo(() => {
    if (!alertData) {
      return tags;
    }
    const currentIds = new Set(alertData.tags.map((item) => item.id));
    return tags.filter((item) => !currentIds.has(item.id));
  }, [alertData, tags]);

  const executeAction = async (action: () => Promise<void>, successMessage: string) => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await action();
      await loadData();
      setSuccess(successMessage);
    } catch {
      setError("Operazione non completata.");
    } finally {
      setBusy(false);
    }
  };

  const handleAttachmentDownload = async (attachmentId: number, filename: string) => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const blob = await downloadAttachment(attachmentId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename || `attachment-${attachmentId}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setSuccess(`Download avviato: ${filename}`);
    } catch {
      setError("Impossibile scaricare allegato.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <LinearProgress />;
  }

  if (!alertData) {
    return <Alert severity="error">Alert non trovato.</Alert>;
  }

  return (
    <Stack spacing={2}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <IconButton onClick={() => navigate(-1)}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5">Dettaglio Alert #{alertData.id}</Typography>
      </Box>

      {error ? <Alert severity="error">{error}</Alert> : null}
      {success ? <Alert severity="success">{success}</Alert> : null}

      <Card>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={8}>
              <Typography variant="h6">{alertData.title}</Typography>
              <Typography color="text.secondary">Sorgente: {alertData.source_name}</Typography>
              <Typography color="text.secondary">Source ID: {alertData.source_id || "-"}</Typography>
              <Typography color="text.secondary">
                Timestamp evento: {new Date(alertData.event_timestamp).toLocaleString("it-IT")}
              </Typography>
            </Grid>
            <Grid item xs={12} md={4}>
              <Stack spacing={1}>
                <Chip label={`Severita: ${alertData.severity.toUpperCase()}`} color="warning" />
                <Chip label={`Stato: ${alertData.current_state_detail.name}`} color="info" />
                <Chip label={alertData.is_active ? "Alert attivo" : "Alert non attivo"} color="default" />
              </Stack>
            </Grid>
          </Grid>

          <Divider sx={{ my: 2 }} />

          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <Typography variant="subtitle2">Vista payload</Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={payloadView}
              onChange={(_, value) => {
                if (value === "raw" || value === "parsed") {
                  setPayloadView(value);
                }
              }}
            >
              <ToggleButton value="raw">Raw</ToggleButton>
              <ToggleButton value="parsed">Parsed</ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          {alertData.parse_error_detail ? (
            <Alert severity="error" sx={{ mb: 1 }}>
              Errore parsing: {alertData.parse_error_detail}
            </Alert>
          ) : null}

          <Box component="pre" sx={{ overflowX: "auto", bgcolor: "#f8f9fa", p: 1 }}>
            {payloadView === "raw"
              ? JSON.stringify(alertData.raw_payload ?? {}, null, 2)
              : JSON.stringify(alertData.parsed_payload ?? null, null, 2)}
          </Box>

          {payloadView === "parsed" ? (
            <>
              <Typography variant="subtitle2" sx={{ mt: 1 }}>
                Field schema
              </Typography>
              <Box component="pre" sx={{ overflowX: "auto", bgcolor: "#f8f9fa", p: 1 }}>
                {JSON.stringify(alertData.parsed_field_schema ?? [], null, 2)}
              </Box>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Quick Actions
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <Stack direction="row" spacing={1}>
                <TextField
                  select
                  fullWidth
                  label="Nuovo stato"
                  value={selectedState}
                  onChange={(event) => setSelectedState(Number(event.target.value))}
                  disabled={!writable || busy}
                >
                  {states.map((state) => (
                    <MenuItem key={state.id} value={state.id}>
                      {state.name}
                    </MenuItem>
                  ))}
                </TextField>
                <Button
                  variant="contained"
                  disabled={!writable || busy || !selectedState}
                  onClick={() =>
                    executeAction(
                      async () => {
                        await changeAlertState(String(alertData.id), Number(selectedState));
                      },
                      "Stato aggiornato",
                    )
                  }
                >
                  Cambia
                </Button>
              </Stack>
            </Grid>

            <Grid item xs={12} md={4}>
              <Stack direction="row" spacing={1}>
                <TextField
                  select
                  fullWidth
                  label="Assegna a"
                  value={selectedAssignee}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSelectedAssignee(value === "" ? "" : Number(value));
                  }}
                  disabled={!writable || busy}
                >
                  <MenuItem value="">Nessuno</MenuItem>
                  {users.map((item) => (
                    <MenuItem key={item.id} value={item.id}>
                      {item.username} ({item.role})
                    </MenuItem>
                  ))}
                </TextField>
                <Button
                  variant="contained"
                  disabled={!writable || busy}
                  onClick={() =>
                    executeAction(
                      async () => {
                        await assignAlert(
                          String(alertData.id),
                          selectedAssignee === "" ? null : Number(selectedAssignee),
                        );
                      },
                      "Assegnazione aggiornata",
                    )
                  }
                >
                  Assegna
                </Button>
              </Stack>
            </Grid>

            <Grid item xs={12} md={4}>
              <Stack direction="row" spacing={1}>
                <TextField
                  select
                  fullWidth
                  label="Aggiungi tag"
                  value={selectedTag}
                  onChange={(event) => setSelectedTag(Number(event.target.value))}
                  disabled={!writable || busy}
                >
                  <MenuItem value="">Seleziona</MenuItem>
                  {availableTags.map((tag) => (
                    <MenuItem key={tag.id} value={tag.id}>
                      {tag.name}
                    </MenuItem>
                  ))}
                </TextField>
                <Button
                  variant="contained"
                  disabled={!writable || busy || !selectedTag}
                  onClick={() =>
                    executeAction(
                      async () => {
                        await addAlertTag(String(alertData.id), Number(selectedTag));
                        setSelectedTag("");
                      },
                      "Tag aggiunto",
                    )
                  }
                >
                  Aggiungi
                </Button>
              </Stack>
            </Grid>
          </Grid>

          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 2 }}>
            {alertData.tags.map((tag) => (
              <Chip
                key={tag.id}
                label={tag.name}
                onDelete={
                  writable
                    ? () =>
                        void executeAction(
                          async () => {
                            await removeAlertTag(String(alertData.id), tag.id);
                          },
                          "Tag rimosso",
                        )
                    : undefined
                }
                sx={{
                  backgroundColor: tag.color || undefined,
                  color: tag.color ? "#fff" : undefined,
                }}
              />
            ))}
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6">Note</Typography>
          <Stack spacing={1} sx={{ mt: 1 }}>
            {(alertData.comments ?? []).map((comment) => (
              <Box key={comment.id} sx={{ p: 1.2, bgcolor: "#f8f9fa", borderRadius: 1 }}>
                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                  {comment.body}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {comment.author_detail?.username ?? "sconosciuto"} - {new Date(comment.created_at).toLocaleString("it-IT")}
                </Typography>
              </Box>
            ))}

            <TextField
              multiline
              minRows={3}
              label="Nuova nota"
              value={commentBody}
              onChange={(event) => setCommentBody(event.target.value)}
              disabled={!writable || busy}
            />
            <Button
              variant="contained"
              sx={{ alignSelf: "flex-start" }}
              disabled={!writable || busy || !commentBody.trim()}
              onClick={() =>
                executeAction(
                  async () => {
                    await addComment(String(alertData.id), commentBody.trim());
                    setCommentBody("");
                  },
                  "Nota aggiunta",
                )
              }
            >
              Salva nota
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6">Allegati</Typography>
          <Stack spacing={1} sx={{ mt: 1 }}>
            {(alertData.attachments ?? []).map((attachment) => (
              <Box key={attachment.id} sx={{ p: 1.2, bgcolor: "#f8f9fa", borderRadius: 1 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                  <Typography variant="body2">{attachment.filename}</Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={busy}
                    onClick={() => void handleAttachmentDownload(attachment.id, attachment.filename)}
                  >
                    Download
                  </Button>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {(attachment.size / 1024).toFixed(1)} KB - {attachment.uploaded_by_detail?.username ?? "sconosciuto"}
                </Typography>
                <Typography variant="caption" display="block" color="text.secondary">
                  Scan: {attachment.scan_status} - {attachment.scan_detail}
                </Typography>
              </Box>
            ))}

            <Stack direction="row" spacing={1} alignItems="center">
              <Button variant="outlined" component="label" disabled={!writable || busy}>
                Seleziona file
                <input
                  hidden
                  type="file"
                  onChange={(event) => setAttachmentFile(event.target.files?.[0] ?? null)}
                />
              </Button>
              <Typography variant="body2" color="text.secondary">
                {attachmentFile?.name ?? "Nessun file selezionato"}
              </Typography>
              <Button
                variant="contained"
                disabled={!writable || busy || !attachmentFile}
                onClick={() =>
                  executeAction(
                    async () => {
                      if (!attachmentFile) {
                        return;
                      }
                      await uploadAttachment(String(alertData.id), attachmentFile);
                      setAttachmentFile(null);
                    },
                    "Allegato caricato",
                  )
                }
              >
                Upload
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6">Timeline eventi</Typography>
          <Stack spacing={1} sx={{ mt: 1 }}>
            {timelineEvents.map((event, index) => (
              <Box key={`${event.type}-${event.timestamp}-${index}`} sx={{ p: 1.2, bgcolor: "#f8f9fa", borderRadius: 1 }}>
                <Typography variant="body2">
                  <strong>{event.title}</strong>
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {new Date(event.timestamp).toLocaleString("it-IT")} - {event.type}
                </Typography>
                {event.detail ? (
                  <Box component="pre" sx={{ overflowX: "auto", bgcolor: "#fff", p: 1, mt: 0.7 }}>
                    {JSON.stringify(event.detail, null, 2)}
                  </Box>
                ) : null}
              </Box>
            ))}
            {timelineEvents.length === 0 ? (
              <Typography color="text.secondary">Nessun evento timeline disponibile.</Typography>
            ) : null}
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6">Audit Log</Typography>
          <Stack spacing={1} sx={{ mt: 1 }}>
            {auditLogs.map((log) => (
              <Box key={log.id} sx={{ p: 1.2, bgcolor: "#f8f9fa", borderRadius: 1 }}>
                <Typography variant="body2">
                  <strong>{log.action}</strong> su {log.object_type}#{log.object_id}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {log.actor_detail?.username ?? "system"} - {new Date(log.timestamp).toLocaleString("it-IT")}
                </Typography>
              </Box>
            ))}
            {auditLogs.length === 0 ? (
              <Typography color="text.secondary">Nessuna traccia audit disponibile.</Typography>
            ) : null}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
