import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";

import { fetchOnboardingPreference, updateOnboardingPreference } from "../services/coreApi";

type Props = {
  open: boolean;
  tenantKey: string | null;
  tenantDomain: string | null;
  onClose: () => void;
};

const steps = [
  "Configura la prima sorgente",
  "Crea un parser",
  "Invita utenti",
  "Pronto",
];

export default function OnboardingWizard({ open, tenantKey, tenantDomain, onClose }: Props) {
  const [activeStep, setActiveStep] = useState(0);
  const [sourcePreset, setSourcePreset] = useState("canary_tools_rest");
  const [parserTemplate, setParserTemplate] = useState("base");
  const [inviteEmails, setInviteEmails] = useState("");

  useEffect(() => {
    if (!open || !tenantKey) {
      return;
    }
    void fetchOnboardingPreference(tenantKey)
      .then((payload) => {
        const value = payload.value;
        const step = typeof value.step === "number" ? Number(value.step) : 0;
        if (step >= 0 && step <= 3) {
          setActiveStep(step);
        }
        if (typeof value.sourcePreset === "string") {
          setSourcePreset(value.sourcePreset);
        }
        if (typeof value.parserTemplate === "string") {
          setParserTemplate(value.parserTemplate);
        }
        if (typeof value.inviteEmails === "string") {
          setInviteEmails(value.inviteEmails);
        }
      })
      .catch(() => {
        // best effort
      });
  }, [open, tenantKey]);

  const persist = async (patch: Record<string, unknown>) => {
    if (!tenantKey) {
      return;
    }
    await updateOnboardingPreference(tenantKey, {
      step: activeStep,
      sourcePreset,
      parserTemplate,
      inviteEmails,
      ...patch,
    });
  };

  const handleNext = async () => {
    const nextStep = Math.min(activeStep + 1, steps.length - 1);
    setActiveStep(nextStep);
    await persist({ step: nextStep, completed: nextStep === steps.length - 1 });
  };

  const handleSkip = async () => {
    await persist({ completed: true, skipped: true, step: activeStep });
    onClose();
  };

  const handleFinish = async () => {
    await persist({ completed: true, skipped: false, step: steps.length - 1 });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Onboarding nuovo tenant</DialogTitle>
      <DialogContent>
        <Stepper activeStep={activeStep} sx={{ mb: 2 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {activeStep === 0 ? (
          <Stack spacing={1.2}>
            <Typography variant="body2">Scegli un preset iniziale per la prima sorgente.</Typography>
            <TextField
              select
              label="Preset sorgente"
              value={sourcePreset}
              onChange={(event) => setSourcePreset(event.target.value)}
            >
              <MenuItem value="canary_tools_rest">Canary Tools REST</MenuItem>
              <MenuItem value="sentinelone_rest">SentinelOne REST</MenuItem>
              <MenuItem value="manual">Config manuale</MenuItem>
            </TextField>
          </Stack>
        ) : null}

        {activeStep === 1 ? (
          <Stack spacing={1.2}>
            <Typography variant="body2">Seleziona un template parser da applicare.</Typography>
            <TextField
              select
              label="Template parser"
              value={parserTemplate}
              onChange={(event) => setParserTemplate(event.target.value)}
            >
              <MenuItem value="base">Base JSON</MenuItem>
              <MenuItem value="edr">EDR eventi endpoint</MenuItem>
              <MenuItem value="mail">Email security</MenuItem>
            </TextField>
          </Stack>
        ) : null}

        {activeStep === 2 ? (
          <Stack spacing={1.2}>
            <Typography variant="body2">Inserisci email da invitare (separate da virgola).</Typography>
            <TextField
              fullWidth
              multiline
              minRows={3}
              label="Email utenti"
              value={inviteEmails}
              onChange={(event) => setInviteEmails(event.target.value)}
            />
          </Stack>
        ) : null}

        {activeStep === 3 ? (
          <Stack spacing={1.2}>
            <Typography variant="body2">Configurazione iniziale completata.</Typography>
            <Box sx={{ p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
              <Typography variant="body2">Preset sorgente: {sourcePreset}</Typography>
              <Typography variant="body2">Template parser: {parserTemplate}</Typography>
              <Typography variant="body2">Inviti: {inviteEmails || "nessuno"}</Typography>
              {tenantDomain ? (
                <Typography variant="body2" sx={{ mt: 0.6 }}>
                  Link tenant: https://{tenantDomain}
                </Typography>
              ) : null}
            </Box>
          </Stack>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => void handleSkip()}>Salta</Button>
        {activeStep < steps.length - 1 ? (
          <Button variant="contained" onClick={() => void handleNext()}>
            Avanti
          </Button>
        ) : (
          <Button variant="contained" onClick={() => void handleFinish()}>
            Fine
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
