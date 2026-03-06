import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";

import type { CustomerSummary } from "../../types/alerts";
import type { Source, SourceCapabilitiesResponse, SourceType } from "../../types/ingestion";

export type SourceDraft = {
  name: string;
  description: string;
  type: SourceType;
  is_enabled: boolean;
  customer: number | null;
};

const DEFAULT_SOURCE_DRAFT: SourceDraft = {
  name: "",
  description: "",
  type: "webhook",
  is_enabled: true,
  customer: null,
};

export function buildSourceDraftFromSource(source: Source): SourceDraft {
  return {
    name: source.name,
    description: source.description,
    type: source.type,
    is_enabled: source.is_enabled,
    customer: source.customer,
  };
}

export { DEFAULT_SOURCE_DRAFT };

type Props = {
  open: boolean;
  editingSource: Source | null;
  draft: SourceDraft;
  capabilities: SourceCapabilitiesResponse | null;
  customers: CustomerSummary[];
  saving: boolean;
  onChange: (partial: Partial<SourceDraft>) => void;
  onClose: () => void;
  onSave: () => void;
};

export default function SourceDialog({
  open,
  editingSource,
  draft,
  capabilities,
  customers,
  saving,
  onChange,
  onClose,
  onSave,
}: Props) {
  const availableTypes = capabilities?.types?.filter((t) => t.create_enabled) ?? [];
  const canSave = draft.name.trim().length > 0 && draft.type && !saving;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{editingSource ? `Modifica fonte: ${editingSource.name}` : "Nuova fonte"}</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Nome *"
            value={draft.name}
            onChange={(e) => onChange({ name: e.target.value })}
            disabled={saving}
          />
          <TextField
            label="Descrizione"
            value={draft.description}
            onChange={(e) => onChange({ description: e.target.value })}
            disabled={saving}
            multiline
            rows={2}
          />
          <TextField
            select
            label="Tipo sorgente *"
            value={draft.type}
            onChange={(e) => onChange({ type: e.target.value as SourceType })}
            disabled={saving || Boolean(editingSource)}
            helperText={editingSource ? "Il tipo non può essere modificato dopo la creazione" : ""}
          >
            {availableTypes.length > 0
              ? availableTypes.map((t) => (
                  <MenuItem key={t.type} value={t.type}>
                    {t.label} {t.status !== "ga" ? `(${t.status})` : ""}
                  </MenuItem>
                ))
              : (
                // Fallback if capabilities not loaded
                (["webhook", "rest", "syslog_udp", "syslog_tcp", "imap"] as SourceType[]).map((t) => (
                  <MenuItem key={t} value={t}>
                    {t}
                  </MenuItem>
                ))
              )}
          </TextField>
          <TextField
            select
            label="Cliente (vuoto = globale)"
            value={draft.customer ?? ""}
            onChange={(e) =>
              onChange({ customer: e.target.value === "" ? null : Number(e.target.value) })
            }
            disabled={saving}
          >
            <MenuItem value="">
              <em>Globale (nessun cliente)</em>
            </MenuItem>
            {customers.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography>Fonte attiva</Typography>
            <Switch
              checked={draft.is_enabled}
              onChange={(e) => onChange({ is_enabled: e.target.checked })}
              disabled={saving}
            />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Annulla
        </Button>
        <Button
          variant="contained"
          onClick={onSave}
          disabled={!canSave}
          startIcon={saving ? <CircularProgress size={14} /> : null}
        >
          {saving ? "Salvataggio..." : "Salva"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
