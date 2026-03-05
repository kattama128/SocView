import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

type Props = {
  open: boolean;
  loading: boolean;
  error: string | null;
  count: number;
  columns: string[];
  rows: Array<Record<string, unknown>>;
  onClose: () => void;
  onConfirm: () => void;
};

function displayValue(value: unknown) {
  if (value === null || value === undefined) {
    return "-";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export default function ExportPreviewDialog({
  open,
  loading,
  error,
  count,
  columns,
  rows,
  onClose,
  onConfirm,
}: Props) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>Anteprima Export</DialogTitle>
      <DialogContent dividers>
        <Typography sx={{ mb: 1.2 }}>Totale risultati esportabili: <strong>{count}</strong></Typography>
        {loading ? <LinearProgress sx={{ mb: 1.2 }} /> : null}
        {error ? <Alert severity="error" sx={{ mb: 1.2 }}>{error}</Alert> : null}

        {columns.length ? (
          <TableContainer sx={{ maxHeight: 360 }}>
            <Table size="small" stickyHeader data-testid="preview-table">
              <TableHead>
                <TableRow>
                  {columns.map((column) => (
                    <TableCell key={column}>{column}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={`preview-${index}`}>
                    {columns.map((column) => (
                      <TableCell key={`${index}-${column}`}>{displayValue(row[column])}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Annulla</Button>
        <Button data-testid="preview-export-button" onClick={() => void 0} disabled={loading}>
          Anteprima
        </Button>
        <Button
          variant="contained"
          onClick={onConfirm}
          disabled={loading || Boolean(error)}
          data-testid="export-download-button"
        >
          Scarica CSV
        </Button>
      </DialogActions>
    </Dialog>
  );
}
