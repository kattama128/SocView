import { Card, CardContent, Chip, Divider, Grid, Stack, Typography } from "@mui/material";

import type { Source } from "../../types/ingestion";
import { surfaceCardSx, surfaceInsetSx } from "../../styles/surfaces";

type Props = {
  sources: Source[];
};

export default function IntegrationsOverviewCard({ sources }: Props) {
  const enabledCount = sources.filter((item) => item.is_enabled).length;

  const resolveAuthLabel = (source: Source) => {
    const auth = source.config?.config_json?.auth as Record<string, unknown> | undefined;
    const authType = typeof auth?.type === "string" ? auth.type : "";
    if (!authType) {
      return source.type === "webhook" ? "api_key" : "none";
    }
    return authType;
  };

  const resolveMethodLabel = (source: Source) => {
    const method = source.config?.config_json?.method;
    if (typeof method === "string" && method.trim()) {
      return method.toUpperCase();
    }
    return source.type === "webhook" ? "PUSH" : "POLL";
  };

  return (
    <Card sx={surfaceCardSx}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography sx={{ color: "#e2e8f0", fontWeight: 700 }}>Integrazioni globali</Typography>
          <Chip
            size="small"
            label={`Attive: ${enabledCount}/${sources.length}`}
            sx={{ color: "#86efac", border: "1px solid rgba(74,222,128,0.35)", background: "rgba(20,83,45,0.2)" }}
          />
        </Stack>
        <Divider sx={{ mb: 2, borderColor: "rgba(148,163,184,0.2)" }} />
        {sources.length === 0 ? (
          <Typography sx={{ color: "#94a3b8" }}>Nessuna fonte globale configurata.</Typography>
        ) : (
          <Grid container spacing={1.5}>
            {sources.map((source) => (
              <Grid item xs={12} md={6} key={source.id}>
                <Card sx={surfaceInsetSx}>
                  <CardContent>
                    <Typography sx={{ color: "#e2e8f0", fontWeight: 600 }}>{source.name}</Typography>
                    <Typography sx={{ color: "#94a3b8", fontSize: 12 }}>
                      {source.type.toUpperCase()} • {resolveMethodLabel(source)} • auth:{resolveAuthLabel(source)}
                    </Typography>
                    <Stack direction="row" spacing={0.5} sx={{ mt: 1, flexWrap: "wrap" }}>
                      <Chip
                        size="small"
                        label={source.is_enabled ? "Attiva" : "Disattiva"}
                        sx={{ color: source.is_enabled ? "#86efac" : "#fca5a5", border: "1px solid rgba(148,163,184,0.24)" }}
                      />
                      <Chip
                        size="small"
                        label={`Parser ${source.parser_definition_name ? "associato" : "assente"}`}
                        sx={{ color: "#c4b5fd", border: "1px solid rgba(167,139,250,0.35)" }}
                      />
                      <Chip
                        size="small"
                        label={`Tipi allarme ${source.alert_type_rules.length}`}
                        sx={{ color: "#bae6fd", border: "1px solid rgba(56,189,248,0.35)" }}
                      />
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </CardContent>
    </Card>
  );
}
