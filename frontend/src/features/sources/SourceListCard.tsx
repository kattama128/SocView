import { Box, Card, CardContent, Chip, Stack, Typography } from "@mui/material";

import type { GlobalSourceDefinition } from "../../mocks/sourceCatalog";
import { surfaceCardSx } from "../../styles/surfaces";

type Props = {
  sources: GlobalSourceDefinition[];
  selectedSourceId: number | null;
  onSelect: (id: number) => void;
};

export default function SourceListCard({ sources, selectedSourceId, onSelect }: Props) {
  return (
    <Card sx={surfaceCardSx}>
      <CardContent>
        <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>Fonti Globali</Typography>
        <Stack spacing={1}>
          {sources.map((source) => (
            <Box
              key={source.id}
              onClick={() => onSelect(source.id)}
              sx={{
                p: 1.1,
                borderRadius: 1.5,
                border: source.id === selectedSourceId ? "1px solid rgba(59,130,246,0.6)" : "1px solid var(--border-subtle)",
                bgcolor: source.id === selectedSourceId ? "rgba(59,130,246,0.12)" : "var(--surface-3)",
                cursor: "pointer",
              }}
            >
              <Typography sx={{ color: "#e2e8f0", fontWeight: 600 }}>{source.name}</Typography>
              <Typography sx={{ color: "#64748b", fontSize: 12 }}>{source.description || "Nessuna descrizione"}</Typography>
              <Stack direction="row" spacing={0.6} sx={{ mt: 0.7 }} useFlexGap flexWrap="wrap">
                <Chip size="small" label={source.method} sx={{ color: "#93c5fd", border: "1px solid rgba(59,130,246,0.35)" }} />
                <Chip size="small" label={source.enabled ? "enabled" : "disabled"} sx={{ color: source.enabled ? "#86efac" : "#fca5a5", border: "1px solid rgba(148,163,184,0.24)" }} />
                <Chip size="small" label={`Parser: ${source.parserEntries.length}`} sx={{ color: "#cbd5f5", border: "1px solid rgba(148,163,184,0.24)" }} />
                <Chip size="small" label={`Tipi allarme: ${source.alertTypeRules.length}`} sx={{ color: "#facc15", border: "1px solid rgba(234,179,8,0.35)" }} />
              </Stack>
            </Box>
          ))}
          {!sources.length ? <Typography sx={{ color: "#64748b" }}>Nessuna fonte configurata.</Typography> : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
