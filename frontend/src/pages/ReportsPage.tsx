import DownloadIcon from "@mui/icons-material/Download";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import TableViewIcon from "@mui/icons-material/TableView";
import { Box, Button, Paper, Stack, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";

import { surfaceCardSx } from "../styles/surfaces";

export default function ReportsPage() {
  const navigate = useNavigate();

  return (
    <Stack spacing={2}>
      <Box>
        <Typography sx={{ color: "#f8fafc", fontSize: { xs: 26, md: 34 }, fontWeight: 700 }}>Reports</Typography>
        <Typography sx={{ color: "#64748b" }}>Esporta dati e consulta documentazione API.</Typography>
      </Box>

      <Stack spacing={1.5}>
        <Paper sx={{ ...surfaceCardSx, p: 2 }}>
          <Typography sx={{ color: "#e2e8f0", fontWeight: 600, mb: 0.8 }}>Export CSV Alert</Typography>
          <Typography sx={{ color: "#64748b", fontSize: 13, mb: 1.5 }}>
            Usa la vista alert tenant per esportare la lista filtrata con colonne configurabili.
          </Typography>
          <Button variant="outlined" startIcon={<TableViewIcon />} onClick={() => navigate("/active-alarms")}>
            Apri Active Alarms
          </Button>
        </Paper>

        <Paper sx={{ ...surfaceCardSx, p: 2 }}>
          <Typography sx={{ color: "#e2e8f0", fontWeight: 600, mb: 0.8 }}>OpenAPI / Swagger</Typography>
          <Typography sx={{ color: "#64748b", fontSize: 13, mb: 1.5 }}>
            Accedi alla documentazione API e prova endpoint direttamente.
          </Typography>
          <Button variant="outlined" startIcon={<OpenInNewIcon />} onClick={() => window.open("/api/docs/", "_blank", "noopener,noreferrer")}>
            Apri Swagger
          </Button>
        </Paper>

        <Paper sx={{ ...surfaceCardSx, p: 2 }}>
          <Typography sx={{ color: "#e2e8f0", fontWeight: 600, mb: 0.8 }}>Quick Download</Typography>
          <Typography sx={{ color: "#64748b", fontSize: 13, mb: 1.5 }}>
            Scarica il template comando CSV dal README operativo.
          </Typography>
          <Button variant="outlined" startIcon={<DownloadIcon />} onClick={() => navigate("/")}>
            Torna Dashboard
          </Button>
        </Paper>
      </Stack>
    </Stack>
  );
}
