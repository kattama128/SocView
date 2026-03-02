import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { fetchAlerts, fetchAlertStates } from "../services/alertsApi";
import { Alert as AlertModel, AlertState as AlertStateModel } from "../types/alerts";

const severityOptions = ["", "low", "medium", "high", "critical"];

export default function TenantPage() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<AlertModel[]>([]);
  const [states, setStates] = useState<AlertStateModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [textFilter, setTextFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");

  useEffect(() => {
    const loadStates = async () => {
      try {
        const data = await fetchAlertStates();
        setStates(data.filter((state) => state.is_enabled));
      } catch {
        setError("Impossibile caricare gli stati alert.");
      }
    };

    void loadStates();
  }, []);

  useEffect(() => {
    const loadAlerts = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchAlerts({
          text: textFilter || undefined,
          state: stateFilter || undefined,
          severity: severityFilter || undefined,
        });
        setAlerts(data);
      } catch {
        setError("Errore durante il caricamento della lista alert.");
      } finally {
        setLoading(false);
      }
    };

    void loadAlerts();
  }, [textFilter, stateFilter, severityFilter]);

  const emptyText = useMemo(() => {
    if (loading) {
      return "";
    }
    return alerts.length === 0 ? "Nessun alert trovato con i filtri correnti." : "";
  }, [alerts.length, loading]);

  return (
    <Stack spacing={2}>
      <Card>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            Alert Tenant
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Filtro rapido per stato, severita e testo.
          </Typography>

          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <TextField
                label="Ricerca testo"
                fullWidth
                value={textFilter}
                onChange={(event) => setTextFilter(event.target.value)}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                select
                label="Stato"
                fullWidth
                value={stateFilter}
                onChange={(event) => setStateFilter(event.target.value)}
              >
                <MenuItem value="">Tutti</MenuItem>
                {states.map((state) => (
                  <MenuItem key={state.id} value={String(state.id)}>
                    {state.name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                select
                label="Severita"
                fullWidth
                value={severityFilter}
                onChange={(event) => setSeverityFilter(event.target.value)}
              >
                {severityOptions.map((severity) => (
                  <MenuItem key={severity || "all"} value={severity}>
                    {severity ? severity.toUpperCase() : "Tutte"}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {loading ? (
            <Stack alignItems="center" justifyContent="center" sx={{ minHeight: 180 }}>
              <CircularProgress />
            </Stack>
          ) : null}

          {error ? <Alert severity="error">{error}</Alert> : null}

          {!loading ? (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Titolo</TableCell>
                  <TableCell>Severita</TableCell>
                  <TableCell>Stato</TableCell>
                  <TableCell>Attivo</TableCell>
                  <TableCell>Assegnato</TableCell>
                  <TableCell>Tag</TableCell>
                  <TableCell>Evento</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {alerts.map((alertItem) => (
                  <TableRow
                    key={alertItem.id}
                    hover
                    sx={{ cursor: "pointer" }}
                    onClick={() => navigate(`/alerts/${alertItem.id}`)}
                  >
                    <TableCell>{alertItem.title}</TableCell>
                    <TableCell>{alertItem.severity.toUpperCase()}</TableCell>
                    <TableCell>{alertItem.current_state_detail?.name}</TableCell>
                    <TableCell>{alertItem.is_active ? "Si" : "No"}</TableCell>
                    <TableCell>{alertItem.assignment?.assigned_to_detail?.username ?? "-"}</TableCell>
                    <TableCell>
                      <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                        {alertItem.tags.map((tag) => (
                          <Chip
                            key={tag.id}
                            label={tag.name}
                            size="small"
                            sx={{
                              backgroundColor: tag.color || undefined,
                              color: tag.color ? "#fff" : undefined,
                            }}
                          />
                        ))}
                      </Box>
                    </TableCell>
                    <TableCell>{new Date(alertItem.event_timestamp).toLocaleString("it-IT")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}

          {emptyText ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              {emptyText}
            </Typography>
          ) : null}
        </CardContent>
      </Card>
    </Stack>
  );
}
