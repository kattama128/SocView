import { Card, CardContent, Grid, Typography } from "@mui/material";

export default function HomePage() {
  return (
    <Grid container spacing={2}>
      <Grid item xs={12}>
        <Typography variant="h4" gutterBottom>
          Dashboard Home
        </Typography>
        <Typography color="text.secondary">
          Placeholder iniziale per metriche SOC, alert e KPI operativi.
        </Typography>
      </Grid>

      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6">Eventi Recenti</Typography>
            <Typography color="text.secondary">Componente placeholder.</Typography>
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6">Stato Ingestione</Typography>
            <Typography color="text.secondary">Componente placeholder.</Typography>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}
