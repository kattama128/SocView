import { Card, CardContent, Grid, Typography } from "@mui/material";

import { surfaceSoftSx } from "../../styles/surfaces";

type Props = {
  customersCount: number;
  sourcesCount: number | null;
  activeAlerts: number;
  totalAlerts: number;
};

export default function ManagementStatsCards({ customersCount, sourcesCount, activeAlerts, totalAlerts }: Props) {
  const cards = [
    { label: "Clienti attivi", value: customersCount },
    { label: "Fonti globali", value: sourcesCount },
    { label: "Allarmi attivi", value: activeAlerts },
    { label: "Allarmi totali", value: totalAlerts },
  ];

  return (
    <Grid container spacing={2}>
      {cards.map((card) => (
        <Grid key={card.label} item xs={12} md={3}>
          <Card sx={surfaceSoftSx}>
            <CardContent>
              <Typography sx={{ color: "#94a3b8" }}>{card.label}</Typography>
              <Typography sx={{ color: "#f8fafc", fontSize: 28, fontWeight: 700 }}>
                {card.value === null ? "N/D" : card.value}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}
