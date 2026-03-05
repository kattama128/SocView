import { Box, Chip, Stack, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useState } from "react";

import { IocCollection } from "../types/alerts";

type IocChipsProps = {
  iocs?: IocCollection | null;
};

type IocType = "ips" | "hashes" | "urls" | "emails";

const IOC_LABELS: Record<IocType, string> = {
  ips: "IP",
  hashes: "Hash",
  urls: "URL",
  emails: "Email",
};

export default function IocChips({ iocs }: IocChipsProps) {
  const theme = useTheme();
  const [copiedValue, setCopiedValue] = useState<string | null>(null);

  const paletteByType: Record<IocType, { bg: string; text: string }> = {
    ips: {
      bg: alpha(theme.palette.error.main, 0.16),
      text: theme.palette.error.dark,
    },
    hashes: {
      bg: alpha(theme.palette.warning.main, 0.2),
      text: theme.palette.warning.dark,
    },
    urls: {
      bg: alpha(theme.palette.info.main, 0.2),
      text: theme.palette.info.dark,
    },
    emails: {
      bg: alpha(theme.palette.success.main, 0.2),
      text: theme.palette.success.dark,
    },
  };

  const rows: Array<{ type: IocType; value: string }> = [];
  (iocs?.ips ?? []).forEach((value) => rows.push({ type: "ips", value }));
  (iocs?.hashes ?? []).forEach((value) => rows.push({ type: "hashes", value }));
  (iocs?.urls ?? []).forEach((value) => rows.push({ type: "urls", value }));
  (iocs?.emails ?? []).forEach((value) => rows.push({ type: "emails", value }));

  if (rows.length === 0) {
    return <Typography color="text.secondary">Nessun IOC estratto.</Typography>;
  }

  return (
    <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }} data-testid="ioc-section">
      {rows.map((row) => {
        const palette = paletteByType[row.type];
        return (
          <Tooltip
            key={`${row.type}-${row.value}`}
            title={copiedValue === row.value ? "Copiato" : "Clicca per copiare"}
            arrow
          >
            <Chip
              label={`${IOC_LABELS[row.type]}: ${row.value}`}
              data-testid="ioc-chip"
              onClick={() => {
                void navigator.clipboard.writeText(row.value).then(() => {
                  setCopiedValue(row.value);
                  window.setTimeout(() => setCopiedValue(null), 1200);
                });
              }}
              sx={{
                backgroundColor: palette.bg,
                color: palette.text,
                maxWidth: "100%",
                "& .MuiChip-label": {
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                },
              }}
            />
          </Tooltip>
        );
      })}
      <Box sx={{ width: "100%" }} />
    </Stack>
  );
}
