import { useEffect, useState } from "react";

import { Alert, Button, Card, CardContent, CircularProgress, Divider, Stack, TextField, Typography } from "@mui/material";

import { saveSlaConfig } from "../../services/alertsApi";
import { surfaceCardSx } from "../../styles/surfaces";
import type { SlaConfig } from "../../types/alerts";

const SEVERITIES = ["critical", "high", "medium", "low"] as const;
type Severity = (typeof SEVERITIES)[number];

const SEVERITY_LABELS: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const SEVERITY_COLORS: Record<Severity, string> = {
  critical: "#fca5a5",
  high: "#fde68a",
  medium: "#fdba74",
  low: "#86efac",
};

const DEFAULT_VALUES: Record<Severity, { response_minutes: number; resolution_minutes: number }> = {
  critical: { response_minutes: 15, resolution_minutes: 60 },
  high: { response_minutes: 30, resolution_minutes: 120 },
  medium: { response_minutes: 60, resolution_minutes: 240 },
  low: { response_minutes: 120, resolution_minutes: 480 },
};

type SlaRow = { response_minutes: number; resolution_minutes: number };

type Props = {
  slaConfigs: SlaConfig[];
  onUpdated: (updated: SlaConfig) => void;
  canManage: boolean;
};

export default function SlaConfigCard({ slaConfigs, onUpdated, canManage }: Props) {
  const [rows, setRows] = useState<Record<Severity, SlaRow>>(() => {
    const initial: Record<Severity, SlaRow> = { ...DEFAULT_VALUES };
    slaConfigs.forEach((cfg) => {
      if (SEVERITIES.includes(cfg.severity as Severity)) {
        initial[cfg.severity as Severity] = {
          response_minutes: cfg.response_minutes,
          resolution_minutes: cfg.resolution_minutes,
        };
      }
    });
    return initial;
  });

  const [saving, setSaving] = useState<Severity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Sync when slaConfigs prop changes (e.g. initial load)
  useEffect(() => {
    setRows((prev) => {
      const next = { ...prev };
      slaConfigs.forEach((cfg) => {
        if (SEVERITIES.includes(cfg.severity as Severity)) {
          next[cfg.severity as Severity] = {
            response_minutes: cfg.response_minutes,
            resolution_minutes: cfg.resolution_minutes,
          };
        }
      });
      return next;
    });
  }, [slaConfigs]);

  const handleSave = async (severity: Severity) => {
    setSaving(severity);
    setError(null);
    setSuccess(null);
    try {
      const updated = await saveSlaConfig({
        severity,
        response_minutes: rows[severity].response_minutes,
        resolution_minutes: rows[severity].resolution_minutes,
      });
      onUpdated(updated);
      setSuccess(`SLA ${SEVERITY_LABELS[severity]} aggiornato.`);
      setTimeout(() => setSuccess(null), 3000);
    } catch {
      setError(`Errore salvataggio SLA ${SEVERITY_LABELS[severity]}.`);
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card sx={surfaceCardSx}>
      <CardContent>
        <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>Configurazione SLA</Typography>
        <Divider sx={{ mb: 2, borderColor: "rgba(148,163,184,0.2)" }} />
        {!canManage && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Sono necessari i permessi <strong>manage_customers</strong> per modificare gli SLA.
          </Alert>
        )}
        {error && (
          <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mb: 1 }}>
            {success}
          </Alert>
        )}
        <Stack spacing={1.5}>
          {SEVERITIES.map((sev) => (
            <Stack key={sev} direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
              <Typography
                sx={{
                  color: SEVERITY_COLORS[sev],
                  minWidth: 80,
                  fontWeight: 600,
                  fontSize: 13,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                }}
              >
                {SEVERITY_LABELS[sev]}
              </Typography>
              <TextField
                label="Risposta (min)"
                type="number"
                size="small"
                value={rows[sev].response_minutes}
                onChange={(e) =>
                  setRows((prev) => ({
                    ...prev,
                    [sev]: { ...prev[sev], response_minutes: Math.max(1, Number(e.target.value)) },
                  }))
                }
                disabled={!canManage || saving === sev}
                inputProps={{ min: 1 }}
                sx={{ width: 150 }}
              />
              <TextField
                label="Risoluzione (min)"
                type="number"
                size="small"
                value={rows[sev].resolution_minutes}
                onChange={(e) =>
                  setRows((prev) => ({
                    ...prev,
                    [sev]: { ...prev[sev], resolution_minutes: Math.max(1, Number(e.target.value)) },
                  }))
                }
                disabled={!canManage || saving === sev}
                inputProps={{ min: 1 }}
                sx={{ width: 170 }}
              />
              <Button
                variant="outlined"
                size="small"
                onClick={() => handleSave(sev)}
                disabled={!canManage || saving !== null}
                startIcon={saving === sev ? <CircularProgress size={12} /> : null}
                sx={{ minWidth: 80 }}
              >
                {saving === sev ? "..." : "Salva"}
              </Button>
            </Stack>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}
