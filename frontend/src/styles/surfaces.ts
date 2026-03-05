import type { SxProps, Theme } from "@mui/material";

const TRANSITION = "0.2s cubic-bezier(0.4, 0, 0.2, 1)";

export const surfaceCardSx: SxProps<Theme> = {
  borderRadius: 3,
  border: "1px solid var(--border-subtle)",
  background: "var(--surface-1)",
  boxShadow: "var(--shadow-1)",
  backdropFilter: "blur(12px)",
  transition: `border-color ${TRANSITION}, box-shadow ${TRANSITION}`,
  "&:hover": {
    borderColor: "var(--border-hover)",
  },
};

export const surfaceSoftSx: SxProps<Theme> = {
  borderRadius: 2.5,
  border: "1px solid var(--border-subtle)",
  background: "var(--surface-2)",
  boxShadow: "var(--shadow-2)",
  backdropFilter: "blur(8px)",
  transition: `border-color ${TRANSITION}, box-shadow ${TRANSITION}`,
};

export const surfaceInsetSx: SxProps<Theme> = {
  borderRadius: 2,
  border: "1px solid var(--border-subtle)",
  background: "var(--surface-3)",
  transition: `border-color ${TRANSITION}`,
};
