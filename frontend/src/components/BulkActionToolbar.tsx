import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  LinearProgress,
  Paper,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";

type Props = {
  selectedCount: number;
  totalCount: number;
  allFilteredSelected: boolean;
  processing: boolean;
  onToggleAllFiltered: (checked: boolean) => void;
  onOpenChangeState: () => void;
  onOpenAssign: () => void;
  onOpenAddTag: () => void;
  onClearSelection: () => void;
};

export default function BulkActionToolbar({
  selectedCount,
  totalCount,
  allFilteredSelected,
  processing,
  onToggleAllFiltered,
  onOpenChangeState,
  onOpenAssign,
  onOpenAddTag,
  onClearSelection,
}: Props) {
  const effectiveCount = allFilteredSelected ? totalCount : selectedCount;
  if (effectiveCount <= 0) {
    return null;
  }

  return (
    <Paper
      elevation={10}
      data-testid="bulk-action-toolbar"
      sx={{
        position: "fixed",
        left: { xs: 12, md: 280 },
        right: 16,
        bottom: 12,
        zIndex: 1500,
        border: "1px solid var(--border-subtle)",
        background: "var(--surface-2)",
      }}
    >
      {processing ? <LinearProgress sx={{ borderRadius: 0 }} /> : null}
      <Toolbar sx={{ minHeight: "56px !important", display: "flex", gap: 1.2, flexWrap: "wrap" }}>
        <Typography sx={{ fontWeight: 700, fontSize: 14 }}>
          {effectiveCount} alert selezionati
        </Typography>

        <FormControlLabel
          sx={{ ml: 0.2 }}
          control={(
            <Checkbox
              size="small"
              checked={allFilteredSelected}
              onChange={(event) => onToggleAllFiltered(event.target.checked)}
            />
          )}
          label={<Typography sx={{ fontSize: 13 }}>Tutti i risultati filtrati</Typography>}
        />

        <Box sx={{ flexGrow: 1 }} />

        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            variant="contained"
            disabled={processing}
            onClick={onOpenChangeState}
            data-testid="bulk-change-state-button"
          >
            Cambia Stato
          </Button>
          <Button
            size="small"
            variant="outlined"
            disabled={processing}
            onClick={onOpenAssign}
            data-testid="bulk-assign-button"
          >
            Assegna a
          </Button>
          <Button
            size="small"
            variant="outlined"
            disabled={processing}
            onClick={onOpenAddTag}
            data-testid="bulk-add-tag-button"
          >
            Aggiungi Tag
          </Button>
          <Button size="small" disabled={processing} onClick={onClearSelection}>
            Annulla
          </Button>
        </Stack>
      </Toolbar>
    </Paper>
  );
}
