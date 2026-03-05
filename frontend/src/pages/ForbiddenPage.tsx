import BlockIcon from "@mui/icons-material/Block";
import { Box, Button, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useNavigate } from "react-router-dom";

export default function ForbiddenPage() {
  const theme = useTheme();
  const navigate = useNavigate();

  return (
    <Stack
      alignItems="center"
      justifyContent="center"
      spacing={3}
      sx={{ minHeight: "60vh", textAlign: "center", px: 2 }}
    >
      <Box
        sx={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          background: alpha(theme.palette.error.main, 0.1),
        }}
      >
        <BlockIcon sx={{ fontSize: 36, color: "error.main" }} />
      </Box>
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
          403
        </Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 400 }}>
          Non hai i permessi necessari per accedere a questa sezione. Contatta un amministratore se ritieni sia un errore.
        </Typography>
      </Box>
      <Button variant="outlined" onClick={() => navigate("/")}>
        Torna alla dashboard
      </Button>
    </Stack>
  );
}
