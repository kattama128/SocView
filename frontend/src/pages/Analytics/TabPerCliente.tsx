import { Alert, Card, CardContent, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";

import Heatmap from "../../components/Heatmap";
import { AnalyticsByCustomerItem } from "../../types/analytics";

type Props = {
  canView: boolean;
  data: AnalyticsByCustomerItem[];
  matrix: number[][];
};

export default function TabPerCliente({ canView, data, matrix }: Props) {
  if (!canView) {
    return <Alert severity="warning">Sezione disponibile solo con permesso `manage_customers`.</Alert>;
  }

  return (
    <Stack spacing={1.2}>
      <Card>
        <CardContent>
          <Typography sx={{ fontWeight: 600, mb: 1 }}>Analisi per cliente</Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nome</TableCell>
                <TableCell>Alert aperti</TableCell>
                <TableCell>SLA compliance %</TableCell>
                <TableCell>Analisti assegnati</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((row) => (
                <TableRow key={`${row.customer_id ?? "none"}-${row.customer_name}`}>
                  <TableCell>{row.customer_name}</TableCell>
                  <TableCell>{row.open_alerts}</TableCell>
                  <TableCell>{row.sla_compliance.toFixed(2)}%</TableCell>
                  <TableCell>{row.assigned_analysts}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography sx={{ fontWeight: 600, mb: 1 }}>Heatmap alert 7x24</Typography>
          <Heatmap matrix={matrix} />
        </CardContent>
      </Card>
    </Stack>
  );
}
