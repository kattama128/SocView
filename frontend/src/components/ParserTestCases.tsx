import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PlusIcon from "@mui/icons-material/Add";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";

import {
  createParserTestCase,
  deleteParserTestCase,
  fetchParserTestCases,
  runAllParserTestCases,
} from "../services/parserApi";
import { ParserRunAllResult, ParserTestCase } from "../types/parser";
import MonacoDiff from "./MonacoDiff";
import MonacoEditor from "./MonacoEditor";

type Props = {
  parserId: number | null;
  disabled?: boolean;
};

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "{}";
  }
}

export default function ParserTestCases({ parserId, disabled = false }: Props) {
  const [items, setItems] = useState<ParserTestCase[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [results, setResults] = useState<Record<number, ParserRunAllResult>>({});
  const [selectedFailedId, setSelectedFailedId] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [inputRaw, setInputRaw] = useState('{\n  "event_id": "demo-1"\n}');
  const [expectedOutput, setExpectedOutput] = useState("{}");

  const load = async () => {
    if (!parserId) {
      setItems([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchParserTestCases(parserId);
      setItems(payload);
    } catch {
      setError("Impossibile caricare i test case parser.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [parserId]);

  const failedResult = useMemo(() => {
    if (!selectedFailedId) {
      return null;
    }
    return results[selectedFailedId] ?? null;
  }, [results, selectedFailedId]);

  const createTestCase = async () => {
    if (!parserId) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const parsedExpected = JSON.parse(expectedOutput) as Record<string, unknown>;
      await createParserTestCase(parserId, {
        name: name.trim(),
        input_raw: inputRaw,
        expected_output: parsedExpected,
      });
      setDialogOpen(false);
      setName("");
      setInputRaw('{\n  "event_id": "demo-1"\n}');
      setExpectedOutput("{}");
      await load();
    } catch {
      setError("Salvataggio test case non riuscito: expected output deve essere JSON valido.");
    } finally {
      setSaving(false);
    }
  };

  const removeTestCase = async (testCaseId: number) => {
    if (!parserId) {
      return;
    }
    setError(null);
    try {
      await deleteParserTestCase(parserId, testCaseId);
      setItems((current) => current.filter((item) => item.id !== testCaseId));
      setResults((current) => {
        const next = { ...current };
        delete next[testCaseId];
        return next;
      });
      if (selectedFailedId === testCaseId) {
        setSelectedFailedId(null);
      }
    } catch {
      setError("Eliminazione test case non riuscita.");
    }
  };

  const runAll = async () => {
    if (!parserId) {
      return;
    }
    setRunning(true);
    setError(null);
    setSummary(null);
    try {
      const payload = await runAllParserTestCases(parserId);
      const map: Record<number, ParserRunAllResult> = {};
      payload.results.forEach((item) => {
        map[item.tc_id] = item;
      });
      setResults(map);
      setSummary(`Test completati: ${payload.passed} OK, ${payload.failed} KO.`);

      const firstFailed = payload.results.find((item) => !item.passed);
      setSelectedFailedId(firstFailed ? firstFailed.tc_id : null);
    } catch {
      setError("Esecuzione test case non riuscita.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Stack spacing={1.2} data-testid="test-cases-section">
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ flexWrap: "wrap", gap: 1 }}>
        <Typography sx={{ fontWeight: 600 }}>Casi di Test</Typography>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<PlusIcon />}
            disabled={!parserId || disabled}
            onClick={() => setDialogOpen(true)}
          >
            Aggiungi
          </Button>
          <Button
            variant="contained"
            size="small"
            startIcon={running ? <CircularProgress size={14} color="inherit" /> : <PlayArrowIcon />}
            disabled={!parserId || disabled || running || !items.length}
            onClick={() => {
              void runAll();
            }}
          >
            Esegui tutti
          </Button>
        </Stack>
      </Stack>

      {error ? <Alert severity="error">{error}</Alert> : null}
      {summary ? <Alert severity="success">{summary}</Alert> : null}

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Nome</TableCell>
            <TableCell>Creato da</TableCell>
            <TableCell>Ultimo esito</TableCell>
            <TableCell align="right">Azioni</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((item) => {
            const run = results[item.id];
            return (
              <TableRow
                key={item.id}
                hover
                selected={selectedFailedId === item.id}
                onClick={() => {
                  if (run && !run.passed) {
                    setSelectedFailedId(item.id);
                  }
                }}
                sx={{ cursor: run && !run.passed ? "pointer" : "default" }}
              >
                <TableCell>{item.name}</TableCell>
                <TableCell>{item.created_by_username ?? "system"}</TableCell>
                <TableCell>
                  {run ? (
                    <Chip size="small" label={run.passed ? "OK" : "KO"} color={run.passed ? "success" : "error"} />
                  ) : (
                    <Chip size="small" label="N/A" />
                  )}
                </TableCell>
                <TableCell align="right">
                  <IconButton
                    size="small"
                    disabled={disabled}
                    onClick={(event) => {
                      event.stopPropagation();
                      void removeTestCase(item.id);
                    }}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {loading ? <CircularProgress size={18} /> : null}
      {!loading && !items.length ? <Typography color="text.secondary">Nessun test case configurato.</Typography> : null}

      {failedResult ? (
        <Box>
          <Typography sx={{ fontWeight: 600, mb: 0.6 }}>Diff test fallito: {failedResult.name}</Typography>
          <MonacoDiff
            language="json"
            original={safeJsonStringify(items.find((item) => item.id === failedResult.tc_id)?.expected_output ?? {})}
            modified={safeJsonStringify(failedResult.actual_output)}
            originalLabel="Atteso"
            modifiedLabel="Reale"
          />
        </Box>
      ) : null}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Nuovo test case parser</DialogTitle>
        <DialogContent>
          <Stack spacing={1.2} sx={{ mt: 0.6 }}>
            <TextField fullWidth label="Nome" value={name} onChange={(event) => setName(event.target.value)} />
            <TextField
              fullWidth
              multiline
              minRows={6}
              label="Input raw"
              value={inputRaw}
              onChange={(event) => setInputRaw(event.target.value)}
            />
            <MonacoEditor
              label="Output atteso (JSON)"
              value={expectedOutput}
              onChange={setExpectedOutput}
              language="json"
              height="240px"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Annulla</Button>
          <Button
            variant="contained"
            disabled={saving || !name.trim()}
            onClick={() => {
              void createTestCase();
            }}
          >
            Salva
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
