import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import LinkIcon from "@mui/icons-material/Link";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  LinearProgress,
  MenuItem,
  Snackbar,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useNavigate, useParams } from "react-router-dom";

import IocChips from "../components/IocChips";
import MitreAutocomplete from "../components/MitreAutocomplete";
import RelatedAlerts from "../components/RelatedAlerts";
import SlaIndicator from "../components/SlaIndicator";
import { useAuth } from "../context/AuthContext";
import {
  addAlertTag,
  addComment,
  assignAlert,
  changeAlertState,
  downloadAttachment,
  fetchAlert,
  fetchAlertStates,
  fetchAlertTimeline,
  fetchAuditLogs,
  fetchRelatedAlerts,
  fetchTags,
  fetchUsers,
  removeAlertTag,
  updateAlert,
  uploadAttachment,
} from "../services/alertsApi";
import { canWriteAlerts } from "../services/roleUtils";
import {
  Alert as AlertModel,
  AlertState,
  AlertTimelineEvent,
  AuditLog,
  RelatedAlert,
  Tag,
  UserSummary,
} from "../types/alerts";

function severityChipColor(severity: AlertModel["severity"]): "error" | "warning" | "info" | "success" {
  if (severity === "critical") {
    return "error";
  }
  if (severity === "high") {
    return "warning";
  }
  if (severity === "medium") {
    return "info";
  }
  return "success";
}

