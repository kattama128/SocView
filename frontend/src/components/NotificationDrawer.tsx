import {
  Box,
  Button,
  Checkbox,
  Divider,
  Drawer,
  FormControlLabel,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useEffect, useMemo, useState } from "react";

import {
  fetchNotificationPreferences,
  updateNotificationPreferences,
} from "../services/alertsApi";
import { CustomerSummary, NotificationEvent, NotificationPreferences } from "../types/alerts";

type NotificationDrawerProps = {
  open: boolean;
  notifications: NotificationEvent[];
  customers: CustomerSummary[];
  onClose: () => void;
  onOpenAlert: (alertId: number) => void;
  onAck: (notificationId: number) => Promise<void>;
  onAckAll: () => Promise<void>;
  onSnooze: (notificationId: number, payload: { minutes?: number; snooze_until?: string }) => Promise<void>;
};

const severityOptions: Array<{ value: NotificationPreferences["min_severity"]; label: string }> = [
  { value: "all", label: "Tutte" },
  { value: "critical", label: "Critica" },
  { value: "high", label: "Alta" },
  { value: "medium", label: "Media" },
  { value: "low", label: "Bassa" },
];

function tomorrowMorningIso(): string {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  next.setHours(9, 0, 0, 0);
  return next.toISOString();
}

