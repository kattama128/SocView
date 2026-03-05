import { Chip, Tooltip } from "@mui/material";

import { SlaStatus } from "../types/alerts";

type SlaIndicatorProps = {
  slaStatus?: SlaStatus | null;
};

export default function SlaIndicator({ slaStatus }: SlaIndicatorProps) {
  if (!slaStatus) {
    return <Chip label="SLA non configurato" size="small" variant="outlined" data-testid="sla-indicator" />;
  }

  const hasBreach = slaStatus.response === "breached" || slaStatus.resolution === "breached";
  const hasWarning = slaStatus.response === "warning" || slaStatus.resolution === "warning";

  const color: "success" | "warning" | "error" = hasBreach ? "error" : hasWarning ? "warning" : "success";
  const label = hasBreach ? "SLA violato" : hasWarning ? "SLA in warning" : "SLA OK";

  return (
    <Tooltip title={`Risposta: ${slaStatus.response_remaining_minutes} min rimasti`}>
      <Chip size="small" color={color} label={label} data-testid="sla-indicator" />
    </Tooltip>
  );
}
