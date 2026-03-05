import {
  Alert,
  Button,
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

import { fetchSecurityAuditEvents, SecurityAuditEvent } from "../../services/usersApi";

function toCsv(rows: SecurityAuditEvent[]): string {
  const header = ["timestamp", "actor", "action", "object_type", "object_id", "ip"];
  const body = rows.map((row) => [
    row.created_at,
    row.actor_username || "",
    row.action,
    row.object_type,
    row.object_id,
    row.ip_address || "",
  ]);
  return [header, ...body]
    .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

function downloadCsv(content: string, fileName: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export default function TabAudit() {
  const [events, setEvents] = useState<SecurityAuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actorFilter, setActorFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    void fetchSecurityAuditEvents(200)
      .then((payload) => {
        setEvents(payload);
      })
      .catch(() => {
        setError("Impossibile caricare audit sicurezza.");
      });
  }, []);

  const filtered = useMemo(() => {
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : null;
    const toTs = dateTo ? new Date(dateTo).getTime() : null;
    return events.filter((event) => {
      if (actorFilter && String(event.actor ?? "") !== actorFilter) {
        return false;
      }
      if (actionFilter && !event.action.toLowerCase().includes(actionFilter.toLowerCase())) {
        return false;
      }
      const createdTs = new Date(event.created_at).getTime();
      if (fromTs !== null && createdTs < fromTs) {
        return false;
      }
      if (toTs !== null && createdTs > toTs) {
        return false;
      }
      return true;
    });
  }, [actionFilter, actorFilter, dateFrom, dateTo, events]);

  const actorOptions = useMemo(() => {
    const map = new Map<number, string>();
    events.forEach((event) => {
      if (event.actor !== null) {
        map.set(event.actor, event.actor_username || `user-${event.actor}`);
      }
    });
    return Array.from(map.entries());
  }, [events]);

  return (
    <Stack spacing={1.2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h6">Audit Sicurezza</Typography>
        <Button
          variant="outlined"
          onClick={() => {
            const csv = toCsv(filtered);
            downloadCsv(csv, "security-audit.csv");
          }}
        >
          Esporta CSV
        </Button>
      </Stack>

      {error ? <Alert severity="error">{error}</Alert> : null}

      <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
        <TextField
          select
          label="Utente"
          value={actorFilter}
          onChange={(event) => setActorFilter(event.target.value)}
          sx={{ minWidth: 220 }}
        >
          <MenuItem value="">Tutti</MenuItem>
          {actorOptions.map(([id, username]) => (
            <MenuItem key={id} value={String(id)}>
              {username}
            </MenuItem>
          ))}
        </TextField>
        <TextField label="Tipo evento" value={actionFilter} onChange={(event) => setActionFilter(event.target.value)} />
        <TextField
          label="Da"
          type="datetime-local"
          value={dateFrom}
          onChange={(event) => setDateFrom(event.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          label="A"
          type="datetime-local"
          value={dateTo}
          onChange={(event) => setDateTo(event.target.value)}
          InputLabelProps={{ shrink: true }}
        />
      </Stack>

      <Table size="small" data-testid="audit-table">
        <TableHead>
          <TableRow>
            <TableCell>Timestamp</TableCell>
            <TableCell>Utente</TableCell>
            <TableCell>Azione</TableCell>
            <TableCell>Oggetto</TableCell>
            <TableCell>ID</TableCell>
            <TableCell>IP</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {filtered.map((event) => (
            <TableRow key={event.id}>
              <TableCell>{new Date(event.created_at).toLocaleString("it-IT")}</TableCell>
              <TableCell>{event.actor_username || "system"}</TableCell>
              <TableCell>{event.action}</TableCell>
              <TableCell>{event.object_type}</TableCell>
              <TableCell>{event.object_id}</TableCell>
              <TableCell>{event.ip_address || "-"}</TableCell>
            </TableRow>
          ))}
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6}>Nessun evento audit disponibile.</TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </Stack>
  );
}
