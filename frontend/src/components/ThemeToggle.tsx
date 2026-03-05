import DarkModeRoundedIcon from "@mui/icons-material/DarkModeRounded";
import LightModeRoundedIcon from "@mui/icons-material/LightModeRounded";
import { IconButton, Tooltip } from "@mui/material";

import { useThemeMode } from "../contexts/ThemeContext";

export default function ThemeToggle() {
  const { mode, toggleMode } = useThemeMode();
  const isDark = mode === "dark";

  return (
    <Tooltip title={isDark ? "Tema chiaro" : "Tema scuro"}>
      <IconButton
        color="inherit"
        onClick={toggleMode}
        aria-label="toggle theme"
        data-testid="theme-toggle"
        sx={{
          color: "text.secondary",
          transition: "color 0.2s, transform 0.2s",
          "&:hover": { color: "text.primary", transform: "rotate(15deg)" },
        }}
      >
        {isDark ? <LightModeRoundedIcon sx={{ fontSize: "1.2rem" }} /> : <DarkModeRoundedIcon sx={{ fontSize: "1.2rem" }} />}
      </IconButton>
    </Tooltip>
  );
}
