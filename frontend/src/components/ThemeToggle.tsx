import DarkModeRoundedIcon from "@mui/icons-material/DarkModeRounded";
import LightModeRoundedIcon from "@mui/icons-material/LightModeRounded";
import { IconButton, Tooltip } from "@mui/material";

import { useThemeMode } from "../contexts/ThemeContext";

export default function ThemeToggle() {
  const { mode, toggleMode } = useThemeMode();
  const isDark = mode === "dark";

  return (
    <Tooltip title={isDark ? "Passa al tema chiaro" : "Passa al tema scuro"}>
      <IconButton
        color="inherit"
        onClick={toggleMode}
        aria-label="toggle theme"
        data-testid="theme-toggle"
      >
        {isDark ? <LightModeRoundedIcon /> : <DarkModeRoundedIcon />}
      </IconButton>
    </Tooltip>
  );
}
