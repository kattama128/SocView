import { Card, CardContent, Chip, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";

import type { CustomerSourceCatalogEntry } from "../../types/alerts";
import { surfaceCardSx } from "../../styles/surfaces";

type Props = {
  sources: CustomerSourceCatalogEntry[];
  onToggle: (sourceId: number, enabled: boolean) => void;
  loading?: boolean;
};

export default function CustomerSourcesTable({ sources, onToggle, loading = false }: Props) {
  return (
    <Card sx={surfaceCardSx}>
      <CardContent>
        <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1.2 }}>Abilitazioni Fonti per Cliente</Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: "#94a3b8" }}>Fonte</TableCell>
              <TableCell sx={{ color: "#94a3b8" }}>Tipo</TableCell>
              <TableCell sx={{ color: "#94a3b8" }}>Parser</TableCell>
              <TableCell sx={{ color: "#94a3b8" }}>Tipi allarme</TableCell>
              <TableCell sx={{ color: "#94a3b8" }}>Stato globale</TableCell>
              <TableCell sx={{ color: "#94a3b8" }}>Abilitata per cliente</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sources.map((source) => {
              return (
                <TableRow key={source.source_id}>
                  <TableCell sx={{ color: "#e2e8f0" }}>
                    <Stack spacing={0.4}>
                      <Typography sx={{ color: "#e2e8f0", fontSize: 13 }}>{source.name}</Typography>
                      <Typography sx={{ color: "#64748b", fontSize: 12 }}>{source.description || "Nessuna descrizione"}</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ color: "#cbd5e1" }}>{source.type}</TableCell>
                  <TableCell sx={{ color: "#c4b5fd" }}>{source.parser_definition_name ?? "-"}</TableCell>
                  <TableCell sx={{ color: "#fcd34d" }}>{source.alert_type_rules_count}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={source.globally_enabled ? "Attiva" : "Disabilitata"}
                      sx={{
                        color: source.globally_enabled ? "#86efac" : "#fca5a5",
                        border: "1px solid rgba(148,163,184,0.24)",
                        background: "transparent",
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={source.customer_enabled}
                      disabled={!source.globally_enabled || loading}
                      onChange={(event) => onToggle(source.source_id, event.target.checked)}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
            {!sources.length ? (
              <TableRow>
                <TableCell colSpan={6} sx={{ color: "#64748b" }}>
                  Nessuna fonte globale disponibile.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
