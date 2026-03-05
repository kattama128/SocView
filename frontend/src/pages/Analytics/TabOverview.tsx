import { Card, CardContent, Grid, Stack, Typography } from "@mui/material";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AnalyticsOverviewResponse } from "../../types/analytics";

type Props = {
  data: AnalyticsOverviewResponse | null;
};

const pieColors = ["#ef4444", "#f59e0b", "#3b82f6", "#22c55e", "#64748b"];

export default function TabOverview({ data }: Props) {
  if (!data) {
    return <Typography color="text.secondary">Nessun dato disponibile.</Typography>;
  }

  const kpis = data.kpis;

  return (
    <Stack spacing={1.2}>
      <Grid container spacing={1.2}>
        <Grid item xs={12} md={3}>
          <Card data-testid="kpi-card">
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Alert totali periodo
              </Typography>
              <Typography variant="h5">{kpis.total_alerts}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card data-testid="kpi-card">
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Tasso chiusura %
              </Typography>
              <Typography variant="h5">{kpis.closure_rate.toFixed(2)}%</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card data-testid="kpi-card">
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                MTTR medio (ore)
              </Typography>
              <Typography variant="h5">{kpis.mttr_hours ?? "-"}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card data-testid="kpi-card">
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Alert critici
              </Typography>
              <Typography variant="h5">{kpis.critical_alerts}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          <Typography sx={{ fontWeight: 600, mb: 1 }}>Alert per giorno (stack severità)</Typography>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.alerts_by_day}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="critical" stackId="a" fill="#ef4444" />
              <Bar dataKey="high" stackId="a" fill="#f97316" />
              <Bar dataKey="medium" stackId="a" fill="#f59e0b" />
              <Bar dataKey="low" stackId="a" fill="#22c55e" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Grid container spacing={1.2}>
        <Grid item xs={12} md={5}>
          <Card>
            <CardContent>
              <Typography sx={{ fontWeight: 600, mb: 1 }}>Distribuzione stato</Typography>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={data.state_distribution} dataKey="count" nameKey="state" outerRadius={90}>
                    {data.state_distribution.map((entry, index) => (
                      <Cell key={entry.state} fill={pieColors[index % pieColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Typography sx={{ fontWeight: 600, mb: 1 }}>Trend MTTR giornaliero (ore)</Typography>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={data.mttr_daily}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="mttr_hours" stroke="#3b82f6" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
