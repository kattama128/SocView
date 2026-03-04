import { Box, Button, MenuItem, Stack, TextField, Typography } from "@mui/material";

type Customer = {
  id: number;
  name: string;
};

type Props = {
  customers: Customer[];
  activeCustomerId: number;
  onSelectCustomer: (id: number) => void;
  onBack: () => void;
  onManageSources: () => void;
  onSave: () => void;
  saving?: boolean;
};

export default function CustomerSettingsHeader({ customers, activeCustomerId, onSelectCustomer, onBack, onManageSources, onSave, saving = false }: Props) {
  return (
    <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }} spacing={1.5}>
      <Box>
        <Typography sx={{ color: "#f8fafc", fontSize: { xs: 26, md: 34 }, fontWeight: 700 }}>
          Impostazioni Cliente
        </Typography>
        <Typography sx={{ color: "#64748b" }}>
          Profilo, SLA, routing e abilitazioni fonti per il cliente selezionato.
        </Typography>
      </Box>
      <Stack direction="row" spacing={1} flexWrap="wrap">
        <TextField
          select
          size="small"
          label="Cliente"
          value={activeCustomerId}
          onChange={(event) => onSelectCustomer(Number(event.target.value))}
          sx={{ minWidth: 220, "& .MuiOutlinedInput-root": { bgcolor: "var(--surface-2)", color: "#e6edf3" } }}
        >
          {customers.map((customer) => (
            <MenuItem key={customer.id} value={customer.id}>
              {customer.name}
            </MenuItem>
          ))}
        </TextField>
        <Button variant="outlined" onClick={onBack}>
          Torna al cliente
        </Button>
        <Button variant="outlined" onClick={onManageSources}>Gestisci fonti globali</Button>
        <Button variant="contained" disabled={saving} onClick={onSave}>
          {saving ? "Salvataggio..." : "Salva"}
        </Button>
      </Stack>
    </Stack>
  );
}
