import { Card, CardContent, Grid, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { fetchSourceStats } from "../../services/ingestionApi";
import { AnalyticsBySourceItem } from "../../types/analytics";
import { SourceStats } from "../../types/ingestion";

type Props = {
  data: AnalyticsBySourceItem[];
};

export default function TabPerFonte({ data }: Props) {
  const [selected, setSelected] = useState<{ sourceName: string; stats: SourceStats } | null>(null);

  const top10 = data.slice(0, 10).map((item) => ({ name: item.source_name, volume: item.alert_total }));

  const drillDown = async (row: AnalyticsBySourceItem) => {
    if (!row.source_id) {
      return;
    }
    try {
      const stats = await fetchSourceStats(row.source_id);
      setSelected({ sourceName: row.source_name, stats });
    } catch {
      setSelected(null);
    }
  };

  return (
    <Stack spacing={1.2}>
      <Card>
        <CardContent>
          <Typography sx={{ fontWeight: 600, mb: 1 }}>Top-10 fonti per volume alert</Typography>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={top10} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={220} />
              <Tooltip />
              <Bar dataKey="volume" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography sx={{ fontWeight: 600, mb: 1 }}>Dettaglio per fonte</Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nome fonte</TableCell>
                <TableCell>Alert totali</TableCell>
                <TableCell>% critici</TableCell>
                <TableCell>MTTR medio (h)</TableCell>
                <TableCell>Record ingeriti totali</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((row) => (
                <TableRow
                  key={`${row.source_name}-${row.source_id ?? "none"}`}
                  hover
                  sx={{ cursor: row.source_id ? "pointer" : "default" }}
                  onClick={() => {
                    void drillDown(row);
                  }}
                >
                  <TableCell>{row.source_name}</TableCell>
                  <TableCell>{row.alert_total}</TableCell>
                  <TableCell>{row.critical_percentage.toFixed(2)}%</TableCell>
                  <TableCell>{row.mttr_hours ?? "-"}</TableCell>
                  <TableCell>{row.records_ingested_total}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selected ? (
        <Grid container spacing={1.2}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography sx={{ fontWeight: 600 }}>Drill-down {selected.sourceName}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Ultimo run: {selected.stats.last_run_at ? new Date(selected.stats.last_run_at).toLocaleString("it-IT") : "-"}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Stato ultimo run: {selected.stats.last_run_status ?? "-"}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Runs oggi: {selected.stats.runs_today}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Record oggi: {selected.stats.records_today}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      ) : null}
    </Stack>
  );
}
