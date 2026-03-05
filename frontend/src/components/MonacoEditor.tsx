import { Box, CircularProgress, TextField } from "@mui/material";
import type { ComponentType } from "react";
import { useEffect, useRef, useState } from "react";

type Marker = {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  message: string;
  severity: number;
};

type EditorLike = {
  getModel: () => unknown;
  getAction: (id: string) => { run: () => Promise<void> } | null;
  addCommand: (keybinding: number, handler: () => void) => void;
};

type MonacoLike = {
  editor: {
    setModelMarkers: (model: unknown, owner: string, markers: Marker[]) => void;
  };
  MarkerSeverity: {
    Error: number;
  };
  KeyMod: {
    CtrlCmd: number;
  };
  KeyCode: {
    KeyS: number;
  };
};

type DynamicEditorProps = {
  value: string;
  language: string;
  options?: Record<string, unknown>;
  height?: string | number;
  onChange?: (value: string | undefined) => void;
  onMount?: (editor: EditorLike, monaco: MonacoLike) => void;
};

type DynamicEditorComponent = ComponentType<DynamicEditorProps>;

type Props = {
  label: string;
  value: string;
  onChange: (nextValue: string) => void;
  language: "json" | "regex" | "javascript";
  disabled?: boolean;
  minRows?: number;
  height?: string | number;
  onSave?: () => void;
};

function computeMarkers(value: string, language: Props["language"], monaco: MonacoLike): Marker[] {
  if (language === "json") {
    try {
      JSON.parse(value);
      return [];
    } catch (error) {
      const message = error instanceof Error ? error.message : "JSON non valido";
      return [
        {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 1,
          endColumn: 1,
          message,
          severity: monaco.MarkerSeverity.Error,
        },
      ];
    }
  }

  if (language === "regex") {
    try {
      // Validate regex syntax on client side.
      new RegExp(value);
      return [];
    } catch (error) {
      const message = error instanceof Error ? error.message : "Regex non valida";
      return [
        {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 1,
          endColumn: 1,
          message,
          severity: monaco.MarkerSeverity.Error,
        },
      ];
    }
  }

  return [];
}

export default function MonacoEditor({
  label,
  value,
  onChange,
  language,
  disabled = false,
  minRows = 8,
  height = "320px",
  onSave,
}: Props) {
  const [EditorComponent, setEditorComponent] = useState<DynamicEditorComponent | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const editorRef = useRef<EditorLike | null>(null);
  const monacoRef = useRef<MonacoLike | null>(null);

  useEffect(() => {
    let active = true;
    void import("@monaco-editor/react")
      .then((module) => {
        if (!active) {
          return;
        }
        const editor = module.Editor as DynamicEditorComponent;
        setEditorComponent(() => editor);
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

  const applyMarkers = (nextValue: string) => {
    if (!editorRef.current || !monacoRef.current) {
      return;
    }
    const model = editorRef.current.getModel();
    if (!model) {
      return;
    }
    const markers = computeMarkers(nextValue, language, monacoRef.current);
    monacoRef.current.editor.setModelMarkers(model, "parser-editor", markers);
  };

  if (loadFailed) {
    return (
      <TextField
        fullWidth
        multiline
        minRows={minRows}
        label={`${label} (fallback)`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      />
    );
  }

  if (!EditorComponent) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 2 }}>
        <CircularProgress size={18} />
        <span>Caricamento editor…</span>
      </Box>
    );
  }

  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, overflow: "hidden" }} data-testid="parser-editor">
      <Box sx={{ px: 1.2, py: 0.8, borderBottom: "1px solid", borderColor: "divider", fontSize: 13 }}>{label}</Box>
      <EditorComponent
        value={value}
        language={language}
        height={height}
        options={{ readOnly: disabled, minimap: { enabled: false }, automaticLayout: true }}
        onChange={(next) => {
          const resolved = next ?? "";
          onChange(resolved);
          applyMarkers(resolved);
        }}
        onMount={(editor, monaco) => {
          editorRef.current = editor;
          monacoRef.current = monaco;
          applyMarkers(value);

          editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
            const action = editor.getAction("editor.action.formatDocument");
            if (action) {
              void action.run();
            }
            if (onSave) {
              onSave();
            }
          });
        }}
      />
    </Box>
  );
}