export default function NotificationDrawer({
  open,
  notifications,
  customers,
  onClose,
  onOpenAlert,
  onAck,
  onAckAll,
  onSnooze,
}: NotificationDrawerProps) {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState(0);
  const [loadingPrefs, setLoadingPrefs] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsError, setPrefsError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [snoozePickerFor, setSnoozePickerFor] = useState<number | null>(null);

  const unreadCount = useMemo(() => notifications.filter((item) => !item.is_read).length, [notifications]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setLoadingPrefs(true);
    setPrefsError(null);
    void fetchNotificationPreferences()
      .then((payload) => setPrefs(payload))
      .catch(() => setPrefsError("Impossibile caricare le preferenze notifiche."))
      .finally(() => setLoadingPrefs(false));
  }, [open]);

  const updatePrefs = async (next: NotificationPreferences) => {
    setSavingPrefs(true);
    setPrefsError(null);
    try {
      const payload = await updateNotificationPreferences({
        min_severity: next.min_severity,
        customer_filter: next.customer_filter,
        channels: next.channels,
      });
      setPrefs(payload);
    } catch {
      setPrefsError("Salvataggio preferenze non riuscito.");
    } finally {
      setSavingPrefs(false);
    }
  };

  return (
    <Drawer
      data-testid="notification-drawer"
      anchor="right"
      open={open}
      onClose={onClose}
      transitionDuration={0}
      ModalProps={{ keepMounted: true }}
      sx={{
        zIndex: (drawerTheme) => drawerTheme.zIndex.modal + 5,
        [`& .MuiDrawer-paper`]: {
          width: 420,
          p: 2,
          borderLeft: "1px solid var(--border-subtle)",
        },
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="h6" sx={{ fontSize: 20 }}>
          Centro notifiche
        </Typography>
        {activeTab === 0 ? (
          <Button size="small" onClick={() => void onAckAll()} color="info" data-testid="notification-ack-all-button">
            Segna tutto letto
          </Button>
        ) : null}
      </Stack>

      <Tabs value={activeTab} onChange={(_, value: number) => setActiveTab(value)} sx={{ mb: 1 }}>
        <Tab label={`Notifiche (${unreadCount})`} data-testid="notification-list-tab" />
        <Tab label="Preferenze" data-testid="notification-prefs-tab" />
      </Tabs>

      <Divider sx={{ mb: 1.2 }} />

      {activeTab === 0 ? (
        <List>
          {notifications.map((item) => (
            <ListItemButton
              key={item.id}
              data-testid="notification-item"
              sx={{
                mb: 1,
                borderRadius: 1.5,
                border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
                alignItems: "flex-start",
                opacity: item.is_read ? 0.65 : 1,
                background: alpha(theme.palette.background.paper, 0.72),
              }}
            >
              <ListItemText
                primaryTypographyProps={{ component: "div" }}
                secondaryTypographyProps={{ component: "div" }}
                primary={
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2">{item.title}</Typography>
                    {!item.is_read ? <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "error.main" }} /> : null}
                  </Stack>
                }
                secondary={
                  <Stack spacing={0.8} sx={{ mt: 0.4 }}>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      {new Date(item.created_at).toLocaleString("it-IT")}
                    </Typography>
                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                      {item.message}
                    </Typography>
                    <Stack direction="row" spacing={0.6} sx={{ flexWrap: "wrap", rowGap: 0.6 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => {
                          void onAck(item.id).then(() => onOpenAlert(item.alert));
                        }}
                      >
                        Apri
                      </Button>
                      <Button
                        size="small"
                        variant="text"
                        onClick={() => void onAck(item.id)}
                        data-testid="notification-ack-button"
                      >
                        Letta
                      </Button>
                      <Button
                        size="small"
                        variant="text"
                        data-testid="notification-snooze-button"
                        onClick={() => setSnoozePickerFor((current) => (current === item.id ? null : item.id))}
                      >
                        Snooze
                      </Button>
                    </Stack>
                    {snoozePickerFor === item.id ? (
                      <Stack direction="row" spacing={0.6} sx={{ flexWrap: "wrap", rowGap: 0.6 }}>
                        <Button
                          size="small"
                          variant="outlined"
                          data-value="15m"
                          onClick={() => {
                            setSnoozePickerFor(null);
                            void onSnooze(item.id, { minutes: 15 });
                          }}
                        >
                          15 minuti
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          data-value="1h"
                          onClick={() => {
                            setSnoozePickerFor(null);
                            void onSnooze(item.id, { minutes: 60 });
                          }}
                        >
                          1 ora
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          data-value="4h"
                          onClick={() => {
                            setSnoozePickerFor(null);
                            void onSnooze(item.id, { minutes: 240 });
                          }}
                        >
                          4 ore
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          data-value="tomorrow"
                          onClick={() => {
                            setSnoozePickerFor(null);
                            void onSnooze(item.id, { snooze_until: tomorrowMorningIso() });
                          }}
                        >
                          Fino a domani
                        </Button>
                      </Stack>
                    ) : null}
                  </Stack>
                }
              />
            </ListItemButton>
          ))}
        </List>
      ) : (
        <Stack spacing={1.4}>
          {prefsError ? <Typography color="error">{prefsError}</Typography> : null}
          {loadingPrefs || !prefs ? (
            <Typography color="text.secondary">Caricamento preferenze...</Typography>
          ) : (
            <>
              <TextField
                select
                label="Severità minima"
                value={prefs.min_severity}
                data-testid="min-severity-select"
                onChange={(event) => setPrefs({ ...prefs, min_severity: event.target.value as NotificationPreferences["min_severity"] })}
                size="small"
              >
                {severityOptions.map((item) => (
                  <MenuItem key={item.value} value={item.value}>
                    {item.label}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                select
                SelectProps={{ multiple: true }}
                label="Clienti filtrati"
                size="small"
                value={prefs.customer_filter}
                onChange={(event) => {
                  const value = event.target.value;
                  const next = Array.isArray(value) ? value.map((item) => Number(item)) : [];
                  setPrefs({ ...prefs, customer_filter: next });
                }}
                helperText="Vuoto = tutti i clienti"
              >
                {customers.map((customer) => (
                  <MenuItem key={customer.id} value={customer.id}>
                    {customer.name}
                  </MenuItem>
                ))}
              </TextField>

              <FormControlLabel
                control={
                  <Checkbox
                    checked={Boolean(prefs.channels.ui)}
                    onChange={(event) => setPrefs({ ...prefs, channels: { ...prefs.channels, ui: event.target.checked } })}
                  />
                }
                label="Canale UI"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={Boolean(prefs.channels.email)}
                    onChange={(event) => setPrefs({ ...prefs, channels: { ...prefs.channels, email: event.target.checked } })}
                  />
                }
                label="Canale Email"
              />

              <Button
                variant="contained"
                disabled={savingPrefs}
                onClick={() => {
                  if (prefs) {
                    void updatePrefs(prefs);
                  }
                }}
              >
                Salva preferenze
              </Button>
            </>
          )}
        </Stack>
      )}
    </Drawer>
  );
}
