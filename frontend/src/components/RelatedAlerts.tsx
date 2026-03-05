import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { Box, Chip, IconButton, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";

import { RelatedAlert } from "../types/alerts";

type RelatedAlertsProps = {
  alerts: RelatedAlert[];
};

function severityColor(severity: RelatedAlert["severity"]): "error" | "warning" | "info" | "success" {
  if (severity === "critical") {
    return "error";
  }
  if (severity === "high") {
    return "warning";
  }
  if (severity === "medium") {
    return "info";
  }
  return "success";
}

export default function RelatedAlerts({ alerts }: RelatedAlertsProps) {
  const theme = useTheme();
  if (alerts.length === 0) {
    return (
      <Typography color="text.secondary" data-testid="related-alerts">
        Nessun alert correlato negli ultimi 30 giorni.
      </Typography>
    );
  }

  return (
    <Stack spacing={1.2} data-testid="related-alerts">
      {alerts.map((item) => (
        <Box
          key={item.id}
          sx={{
            border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
            borderRadius: 1.5,
            p: 1.2,
            display: "flex",
            flexDirection: "column",
            gap: 0.8,
          }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {item.title}
            </Typography>
            <IconButton
              size="small"
              onClick={() => window.open(`/alerts/${item.id}`, "_blank", "noopener,noreferrer")}
              aria-label={`Apri alert ${item.id} in nuova tab`}
            >
              <OpenInNewIcon fontSize="small" />
            </IconButton>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip size="small" color={severityColor(item.severity)} label={item.severity.toUpperCase()} />
            <Typography variant="caption" color="text.secondary">
              {new Date(item.created_at).toLocaleString("it-IT")}
            </Typography>
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}
