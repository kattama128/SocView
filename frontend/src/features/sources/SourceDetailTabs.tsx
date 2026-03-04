import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import ScienceIcon from "@mui/icons-material/Science";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Grid,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useState } from "react";

import TabPanel from "../../components/TabPanel";
import type { AuthType, GlobalSourceDefinition, IngestionMethod, MatchMode } from "../../mocks/sourceCatalog";
import type { SourceAdvancedConfig } from "./types";
import { surfaceCardSx, surfaceSoftSx } from "../../styles/surfaces";

type Option<T extends string> = {
  label: string;
  value: T;
};

type Props = {
  source: GlobalSourceDefinition | null;
  advanced: SourceAdvancedConfig | null;
  ingestionMethodOptions: Option<IngestionMethod>[];
  authTypeOptions: Option<AuthType>[];
  severityOptions: readonly ("low" | "medium" | "high" | "critical")[];
  onUpdateSource: (updater: (source: GlobalSourceDefinition) => GlobalSourceDefinition) => void;
  onUpdateAdvanced: (partial: Partial<SourceAdvancedConfig>) => void;
  onAddParserPair: () => void;
  onAddAlertRule: () => void;
  onDeleteSource: () => void;
  onTestConnection: () => void;
  onRunNow: () => void;
};

export default function SourceDetailTabs({
  source,
  advanced,
  ingestionMethodOptions,
  authTypeOptions,
  severityOptions,
  onUpdateSource,
  onUpdateAdvanced,
  onAddParserPair,
  onAddAlertRule,
  onDeleteSource,
  onTestConnection,
  onRunNow,
}: Props) {
  const [tab, setTab] = useState(0);

  if (!source || !advanced) {
    return <Alert severity="info">Seleziona o crea una fonte per configurare metodi, parser e catalogo allarmi.</Alert>;
  }

  return (
    <Stack spacing={2}>
      <Tabs value={tab} onChange={(_, value) => setTab(value)} textColor="inherit" indicatorColor="primary">
        <Tab label="Config" />
        <Tab label="Security" />
        <Tab label="Ingestion" />
        <Tab label="Parsing" />
        <Tab label="Catalogo" />
      </Tabs>

      <TabPanel value={tab} index={0}>
        <Stack spacing={2}>
          <Card sx={surfaceCardSx}>
            <CardContent>
              <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }} sx={{ mb: 1.5 }} spacing={1}>
                <Typography sx={{ color: "#e2e8f0", fontWeight: 700 }}>Configurazione Fonte</Typography>
                <Stack direction="row" spacing={1}>
                  <Button size="small" startIcon={<ScienceIcon />} onClick={onTestConnection}>Test connessione</Button>
                  <Button size="small" startIcon={<PlayArrowIcon />} onClick={onRunNow}>Run now</Button>
                  <Button color="error" startIcon={<DeleteIcon />} onClick={onDeleteSource}>Elimina</Button>
                </Stack>
              </Stack>

              <Grid container spacing={1.5}>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Nome fonte"
                    value={source.name}
                    onChange={(event) => onUpdateSource((current) => ({ ...current, name: event.target.value }))}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Descrizione"
                    value={source.description}
                    onChange={(event) => onUpdateSource((current) => ({ ...current, description: event.target.value }))}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    select
                    fullWidth
                    label="Metodo ingestione"
                    value={source.method}
                    onChange={(event) => onUpdateSource((current) => ({ ...current, method: event.target.value as IngestionMethod }))}
                  >
                    {ingestionMethodOptions.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    select
                    fullWidth
                    label="Autenticazione"
                    value={source.authType}
                    onChange={(event) => onUpdateSource((current) => ({ ...current, authType: event.target.value as AuthType }))}
                  >
                    {authTypeOptions.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ height: "100%" }}>
                    <Typography sx={{ color: "#e2e8f0" }}>Fonte attiva</Typography>
                    <Switch checked={source.enabled} onChange={(event) => onUpdateSource((current) => ({ ...current, enabled: event.target.checked }))} />
                  </Stack>
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Endpoint / Collector"
                    value={source.endpoint}
                    onChange={(event) => onUpdateSource((current) => ({ ...current, endpoint: event.target.value }))}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          <Card sx={surfaceSoftSx}>
            <CardContent>
              <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>Health & Observability</Typography>
              <Stack spacing={1.2}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography sx={{ color: "#94a3b8" }}>Status: {advanced.healthStatus}</Typography>
                  <Typography sx={{ color: "#94a3b8" }}>Last check: {advanced.lastCheckAt}</Typography>
                </Stack>
                <TextField label="Last error" value={advanced.lastError} onChange={(event) => onUpdateAdvanced({ lastError: event.target.value })} />
                <TextField
                  label="Retention (days)"
                  type="number"
                  value={advanced.retentionDays}
                  onChange={(event) => onUpdateAdvanced({ retentionDays: Number(event.target.value) })}
                />
              </Stack>
            </CardContent>
          </Card>
        </Stack>
      </TabPanel>

      <TabPanel value={tab} index={1}>
        <Card sx={surfaceCardSx}>
          <CardContent>
            <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>Auth & Security</Typography>
            <Stack spacing={1.2}>
              <TextField label="Header name" value={advanced.headerName} onChange={(event) => onUpdateAdvanced({ headerName: event.target.value })} />
              <TextField label="API key name" value={advanced.apiKeyName} onChange={(event) => onUpdateAdvanced({ apiKeyName: event.target.value })} />
              <TextField label="OAuth token URL" value={advanced.oauthTokenUrl} onChange={(event) => onUpdateAdvanced({ oauthTokenUrl: event.target.value })} />
              <TextField label="Username ref" value={advanced.usernameRef} onChange={(event) => onUpdateAdvanced({ usernameRef: event.target.value })} />
              <TextField label="Password ref" value={advanced.passwordRef} onChange={(event) => onUpdateAdvanced({ passwordRef: event.target.value })} />
              <TextField label="Signature header" value={advanced.signatureHeader} onChange={(event) => onUpdateAdvanced({ signatureHeader: event.target.value })} />
              <TextField label="Webhook secret" value={advanced.webhookSecret} onChange={(event) => onUpdateAdvanced({ webhookSecret: event.target.value })} />
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography sx={{ color: "#e2e8f0" }}>Verify TLS</Typography>
                <Switch checked={advanced.verifyTls} onChange={(event) => onUpdateAdvanced({ verifyTls: event.target.checked })} />
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      </TabPanel>

      <TabPanel value={tab} index={2}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Card sx={surfaceCardSx}>
              <CardContent>
                <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>Scheduling & Rate Limits</Typography>
                <Stack spacing={1.2}>
                  <TextField
                    label="Polling interval (sec)"
                    type="number"
                    value={advanced.pollingIntervalSeconds}
                    onChange={(event) => onUpdateAdvanced({ pollingIntervalSeconds: Number(event.target.value) })}
                  />
                  <TextField
                    label="Rate limit / min"
                    type="number"
                    value={advanced.rateLimitPerMinute}
                    onChange={(event) => onUpdateAdvanced({ rateLimitPerMinute: Number(event.target.value) })}
                  />
                  <TextField
                    label="Timeout (sec)"
                    type="number"
                    value={advanced.timeoutSeconds}
                    onChange={(event) => onUpdateAdvanced({ timeoutSeconds: Number(event.target.value) })}
                  />
                  <TextField
                    label="Retry count"
                    type="number"
                    value={advanced.retryCount}
                    onChange={(event) => onUpdateAdvanced({ retryCount: Number(event.target.value) })}
                  />
                  <TextField
                    label="Backoff (sec)"
                    type="number"
                    value={advanced.backoffSeconds}
                    onChange={(event) => onUpdateAdvanced({ backoffSeconds: Number(event.target.value) })}
                  />
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card sx={surfaceCardSx}>
              <CardContent>
                <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>Dedup & Normalization</Typography>
                <Stack spacing={1.2}>
                  <TextField label="Strategy" value={advanced.dedupStrategy} onChange={(event) => onUpdateAdvanced({ dedupStrategy: event.target.value })} />
                  <TextField
                    label="Window (minutes)"
                    type="number"
                    value={advanced.dedupWindowMinutes}
                    onChange={(event) => onUpdateAdvanced({ dedupWindowMinutes: Number(event.target.value) })}
                  />
                  <TextField label="Fingerprint fields" value={advanced.dedupFields} onChange={(event) => onUpdateAdvanced({ dedupFields: event.target.value })} />
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </TabPanel>

      <TabPanel value={tab} index={3}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Card sx={surfaceCardSx}>
              <CardContent>
                <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>Parsing & Mapping</Typography>
                <Stack spacing={1.2}>
                  <TextField label="Parse mode" value={advanced.parseMode} onChange={(event) => onUpdateAdvanced({ parseMode: event.target.value })} />
                  <TextField label="Timezone" value={advanced.timezone} onChange={(event) => onUpdateAdvanced({ timezone: event.target.value })} />
                  <TextField label="Mapping version" value={advanced.mappingVersion} onChange={(event) => onUpdateAdvanced({ mappingVersion: event.target.value })} />
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography sx={{ color: "#e2e8f0" }}>Drop unknown fields</Typography>
                    <Switch checked={advanced.dropUnknown} onChange={(event) => onUpdateAdvanced({ dropUnknown: event.target.checked })} />
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card sx={surfaceCardSx}>
              <CardContent>
                <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>Default tagging & severity</Typography>
                <Stack spacing={1.2}>
                  <TextField label="Default tags" value={advanced.defaultTags} onChange={(event) => onUpdateAdvanced({ defaultTags: event.target.value })} />
                  <TextField
                    select
                    label="Default severity"
                    value={advanced.defaultSeverity}
                    onChange={(event) => onUpdateAdvanced({ defaultSeverity: event.target.value })}
                  >
                    {severityOptions.map((severity) => (
                      <MenuItem key={severity} value={severity}>{severity}</MenuItem>
                    ))}
                  </TextField>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Card sx={{ ...surfaceSoftSx, mt: 2 }}>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
              <Typography sx={{ color: "#e2e8f0", fontWeight: 700 }}>Parser key:value</Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={onAddParserPair}>Aggiungi</Button>
            </Stack>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ color: "#94a3b8" }}>Chiave origine</TableCell>
                  <TableCell sx={{ color: "#94a3b8" }}>Campo normalizzato</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {source.parserEntries.map((pair, idx) => (
                  <TableRow key={pair.id}>
                    <TableCell>
                      <TextField
                        value={pair.key}
                        onChange={(event) =>
                          onUpdateSource((current) => ({
                            ...current,
                            parserEntries: current.parserEntries.map((item, index) =>
                              index === idx ? { ...item, key: event.target.value } : item,
                            ),
                          }))
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        value={pair.value}
                        onChange={(event) =>
                          onUpdateSource((current) => ({
                            ...current,
                            parserEntries: current.parserEntries.map((item, index) =>
                              index === idx ? { ...item, value: event.target.value } : item,
                            ),
                          }))
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <IconButton
                        onClick={() =>
                          onUpdateSource((current) => ({
                            ...current,
                            parserEntries: current.parserEntries.filter((_, index) => index !== idx),
                          }))
                        }
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabPanel>

      <TabPanel value={tab} index={4}>
        <Card sx={surfaceCardSx}>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
              <Typography sx={{ color: "#e2e8f0", fontWeight: 700 }}>Catalogo tipi allarme</Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={onAddAlertRule}>Aggiungi regola</Button>
            </Stack>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ color: "#94a3b8" }}>Nome allarme</TableCell>
                  <TableCell sx={{ color: "#94a3b8" }}>Severity</TableCell>
                  <TableCell sx={{ color: "#94a3b8" }}>Match</TableCell>
                  <TableCell sx={{ color: "#94a3b8" }}>Note</TableCell>
                  <TableCell sx={{ color: "#94a3b8" }}>Attiva</TableCell>
                  <TableCell sx={{ color: "#94a3b8" }}>Count</TableCell>
                  <TableCell sx={{ color: "#94a3b8" }}>Ultimo evento</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {source.alertTypeRules.map((rule, idx) => (
                  <TableRow key={rule.id}>
                    <TableCell>
                      <TextField
                        value={rule.alertName}
                        onChange={(event) =>
                          onUpdateSource((current) => ({
                            ...current,
                            alertTypeRules: current.alertTypeRules.map((item, index) =>
                              index === idx ? { ...item, alertName: event.target.value } : item,
                            ),
                          }))
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        select
                        value={rule.severity}
                        onChange={(event) =>
                          onUpdateSource((current) => ({
                            ...current,
                            alertTypeRules: current.alertTypeRules.map((item, index) =>
                              index === idx ? { ...item, severity: event.target.value as (typeof severityOptions)[number] } : item,
                            ),
                          }))
                        }
                      >
                        {severityOptions.map((severity) => (
                          <MenuItem key={severity} value={severity}>{severity}</MenuItem>
                        ))}
                      </TextField>
                    </TableCell>
                    <TableCell>
                      <TextField
                        select
                        value={rule.matchMode}
                        onChange={(event) =>
                          onUpdateSource((current) => ({
                            ...current,
                            alertTypeRules: current.alertTypeRules.map((item, index) =>
                              index === idx ? { ...item, matchMode: event.target.value as MatchMode } : item,
                            ),
                          }))
                        }
                      >
                        {["exact", "contains", "regex"].map((mode) => (
                          <MenuItem key={mode} value={mode}>{mode}</MenuItem>
                        ))}
                      </TextField>
                    </TableCell>
                    <TableCell>
                      <TextField
                        value={rule.notes}
                        onChange={(event) =>
                          onUpdateSource((current) => ({
                            ...current,
                            alertTypeRules: current.alertTypeRules.map((item, index) =>
                              index === idx ? { ...item, notes: event.target.value } : item,
                            ),
                          }))
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={rule.enabled}
                        onChange={(event) =>
                          onUpdateSource((current) => ({
                            ...current,
                            alertTypeRules: current.alertTypeRules.map((item, index) =>
                              index === idx ? { ...item, enabled: event.target.checked } : item,
                            ),
                          }))
                        }
                      />
                    </TableCell>
                    <TableCell sx={{ color: "#cbd5e1" }}>{rule.receivedCount}</TableCell>
                    <TableCell sx={{ color: "#94a3b8" }}>{rule.lastSeenAt ?? "-"}</TableCell>
                    <TableCell>
                      <IconButton
                        onClick={() =>
                          onUpdateSource((current) => ({
                            ...current,
                            alertTypeRules: current.alertTypeRules.filter((_, index) => index !== idx),
                          }))
                        }
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabPanel>
    </Stack>
  );
}