export default function AlertDetailPage() {
  const { alertId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const theme = useTheme();

  const [alertData, setAlertData] = useState<AlertModel | null>(null);
  const [states, setStates] = useState<AlertState[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<AlertTimelineEvent[]>([]);
  const [relatedAlerts, setRelatedAlerts] = useState<RelatedAlert[]>([]);

  const [selectedState, setSelectedState] = useState<number | "">("");
  const [selectedTag, setSelectedTag] = useState<number | "">("");
  const [selectedAssignee, setSelectedAssignee] = useState<number | "">("");
  const [commentBody, setCommentBody] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [payloadView, setPayloadView] = useState<"raw" | "parsed">("raw");
  const [stateDialogOpen, setStateDialogOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const writable = canWriteAlerts(user?.role, user?.permissions);

  const safeFetch = async <T,>(request: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await request;
    } catch {
      return fallback;
    }
  };

  const loadData = async () => {
    if (!alertId) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const alertResp = await fetchAlert(alertId);
      const [stateResp, tagResp, userResp, auditResp, timelineResp, relatedResp] = await Promise.all([
        safeFetch(fetchAlertStates(), [] as AlertState[]),
        safeFetch(fetchTags(), [] as Tag[]),
        safeFetch(fetchUsers(), [] as UserSummary[]),
        safeFetch(fetchAuditLogs(alertId), [] as AuditLog[]),
        safeFetch(fetchAlertTimeline(alertId), [] as AlertTimelineEvent[]),
        safeFetch(fetchRelatedAlerts(alertId), [] as RelatedAlert[]),
      ]);

      const enabledStates = stateResp.filter((state) => state.is_enabled);
      const fallbackState: AlertState[] =
        enabledStates.length > 0
          ? enabledStates
          : [
              {
                id: alertResp.current_state,
                name: alertResp.current_state_detail?.name ?? "Stato corrente",
                order: alertResp.current_state_detail?.order ?? 0,
                is_final: alertResp.current_state_detail?.is_final ?? false,
                is_enabled: true,
                created_at: alertResp.current_state_detail?.created_at ?? alertResp.created_at,
                updated_at: alertResp.current_state_detail?.updated_at ?? alertResp.updated_at,
              },
            ];

      setAlertData(alertResp);
      setStates(fallbackState);
      setTags(tagResp);
      setUsers(userResp);
      setAuditLogs(auditResp);
      setTimelineEvents(timelineResp);
      setRelatedAlerts(relatedResp);

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

  const mentionQuery = useMemo(() => {
    const match = commentBody.match(/(?:^|\s)@([A-Za-z0-9_.-]*)$/);
    return match ? match[1].toLowerCase() : null;
  }, [commentBody]);

  const mentionSuggestions = useMemo(() => {
    if (mentionQuery === null) {
      return [];
    }
    return users
      .filter((item) => item.username.toLowerCase().startsWith(mentionQuery))
      .slice(0, 6);
  }, [mentionQuery, users]);

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

  const applyMention = (username: string) => {
    setCommentBody((current) => current.replace(/(?:^|\s)@[A-Za-z0-9_.-]*$/, ` @${username} `).trimStart());
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
        <Typography variant="h5" component="h1" data-testid="alert-title">
          Dettaglio Alert #{alertData.id}
        </Typography>
      </Box>

      {error ? <Alert severity="error">{error}</Alert> : null}
      {success ? <Alert severity="success">{success}</Alert> : null}

      <Grid container spacing={2}>
        <Grid item xs={12} lg={8}>
          <Stack spacing={2}>
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
                      <Chip
                        label={`Severità: ${alertData.severity.toUpperCase()}`}
                        color={severityChipColor(alertData.severity)}
                      />
                      <Chip label={`Stato: ${alertData.current_state_detail.name}`} color="info" />
                      <Chip label={alertData.is_active ? "Alert attivo" : "Alert non attivo"} />
                      <SlaIndicator slaStatus={alertData.sla_status} />
                      {alertData.mitre_technique_id ? (
                        <Button
                          size="small"
                          startIcon={<LinkIcon />}
                          href={`https://attack.mitre.org/techniques/${alertData.mitre_technique_id}/`}
                          target="_blank"
                          rel="noreferrer"
                          variant="outlined"
                        >
                          MITRE {alertData.mitre_technique_id}
                        </Button>
                      ) : (
                        <Chip size="small" variant="outlined" label="MITRE non impostato" />
                      )}
                    </Stack>
                  </Grid>
                </Grid>

                <Divider sx={{ my: 2 }} />

                <MitreAutocomplete
                  value={alertData.mitre_technique_id}
                  disabled={!writable || busy}
                  onChange={(techniqueId) =>
                    void executeAction(
                      async () => {
                        await updateAlert(String(alertData.id), { mitre_technique_id: techniqueId });
                      },
                      "Tecnica MITRE aggiornata",
                    )
                  }
                />

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

                <Box
                  component="pre"
                  sx={{
                    overflowX: "auto",
                    backgroundColor: alpha(theme.palette.background.paper, 0.65),
                    borderRadius: 1,
                    p: 1,
                  }}
                >
                  {payloadView === "raw"
                    ? JSON.stringify(alertData.raw_payload ?? {}, null, 2)
                    : JSON.stringify(alertData.parsed_payload ?? null, null, 2)}
                </Box>

                {payloadView === "parsed" ? (
                  <>
                    <Typography variant="subtitle2" sx={{ mt: 1 }}>
                      Field schema
                    </Typography>
                    <Box
                      component="pre"
                      sx={{
                        overflowX: "auto",
                        backgroundColor: alpha(theme.palette.background.paper, 0.65),
                        borderRadius: 1,
                        p: 1,
                      }}
                    >
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
                        data-testid="change-state-button"
                        disabled={!writable || busy || !selectedState}
                        onClick={() => setStateDialogOpen(true)}
                      >
                        Cambia Stato
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
                        color: tag.color ? theme.palette.common.white : undefined,
                      }}
                    />
                  ))}
                </Box>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h6">Commenti</Typography>
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {(alertData.comments ?? []).map((comment) => (
                    <Box
                      key={comment.id}
                      sx={{
                        p: 1.2,
                        backgroundColor: alpha(theme.palette.background.paper, 0.72),
                        borderRadius: 1,
                      }}
                    >
                      <ReactMarkdown>{comment.body}</ReactMarkdown>
                      <Typography variant="caption" color="text.secondary">
                        {comment.author_detail?.username ?? "sconosciuto"} -{" "}
                        {new Date(comment.created_at).toLocaleString("it-IT")}
                      </Typography>
                    </Box>
                  ))}

                  <TextField
                    multiline
                    minRows={3}
                    label="Nuovo commento"
                    value={commentBody}
                    name="comment"
                    inputProps={{ "data-testid": "comment-input" }}
                    onChange={(event) => setCommentBody(event.target.value)}
                    disabled={!writable || busy}
                    helperText="Supporta Markdown e menzioni con @username"
                  />
                  {mentionQuery !== null && mentionSuggestions.length > 0 ? (
                    <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
                      {mentionSuggestions.map((item) => (
                        <Chip
                          key={item.id}
                          label={`@${item.username}`}
                          size="small"
                          onClick={() => applyMention(item.username)}
                          variant="outlined"
                        />
                      ))}
                    </Stack>
                  ) : null}
                  <Button
                    variant="contained"
                    sx={{ alignSelf: "flex-start" }}
                    data-testid="submit-comment-button"
                    disabled={!writable || busy || !commentBody.trim()}
                    onClick={() =>
                      (() => {
                        const trimmedBody = commentBody.trim();
                        setCommentBody("");
                        return executeAction(
                          async () => {
                            await addComment(String(alertData.id), trimmedBody);
                          },
                          "Commento aggiunto",
                        );
                      })()
                    }
                  >
                    Commenta
                  </Button>
                </Stack>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h6">Allegati</Typography>
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {(alertData.attachments ?? []).map((attachment) => (
                    <Box
                      key={attachment.id}
                      sx={{
                        p: 1.2,
                        backgroundColor: alpha(theme.palette.background.paper, 0.72),
                        borderRadius: 1,
                      }}
                    >
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
                        {(attachment.size / 1024).toFixed(1)} KB -{" "}
                        {attachment.uploaded_by_detail?.username ?? "sconosciuto"}
                      </Typography>
                      <Typography variant="caption" display="block" color="text.secondary">
                        Scan: {attachment.scan_status} - {attachment.scan_detail}
                      </Typography>
                    </Box>
                  ))}

                  <Stack direction="row" spacing={1} alignItems="center">
                    <Button variant="outlined" component="label" disabled={!writable || busy}>
                      Seleziona file
                      <input hidden type="file" onChange={(event) => setAttachmentFile(event.target.files?.[0] ?? null)} />
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
                <Stack spacing={1} sx={{ mt: 1 }} data-testid="alert-timeline">
                  {timelineEvents.map((event, index) => (
                    <Box
                      key={`${event.type}-${event.timestamp}-${index}`}
                      data-testid="timeline-event"
                      sx={{
                        p: 1.2,
                        backgroundColor: alpha(theme.palette.background.paper, 0.72),
                        borderRadius: 1,
                      }}
                    >
                      <Typography variant="body2">
                        <strong>{event.title}</strong>
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(event.timestamp).toLocaleString("it-IT")} - {event.type}
                      </Typography>
                      {event.detail && !event.type.toLowerCase().includes("comment") ? (
                        <Box
                          component="pre"
                          sx={{
                            overflowX: "auto",
                            backgroundColor: alpha(theme.palette.background.paper, 0.65),
                            p: 1,
                            mt: 0.7,
                            borderRadius: 1,
                          }}
                        >
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
                    <Box
                      key={log.id}
                      sx={{
                        p: 1.2,
                        backgroundColor: alpha(theme.palette.background.paper, 0.72),
                        borderRadius: 1,
                      }}
                    >
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
        </Grid>

        <Grid item xs={12} lg={4}>
          <Stack spacing={2}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  IOC Estratti
                </Typography>
                <IocChips iocs={alertData.iocs} />
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Alert Correlati
                </Typography>
                <RelatedAlerts alerts={relatedAlerts} />
              </CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>

      <Dialog open={stateDialogOpen} onClose={() => setStateDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Cambia Stato</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1}>
            {states.map((state) => (
              <Button
                key={state.id}
                role="option"
                variant={selectedState === state.id ? "contained" : "outlined"}
                onClick={() => setSelectedState(state.id)}
                disabled={!writable || busy}
              >
                {state.name}
              </Button>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStateDialogOpen(false)}>Annulla</Button>
          <Button
            variant="contained"
            type="submit"
            disabled={!writable || busy || !selectedState}
            onClick={() => {
              setStateDialogOpen(false);
              void executeAction(
                async () => {
                  await changeAlertState(String(alertData.id), Number(selectedState));
                },
                "Stato aggiornato",
              );
            }}
          >
            Conferma
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(success)}
        autoHideDuration={3500}
        onClose={() => setSuccess(null)}
        message={success ?? ""}
        data-testid="snackbar-success"
      />
    </Stack>
  );
}
