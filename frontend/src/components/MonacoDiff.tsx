import { Box, CircularProgress, Grid, TextField, Typography } from "@mui/material";
import type { ComponentType } from "react";
import { useEffect, useState } from "react";

type DynamicDiffProps = {
  original: string;
  modified: string;
  language: string;
  height?: string | number;
  options?: Record<string, unknown>;
};

type DynamicDiffComponent = ComponentType<DynamicDiffProps>;

type Props = {
  original: string;
  modified: string;
  language: "json" | "regex" | "javascript";
  height?: string | number;
  originalLabel?: string;
  modifiedLabel?: string;
};

export default function MonacoDiff({
  original,
  modified,
  language,
  height = "380px",
  originalLabel = "Originale",
  modifiedLabel = "Confronto",
}: Props) {
  const [DiffComponent, setDiffComponent] = useState<DynamicDiffComponent | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void import("@monaco-editor/react")
      .then((module) => {
        if (!active) {
          return;
        }
        const diff = module.DiffEditor as DynamicDiffComponent;
        setDiffComponent(() => diff);
      })
      .catch(() => {
        if (active) {
          setLoadFailed(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (loadFailed) {
    return (
      <Grid container spacing={1.2}>
        <Grid item xs={12} md={6}>
          <TextField fullWidth multiline minRows={12} label={`${originalLabel} (fallback)`} value={original} InputProps={{ readOnly: true }} />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField fullWidth multiline minRows={12} label={`${modifiedLabel} (fallback)`} value={modified} InputProps={{ readOnly: true }} />
        </Grid>
      </Grid>
    );
  }

  if (!DiffComponent) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 2 }}>
        <CircularProgress size={18} />
        <Typography variant="body2">Caricamento diff…</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, overflow: "hidden" }}>
      <DiffComponent
        original={original}
        modified={modified}
        language={language}
        height={height}
        options={{
          readOnly: true,
          renderSideBySide: true,
          minimap: { enabled: false },
          automaticLayout: true,
        }}
      />
    </Box>
  );
}
