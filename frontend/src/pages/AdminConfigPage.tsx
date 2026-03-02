import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  FormControlLabel,
  Grid,
  IconButton,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import DeleteIcon from "@mui/icons-material/Delete";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "../context/AuthContext";
import {
  createState,
  createTag,
  deleteState,
  deleteTag,
  fetchAlertStates,
  fetchTags,
  reorderStates,
  updateState,
  updateTag,
} from "../services/alertsApi";
import { canManageStates, canManageTags } from "../services/roleUtils";
import { AlertState, Tag } from "../types/alerts";

const tagScopes = ["alert", "source", "tenant"] as const;

export default function AdminConfigPage() {
  const { user } = useAuth();

  const [states, setStates] = useState<AlertState[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  const [stateDrafts, setStateDrafts] = useState<Record<number, AlertState>>({});
  const [tagDrafts, setTagDrafts] = useState<Record<number, Tag>>({});

  const [newStateName, setNewStateName] = useState("");
  const [newStateFinal, setNewStateFinal] = useState(false);

  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#1976d2");
  const [newTagScope, setNewTagScope] = useState<(typeof tagScopes)[number]>("alert");

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const manageStates = canManageStates(user?.role);
  const manageTags = canManageTags(user?.role);

  const sortedStates = useMemo(() => [...states].sort((a, b) => a.order - b.order), [states]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statesResp, tagsResp] = await Promise.all([fetchAlertStates(), fetchTags()]);
      setStates(statesResp);
      setTags(tagsResp);

      setStateDrafts(
        Object.fromEntries(statesResp.map((state) => [state.id, { ...state }])),
      );
      setTagDrafts(
        Object.fromEntries(tagsResp.map((tag) => [tag.id, { ...tag }])),
      );
    } catch {
      setError("Impossibile caricare configurazioni tenant.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const run = async (action: () => Promise<void>, message: string) => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await action();
      await loadData();
      setSuccess(message);
    } catch {
      setError("Operazione non riuscita.");
    } finally {
      setBusy(false);
    }
  };

  const moveState = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= sortedStates.length) {
      return;
    }

    const mutable = [...sortedStates];
    const [item] = mutable.splice(index, 1);
    mutable.splice(target, 0, item);
    const orderedIds = mutable.map((state) => state.id);

    void run(
      async () => {
        await reorderStates(orderedIds);
      },
      "Ordine stati aggiornato",
    );
  };

  if (loading) {
    return <Typography>Caricamento configurazione...</Typography>;
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5">Amministrazione Tenant</Typography>
      {error ? <Alert severity="error">{error}</Alert> : null}
      {success ? <Alert severity="success">{success}</Alert> : null}

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Stati Alert
          </Typography>

          {!manageStates ? (
            <Alert severity="info">Solo SOC Manager o SuperAdmin possono modificare gli stati.</Alert>
          ) : null}

          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="Nuovo stato"
                value={newStateName}
                onChange={(event) => setNewStateName(event.target.value)}
                disabled={!manageStates || busy}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={newStateFinal}
                    onChange={(event) => setNewStateFinal(event.target.checked)}
                    disabled={!manageStates || busy}
                  />
                }
                label="Stato finale"
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <Button
                variant="contained"
                disabled={!manageStates || busy || !newStateName.trim()}
                onClick={() =>
                  run(
                    async () => {
                      await createState({
                        name: newStateName.trim(),
                        order: sortedStates.length,
                        is_final: newStateFinal,
                        is_enabled: true,
                      });
                      setNewStateName("");
                      setNewStateFinal(false);
                    },
                    "Stato creato",
                  )
                }
              >
                Aggiungi
              </Button>
            </Grid>
          </Grid>

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Ordine</TableCell>
                <TableCell>Nome</TableCell>
                <TableCell>Finale</TableCell>
                <TableCell>Abilitato</TableCell>
                <TableCell>Azioni</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedStates.map((state, index) => {
                const draft = stateDrafts[state.id] ?? state;
                return (
                  <TableRow key={state.id}>
                    <TableCell>{state.order}</TableCell>
                    <TableCell>
                      <TextField
                        value={draft.name}
                        size="small"
                        disabled={!manageStates || busy}
                        onChange={(event) =>
                          setStateDrafts((prev) => ({
                            ...prev,
                            [state.id]: { ...draft, name: event.target.value },
                          }))
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Checkbox
                        checked={draft.is_final}
                        disabled={!manageStates || busy}
                        onChange={(event) =>
                          setStateDrafts((prev) => ({
                            ...prev,
                            [state.id]: { ...draft, is_final: event.target.checked },
                          }))
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Checkbox
                        checked={draft.is_enabled}
                        disabled={!manageStates || busy}
                        onChange={(event) =>
                          setStateDrafts((prev) => ({
                            ...prev,
                            [state.id]: { ...draft, is_enabled: event.target.checked },
                          }))
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <IconButton
                        size="small"
                        disabled={!manageStates || busy}
                        onClick={() => moveState(index, -1)}
                      >
                        <ArrowUpwardIcon fontSize="inherit" />
                      </IconButton>
                      <IconButton
                        size="small"
                        disabled={!manageStates || busy}
                        onClick={() => moveState(index, 1)}
                      >
                        <ArrowDownwardIcon fontSize="inherit" />
                      </IconButton>
                      <Button
                        size="small"
                        disabled={!manageStates || busy}
                        onClick={() =>
                          run(
                            async () => {
                              await updateState(state.id, {
                                name: draft.name,
                                is_final: draft.is_final,
                                is_enabled: draft.is_enabled,
                              });
                            },
                            "Stato aggiornato",
                          )
                        }
                      >
                        Salva
                      </Button>
                      <IconButton
                        size="small"
                        disabled={!manageStates || busy}
                        onClick={() =>
                          run(async () => deleteState(state.id), "Stato eliminato")
                        }
                      >
                        <DeleteIcon fontSize="inherit" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Tag
          </Typography>

          {!manageTags ? <Alert severity="info">Il tuo ruolo non puo gestire i tag.</Alert> : null}

          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                label="Nuovo tag"
                value={newTagName}
                onChange={(event) => setNewTagName(event.target.value)}
                disabled={!manageTags || busy}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                label="Colore"
                value={newTagColor}
                onChange={(event) => setNewTagColor(event.target.value)}
                disabled={!manageTags || busy}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                select
                fullWidth
                label="Scope"
                value={newTagScope}
                onChange={(event) => setNewTagScope(event.target.value as (typeof tagScopes)[number])}
                disabled={!manageTags || busy}
              >
                {tagScopes.map((scope) => (
                  <MenuItem key={scope} value={scope}>
                    {scope}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={2}>
              <Button
                variant="contained"
                disabled={!manageTags || busy || !newTagName.trim()}
                onClick={() =>
                  run(
                    async () => {
                      await createTag({
                        name: newTagName.trim(),
                        color: newTagColor,
                        scope: newTagScope,
                        metadata: {},
                      });
                      setNewTagName("");
                    },
                    "Tag creato",
                  )
                }
              >
                Aggiungi
              </Button>
            </Grid>
          </Grid>

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nome</TableCell>
                <TableCell>Scope</TableCell>
                <TableCell>Colore</TableCell>
                <TableCell>Azioni</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tags.map((tag) => {
                const draft = tagDrafts[tag.id] ?? tag;
                return (
                  <TableRow key={tag.id}>
                    <TableCell>
                      <TextField
                        value={draft.name}
                        size="small"
                        disabled={!manageTags || busy}
                        onChange={(event) =>
                          setTagDrafts((prev) => ({
                            ...prev,
                            [tag.id]: { ...draft, name: event.target.value },
                          }))
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        select
                        value={draft.scope}
                        size="small"
                        disabled={!manageTags || busy}
                        onChange={(event) =>
                          setTagDrafts((prev) => ({
                            ...prev,
                            [tag.id]: { ...draft, scope: event.target.value as Tag["scope"] },
                          }))
                        }
                      >
                        {tagScopes.map((scope) => (
                          <MenuItem key={scope} value={scope}>
                            {scope}
                          </MenuItem>
                        ))}
                      </TextField>
                    </TableCell>
                    <TableCell>
                      <TextField
                        value={draft.color}
                        size="small"
                        disabled={!manageTags || busy}
                        onChange={(event) =>
                          setTagDrafts((prev) => ({
                            ...prev,
                            [tag.id]: { ...draft, color: event.target.value },
                          }))
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="small"
                        disabled={!manageTags || busy}
                        onClick={() =>
                          run(
                            async () => {
                              await updateTag(tag.id, {
                                name: draft.name,
                                scope: draft.scope,
                                color: draft.color,
                                metadata: draft.metadata,
                              });
                            },
                            "Tag aggiornato",
                          )
                        }
                      >
                        Salva
                      </Button>
                      <IconButton
                        size="small"
                        disabled={!manageTags || busy}
                        onClick={() => run(async () => deleteTag(tag.id), "Tag eliminato")}
                      >
                        <DeleteIcon fontSize="inherit" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Stack>
  );
}
