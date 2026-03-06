import { useState } from "react";

import AddIcon from "@mui/icons-material/Add";
import CableIcon from "@mui/icons-material/Cable";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";

import { createSource, deleteSource, runSourceNow, testSourceConnection, updateSource } from "../../services/ingestionApi";
import { surfaceCardSx, surfaceInsetSx } from "../../styles/surfaces";
import type { CustomerSummary } from "../../types/alerts";
import type { Source, SourceCapabilitiesResponse, SourceWritePayload } from "../../types/ingestion";
import SourceDialog, { buildSourceDraftFromSource, DEFAULT_SOURCE_DRAFT, type SourceDraft } from "./SourceDialog";

type SnackbarState = { open: boolean; message: string; severity: "success" | "error" | "info" };

const EMPTY_SNACKBAR: SnackbarState = { open: false, message: "", severity: "info" };

type Props = {
  sources: Source[];
  capabilities: SourceCapabilitiesResponse | null;
  customers: CustomerSummary[];
  canManageSources: boolean;
  onSourcesChanged: (updatedSources: Source[]) => void;
};

export default function IntegrationsOverviewCard({
  sources,
  capabilities,
  customers,
  canManageSources,
  onSourcesChanged,
}: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<Source | null>(null);
  const [draft, setDraft] = useState<SourceDraft>(DEFAULT_SOURCE_DRAFT);
  const [saving, setSaving] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState<Source | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [testing, setTesting] = useState<number | null>(null);
  const [running, setRunning] = useState<number | null>(null);

  const [snackbar, setSnackbar] = useState<SnackbarState>(EMPTY_SNACKBAR);

  const showSnack = (message: string, severity: SnackbarState["severity"]) => {
    setSnackbar({ open: true, message, severity });
  };

  const enabledCount = sources.filter((item) => item.is_enabled).length;

  const resolveAuthLabel = (source: Source) => {
    const auth = source.config?.config_json?.auth as Record<string, unknown> | undefined;
    const authType = typeof auth?.type === "string" ? auth.type : "";
    if (!authType) {
      return source.type === "webhook" ? "api_key" : "none";
    }
    return authType;
  };

  const resolveMethodLabel = (source: Source) => {
    const method = source.config?.config_json?.method;
    if (typeof method === "string" && method.trim()) {
      return method.toUpperCase();
    }
    return source.type === "webhook" ? "PUSH" : "POLL";
  };

  // ── Dialog handlers ────────────────────────────────────
  const openCreate = () => {
    setEditingSource(null);
    setDraft(DEFAULT_SOURCE_DRAFT);
    setDialogOpen(true);
  };

  const openEdit = (source: Source) => {
    setEditingSource(source);
    setDraft(buildSourceDraftFromSource(source));
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (saving) return;
    setDialogOpen(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingSource) {
        const updated = await updateSource(editingSource.id, {
          name: draft.name,
          description: draft.description,
          is_enabled: draft.is_enabled,
          customer: draft.customer,
        });
        onSourcesChanged(sources.map((s) => (s.id === updated.id ? updated : s)));
        showSnack(`Fonte "${updated.name}" aggiornata.`, "success");
      } else {
        const payload: SourceWritePayload = {
          name: draft.name,
          description: draft.description,
          type: draft.type,
          is_enabled: draft.is_enabled,
          customer: draft.customer,
          severity_map: {},
          config: {
            config_json: {},
            poll_interval_seconds: 60,
            secrets_ref: "",
            rate_limit_per_minute: 100,
          },
          dedup_policy: {
            fingerprint_fields: [],
            strategy: "increment_occurrence",
          },
        };
        const created = await createSource(payload);
        onSourcesChanged([...sources, created]);
        showSnack(`Fonte "${created.name}" creata.`, "success");
      }
      setDialogOpen(false);
    } catch {
      showSnack("Errore durante il salvataggio della fonte.", "error");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete handlers ────────────────────────────────────
  const confirmDelete = (source: Source) => {
    setDeleteConfirm(source);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await deleteSource(deleteConfirm.id);
      onSourcesChanged(sources.filter((s) => s.id !== deleteConfirm.id));
      showSnack(`Fonte "${deleteConfirm.name}" eliminata.`, "success");
    } catch {
      showSnack("Errore durante l'eliminazione della fonte.", "error");
    } finally {
      setDeleting(false);
      setDeleteConfirm(null);
    }
  };

  // ── Test & Run handlers ────────────────────────────────
  const handleTest = async (source: Source) => {
    setTesting(source.id);
    try {
      const result = await testSourceConnection(source.id);
      showSnack(
        result.ok ? `✓ Test OK: ${result.detail || source.name}` : `✗ Test fallito: ${result.detail}`,
        result.ok ? "success" : "error",
      );
    } catch {
      showSnack(`Errore test connessione per "${source.name}".`, "error");
    } finally {
      setTesting(null);
    }
  };

  const handleRunNow = async (source: Source) => {
    setRunning(source.id);
    try {
      const result = await runSourceNow(source.id);
      showSnack(`Run avviato: task ${result.task_id}`, "info");
    } catch {
      showSnack(`Errore avvio run per "${source.name}".`, "error");
    } finally {
      setRunning(null);
    }
  };

  return (
    <>
      <Card sx={surfaceCardSx}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography sx={{ color: "#e2e8f0", fontWeight: 700 }}>Integrazioni globali</Typography>
              <Chip
                size="small"
                label={`Attive: ${enabledCount}/${sources.length}`}
                sx={{ color: "#86efac", border: "1px solid rgba(74,222,128,0.35)", background: "rgba(20,83,45,0.2)" }}
              />
            </Stack>
            {canManageSources && (
              <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={openCreate}>
                Nuova fonte
              </Button>
            )}
          </Stack>
          <Divider sx={{ mb: 2, borderColor: "rgba(148,163,184,0.2)" }} />
          {sources.length === 0 ? (
            <Stack spacing={1} alignItems="center" sx={{ py: 3 }}>
              <Typography sx={{ color: "#94a3b8" }}>Nessuna fonte configurata.</Typography>
              {canManageSources && (
                <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
                  Crea la prima fonte
                </Button>
              )}
            </Stack>
          ) : (
            <Grid container spacing={1.5}>
              {sources.map((source) => (
                <Grid item xs={12} md={6} key={source.id}>
                  <Card sx={surfaceInsetSx}>
                    <CardContent sx={{ pb: "12px !important" }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                        <Stack sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{ color: "#e2e8f0", fontWeight: 600 }} noWrap>
                            {source.name}
                          </Typography>
                          <Typography sx={{ color: "#94a3b8", fontSize: 12 }}>
                            {source.type.toUpperCase()} • {resolveMethodLabel(source)} • auth:{resolveAuthLabel(source)}
                          </Typography>
                          {source.description && (
                            <Typography sx={{ color: "#64748b", fontSize: 11, mt: 0.5 }} noWrap>
                              {source.description}
                            </Typography>
                          )}
                        </Stack>
                        {canManageSources && (
                          <Stack direction="row" spacing={0} sx={{ ml: 1 }}>
                            <Tooltip title="Testa connessione">
                              <span>
                                <IconButton
                                  size="small"
                                  onClick={() => handleTest(source)}
                                  disabled={testing === source.id || running === source.id}
                                >
                                  {testing === source.id ? (
                                    <CircularProgress size={14} />
                                  ) : (
                                    <CableIcon fontSize="small" />
                                  )}
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip title="Esegui ora">
                              <span>
                                <IconButton
                                  size="small"
                                  onClick={() => handleRunNow(source)}
                                  disabled={testing === source.id || running === source.id}
                                >
                                  {running === source.id ? (
                                    <CircularProgress size={14} />
                                  ) : (
                                    <PlayArrowIcon fontSize="small" />
                                  )}
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip title="Modifica">
                              <IconButton size="small" onClick={() => openEdit(source)}>
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Elimina">
                              <IconButton
                                size="small"
                                onClick={() => confirmDelete(source)}
                                sx={{ color: "#fca5a5" }}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        )}
                      </Stack>
                      <Stack direction="row" spacing={0.5} sx={{ mt: 1, flexWrap: "wrap" }}>
                        <Chip
                          size="small"
                          label={source.is_enabled ? "Attiva" : "Disattiva"}
                          sx={{
                            color: source.is_enabled ? "#86efac" : "#fca5a5",
                            border: "1px solid rgba(148,163,184,0.24)",
                          }}
                        />
                        <Chip
                          size="small"
                          label={`Parser ${source.parser_definition_name ? "associato" : "assente"}`}
                          sx={{ color: "#c4b5fd", border: "1px solid rgba(167,139,250,0.35)" }}
                        />
                        <Chip
                          size="small"
                          label={`Tipi allarme ${source.alert_type_rules.length}`}
                          sx={{ color: "#bae6fd", border: "1px solid rgba(56,189,248,0.35)" }}
                        />
                        {source.customer_name && (
                          <Chip
                            size="small"
                            label={source.customer_name}
                            sx={{ color: "#a5f3fc", border: "1px solid rgba(6,182,212,0.35)" }}
                          />
                        )}
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </CardContent>
      </Card>

      {/* Source Create/Edit Dialog */}
      <SourceDialog
        open={dialogOpen}
        editingSource={editingSource}
        draft={draft}
        capabilities={capabilities}
        customers={customers}
        saving={saving}
        onChange={(partial) => setDraft((prev) => ({ ...prev, ...partial }))}
        onClose={closeDialog}
        onSave={handleSave}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={Boolean(deleteConfirm)} onClose={() => !deleting && setDeleteConfirm(null)}>
        <DialogTitle>Elimina fonte</DialogTitle>
        <DialogContent>
          <Typography>
            Sei sicuro di voler eliminare la fonte <strong>{deleteConfirm?.name}</strong>? L'operazione non è
            reversibile.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)} disabled={deleting}>
            Annulla
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDelete}
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={14} /> : null}
          >
            {deleting ? "Eliminazione..." : "Elimina"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar feedback */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(EMPTY_SNACKBAR)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(EMPTY_SNACKBAR)} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}
