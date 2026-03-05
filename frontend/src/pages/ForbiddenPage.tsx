import { Alert, Stack, Typography } from "@mui/material";

export default function ForbiddenPage() {
  return (
    <Stack spacing={1.2}>
      <Typography variant="h4" sx={{ fontWeight: 700 }}>
        403
      </Typography>
      <Alert severity="error">Accesso negato: permessi insufficienti.</Alert>
    </Stack>
  );
}
