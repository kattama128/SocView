import { Box } from "@mui/material";
import { ReactNode } from "react";

type TabPanelProps = {
  value: number;
  index: number;
  children: ReactNode;
};

export default function TabPanel({ value, index, children }: TabPanelProps) {
  if (value !== index) return null;
  return <Box sx={{ pt: 2 }}>{children}</Box>;
}
