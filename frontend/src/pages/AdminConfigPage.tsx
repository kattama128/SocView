import { Alert, Box, Chip, Grid, LinearProgress, Paper, Stack, Tab, Tabs, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import TabPanel from "../components/TabPanel";
import { useAuth } from "../context/AuthContext";
import ApiTokensCard from "../features/management/ApiTokensCard";
import IntegrationsOverviewCard from "../features/management/IntegrationsOverviewCard";
import ManagementStatsCards from "../features/management/ManagementStatsCards";
import NotificationsIntegrationsCard from "../features/management/NotificationsIntegrationsCard";
import PlatformProfileCard from "../features/management/PlatformProfileCard";
import RetentionComplianceCard from "../features/management/RetentionComplianceCard";
import RolesPermissionsCard from "../features/management/RolesPermissionsCard";
import SecurityAccessCard from "../features/management/SecurityAccessCard";
import UserDialog from "../features/management/UserDialog";
import UserManagementCard from "../features/management/UserManagementCard";
import { defaultManagementSettings, ManagementSettings } from "../features/management/types";
import { fetchCustomersOverview, fetchNotifications, searchAlerts } from "../services/alertsApi";
import { fetchIngestionRuns, fetchSourceCapabilities, fetchSources } from "../services/ingestionApi";
import {
  createUserAccount,
  fetchRoles,
  fetchSecurityAuditEvents,
  fetchUserAccounts,
  type SecurityAuditEvent,
  updateUserAccount,
} from "../services/usersApi";
import { surfaceCardSx } from "../styles/surfaces";
import { IngestionRun, Source, SourceCapabilitiesResponse } from "../types/ingestion";
import { RoleDefinition, UserAccount, UserAccountPayload } from "../types/users";

type TabKey = "overview" | "platform" | "security" | "users" | "integrations";

type OverviewMetrics = {
  customersCount: number;
  sourcesCount: number | null;
  activeAlerts: number;
  totalAlerts: number;
  unreadNotifications: number;
  criticalActive: number;
  highActive: number;
};

const tabStorageKey = "socview_management_ui_tab";
const settingsStorageKey = "socview_management_ui_settings";

const emptyOverview: OverviewMetrics = {
  customersCount: 0,
  sourcesCount: null,
  activeAlerts: 0,
  totalAlerts: 0,
  unreadNotifications: 0,
  criticalActive: 0,
  highActive: 0,
};

const emptyUserDraft: UserAccountPayload = {
  username: "",
  email: "",
  first_name: "",
  last_name: "",
  role: "SOC_ANALYST",
  is_active: true,
  password: "",
};

function loadStoredTab(): TabKey {
  const raw = localStorage.getItem(tabStorageKey);
  if (raw === "overview" || raw === "platform" || raw === "security" || raw === "users" || raw === "integrations") {
    return raw;
  }
  return "overview";
}

function loadStoredSettings(): ManagementSettings {
  try {
    const raw = localStorage.getItem(settingsStorageKey);
    if (!raw) {
      return defaultManagementSettings;
    }
    const parsed = JSON.parse(raw) as Partial<ManagementSettings>;
    return { ...defaultManagementSettings, ...parsed };
  } catch {
    return defaultManagementSettings;
  }
}

function formatRunStatus(status: string): string {
  if (status === "success") return "success";
  if (status === "failed") return "failed";
  if (status === "running") return "running";
  return status || "unknown";
}

export default function AdminConfigPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [tab, setTab] = useState<TabKey>(loadStoredTab);
  const [overview, setOverview] = useState<OverviewMetrics>(emptyOverview);
  const [sources, setSources] = useState<Source[]>([]);
  const [capabilities, setCapabilities] = useState<SourceCapabilitiesResponse | null>(null);
  const [ingestionRuns, setIngestionRuns] = useState<IngestionRun[]>([]);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityAuditEvent[]>([]);

  const [loadingData, setLoadingData] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [userSearch, setUserSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [draftUser, setDraftUser] = useState<UserAccountPayload>(emptyUserDraft);
  const [platformSettings, setPlatformSettings] = useState<ManagementSettings>(loadStoredSettings);

  const canView = Boolean(user?.permissions?.view);
  const canManageSources = Boolean(user?.permissions?.manage_sources);
  const canManageUsers = Boolean(user?.permissions?.manage_users);
  const canManageSecurity = Boolean(user?.permissions?.admin || user?.permissions?.manage_users);

  const tabs = useMemo(
    () =>
      [
        { key: "overview" as TabKey, label: "Panoramica", visible: canView },
        { key: "platform" as TabKey, label: "Piattaforma", visible: canView },
        { key: "security" as TabKey, label: "Sicurezza", visible: canManageSecurity },
        { key: "users" as TabKey, label: "Utenti", visible: canManageUsers },
        { key: "integrations" as TabKey, label: "Integrazioni", visible: canManageSources },
      ].filter((item) => item.visible),
    [canManageSecurity, canManageSources, canManageUsers, canView],
  );

  const tabIndex = Math.max(
    0,
    tabs.findIndex((item) => item.key === tab),
  );

  useEffect(() => {
    localStorage.setItem(tabStorageKey, tab);
  }, [tab]);

  useEffect(() => {
    localStorage.setItem(settingsStorageKey, JSON.stringify(platformSettings));
  }, [platformSettings]);

  useEffect(() => {
    if (!tabs.length) {
      return;
    }
    if (!tabs.some((item) => item.key === tab)) {
      setTab(tabs[0].key);
    }
  }, [tab, tabs]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!user || !canView) {
        setOverview(emptyOverview);
        setRoles([]);
        setUsers([]);
        setSecurityEvents([]);
        setSources([]);
        setCapabilities(null);
        setIngestionRuns([]);
        setLoadError(null);
        return;
      }

      setLoadingData(true);
      setLoadError(null);

      const [
        customersOverviewRes,
        activeAlertsRes,
        totalAlertsRes,
        notificationsRes,
        rolesRes,
        usersRes,
        securityRes,
        sourcesRes,
        capabilitiesRes,
        runsRes,
      ] = await Promise.allSettled([
        fetchCustomersOverview("name"),
        searchAlerts({ page: 1, page_size: 1, is_active: true, ordering: "-event_timestamp" }),
        searchAlerts({ page: 1, page_size: 1, ordering: "-event_timestamp" }),
        fetchNotifications("unread", 20),
        fetchRoles(),
        canManageUsers ? fetchUserAccounts() : Promise.resolve([] as UserAccount[]),
        canManageSecurity ? fetchSecurityAuditEvents(40) : Promise.resolve([] as SecurityAuditEvent[]),
        canManageSources ? fetchSources() : Promise.resolve([] as Source[]),
        canManageSources ? fetchSourceCapabilities() : Promise.resolve(null as SourceCapabilitiesResponse | null),
        canManageSources ? fetchIngestionRuns() : Promise.resolve([] as IngestionRun[]),
      ]);

      if (cancelled) {
        return;
      }

      const issues: string[] = [];

      const customersOverview = customersOverviewRes.status === "fulfilled" ? customersOverviewRes.value : [];
      if (customersOverviewRes.status === "rejected") {
        issues.push("overview clienti");
      }

      const activeAlertsCount = activeAlertsRes.status === "fulfilled" ? activeAlertsRes.value.count : 0;
      if (activeAlertsRes.status === "rejected") {
        issues.push("conteggio allarmi attivi");
      }

      const totalAlertsCount = totalAlertsRes.status === "fulfilled" ? totalAlertsRes.value.count : 0;
      if (totalAlertsRes.status === "rejected") {
        issues.push("conteggio allarmi totali");
      }

      const notifications = notificationsRes.status === "fulfilled" ? notificationsRes.value : { unread_count: 0, results: [] };
      if (notificationsRes.status === "rejected") {
        issues.push("notifiche");
      }

      const rolesPayload = rolesRes.status === "fulfilled" ? rolesRes.value : [];
      if (rolesRes.status === "rejected") {
        issues.push("ruoli");
      }

      const usersPayload = usersRes.status === "fulfilled" ? usersRes.value : [];
      if (usersRes.status === "rejected" && canManageUsers) {
        issues.push("utenti");
      }

      const securityPayload = securityRes.status === "fulfilled" ? securityRes.value : [];
      if (securityRes.status === "rejected" && canManageSecurity) {
        issues.push("security audit");
      }

      const sourcesPayload = sourcesRes.status === "fulfilled" ? sourcesRes.value : [];
      if (sourcesRes.status === "rejected" && canManageSources) {
        issues.push("fonti");
      }

      const capabilitiesPayload = capabilitiesRes.status === "fulfilled" ? capabilitiesRes.value : null;
      if (capabilitiesRes.status === "rejected" && canManageSources) {
        issues.push("capability fonti");
      }

      const runsPayload = runsRes.status === "fulfilled" ? runsRes.value : [];
      if (runsRes.status === "rejected" && canManageSources) {
        issues.push("ingestion runs");
      }

      const criticalActive = customersOverview.reduce((acc, item) => acc + item.active_alerts_critical, 0);
      const highActive = customersOverview.reduce((acc, item) => acc + item.active_alerts_high, 0);

      setOverview({
        customersCount: customersOverview.length,
        sourcesCount: canManageSources ? sourcesPayload.length : null,
        activeAlerts: activeAlertsCount,
        totalAlerts: totalAlertsCount,
        unreadNotifications: notifications.unread_count,
        criticalActive,
        highActive,
      });

      setRoles(rolesPayload);
      setUsers(usersPayload);
      setSecurityEvents(securityPayload);
      setSources(sourcesPayload);
      setCapabilities(capabilitiesPayload);
      setIngestionRuns([...runsPayload].sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()));

      setLoadError(issues.length ? `Alcune sezioni non sono complete: ${issues.join(", ")}.` : null);
      setLoadingData(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [canManageSecurity, canManageSources, canManageUsers, canView, user]);

  const filteredUsers = useMemo(() => {
    const term = userSearch.trim().toLowerCase();
    return users.filter((item) => {
      const matchesStatus = statusFilter === "all" ? true : statusFilter === "active" ? item.is_active : !item.is_active;
      if (!matchesStatus) return false;
      if (!term) return true;
      return (
        item.username.toLowerCase().includes(term) ||
        item.email.toLowerCase().includes(term) ||
        item.first_name.toLowerCase().includes(term) ||
        item.last_name.toLowerCase().includes(term) ||
        item.role.toLowerCase().includes(term)
      );
    });
  }, [statusFilter, userSearch, users]);

  const openCreateDialog = () => {
    if (!roles.length) {
      setActionError("Ruoli non disponibili: ricaricare la pagina prima di creare un utente.");
      return;
    }
    setEditingUser(null);
    setDraftUser(emptyUserDraft);
    setDialogOpen(true);
  };

  const openEditDialog = (account: UserAccount) => {
    setEditingUser(account);
    setDraftUser({
      username: account.username,
      email: account.email,
      first_name: account.first_name,
      last_name: account.last_name,
      role: account.role,
      is_active: account.is_active,
      password: "",
      memberships: account.memberships.map((item) => ({
        customer_id: item.customer_id,
        scope: item.scope,
        is_active: item.is_active,
        notes: item.notes,
      })),
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
  };

  const saveUser = async () => {
    if (!canManageUsers) {
      return;
    }
    setActionError(null);
    setSavingUser(true);
    try {
      if (editingUser) {
        const payload: Partial<UserAccountPayload> = { ...draftUser };
        if (!payload.password) {
          delete payload.password;
        }
        const updated = await updateUserAccount(editingUser.id, payload);
        setUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      } else {
        const created = await createUserAccount(draftUser);
        setUsers((current) => [...current, created]);
      }
      closeDialog();
    } catch {
      setActionError("Impossibile salvare l'utente.");
    } finally {
      setSavingUser(false);
    }
  };

  const toggleUserStatus = async (account: UserAccount) => {
    if (!canManageUsers) {
      return;
    }
    setActionError(null);
    try {
      const updated = await updateUserAccount(account.id, { is_active: !account.is_active });
      setUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch {
      setActionError("Impossibile aggiornare lo stato utente.");
    }
  };

  const updatePlatformSettings = (partial: Partial<ManagementSettings>) => {
    setPlatformSettings((current) => ({ ...current, ...partial }));
  };

  if (!canView) {
    return (
      <Stack spacing={2}>
        <Typography sx={{ color: "#f8fafc", fontSize: 30, fontWeight: 700 }}>Management</Typography>
        <Typography sx={{ color: "#fca5a5" }}>Accesso negato: permesso `view` mancante.</Typography>
      </Stack>
    );
  }

  return (
    <Stack spacing={2} sx={{ minHeight: "calc(100vh - 148px)" }}>
      <Box>
        <Typography sx={{ color: "#f8fafc", fontSize: { xs: 26, md: 34 }, fontWeight: 700 }}>Management</Typography>
        <Typography sx={{ color: "#64748b" }}>
          Console globale API-driven: monitoraggio operativo, governance utenti, sicurezza e integrazioni.
        </Typography>
        <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap" sx={{ mt: 1.2 }}>
          <Chip clickable onClick={() => navigate("/sources")} label="Configura Sources" sx={{ color: "#93c5fd", border: "1px solid rgba(59,130,246,0.35)" }} />
          <Chip clickable onClick={() => navigate("/customers")} label="Gestione Customers" sx={{ color: "#86efac", border: "1px solid rgba(34,197,94,0.35)" }} />
          <Chip clickable onClick={() => navigate("/active-alarms")} label="Triage Active Alarms" sx={{ color: "#fcd34d", border: "1px solid rgba(234,179,8,0.35)" }} />
        </Stack>
      </Box>

      {loadingData ? <LinearProgress /> : null}
      {loadError ? <Alert severity="warning">{loadError}</Alert> : null}
      {actionError ? <Alert severity="error">{actionError}</Alert> : null}

      <Tabs value={tabIndex} onChange={(_, value) => setTab(tabs[value].key)} textColor="inherit" indicatorColor="primary">
        {tabs.map((item) => (
          <Tab key={item.key} label={item.label} />
        ))}
      </Tabs>

      <TabPanel value={tabIndex} index={tabs.findIndex((item) => item.key === "overview")}>
        <Stack spacing={2}>
          <ManagementStatsCards
            customersCount={overview.customersCount}
            sourcesCount={overview.sourcesCount}
            activeAlerts={overview.activeAlerts}
            totalAlerts={overview.totalAlerts}
          />
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Paper sx={{ ...surfaceCardSx, p: 2 }}>
                <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>Distribuzione allarmi attivi</Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                  <Chip label={`Critical: ${overview.criticalActive}`} sx={{ color: "#fecaca", border: "1px solid rgba(239,68,68,0.4)" }} />
                  <Chip label={`High: ${overview.highActive}`} sx={{ color: "#fde68a", border: "1px solid rgba(245,158,11,0.4)" }} />
                  <Chip label={`Unread notifiche: ${overview.unreadNotifications}`} sx={{ color: "#bfdbfe", border: "1px solid rgba(59,130,246,0.4)" }} />
                </Stack>
              </Paper>
            </Grid>
            <Grid item xs={12} md={6}>
              <Paper sx={{ ...surfaceCardSx, p: 2 }}>
                <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>Stato operativo</Typography>
                <Typography sx={{ color: "#94a3b8" }}>
                  Ultimo run ingestion:{" "}
                  {ingestionRuns[0]
                    ? `${new Date(ingestionRuns[0].started_at).toLocaleString("it-IT")} · ${formatRunStatus(ingestionRuns[0].status)}`
                    : canManageSources
                      ? "nessun run disponibile"
                      : "non autorizzato"}
                </Typography>
                <Typography sx={{ color: "#94a3b8", mt: 1 }}>
                  Ruolo corrente: <strong>{user?.role ?? "-"}</strong>
                </Typography>
              </Paper>
            </Grid>
          </Grid>
        </Stack>
      </TabPanel>

      <TabPanel value={tabIndex} index={tabs.findIndex((item) => item.key === "platform")}>
        <Stack spacing={2}>
          <Grid container spacing={2}>
            <Grid item xs={12} lg={6}>
              <PlatformProfileCard settings={platformSettings} onChange={updatePlatformSettings} />
            </Grid>
            <Grid item xs={12} lg={6}>
              <SecurityAccessCard settings={platformSettings} onChange={updatePlatformSettings} />
            </Grid>
            <Grid item xs={12} lg={6}>
              <NotificationsIntegrationsCard settings={platformSettings} onChange={updatePlatformSettings} />
            </Grid>
            <Grid item xs={12} lg={6}>
              <RetentionComplianceCard settings={platformSettings} onChange={updatePlatformSettings} />
            </Grid>
            <Grid item xs={12}>
              <ApiTokensCard
                tokens={[
                  { name: "ingestion-runner", scope: "sources:run,alerts:write", lastRotated: "2026-02-26" },
                  { name: "automation-bot", scope: "users:read,alerts:triage", lastRotated: "2026-02-15" },
                ]}
              />
            </Grid>
          </Grid>
        </Stack>
      </TabPanel>

      <TabPanel value={tabIndex} index={tabs.findIndex((item) => item.key === "security")}>
        <Stack spacing={2}>
          <Grid container spacing={2}>
            <Grid item xs={12} md={5}>
              <RolesPermissionsCard roles={roles} />
            </Grid>
            <Grid item xs={12} md={7}>
              <Paper sx={{ ...surfaceCardSx, p: 2 }}>
                <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>Security audit (ultimi eventi)</Typography>
                {securityEvents.length === 0 ? (
                  <Typography sx={{ color: "#94a3b8" }}>Nessun evento disponibile.</Typography>
                ) : (
                  securityEvents.slice(0, 12).map((event) => (
                    <Typography key={event.id} sx={{ color: "#cbd5e1", fontSize: 13, mb: 0.4 }}>
                      {new Date(event.created_at).toLocaleString("it-IT")} · {event.action} · {event.actor_username || "system"} ·{" "}
                      {event.ip_address || "-"}
                    </Typography>
                  ))
                )}
              </Paper>
            </Grid>
          </Grid>
        </Stack>
      </TabPanel>

      <TabPanel value={tabIndex} index={tabs.findIndex((item) => item.key === "users")}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={7}>
            <UserManagementCard
              users={users}
              filteredUsers={filteredUsers}
              userSearch={userSearch}
              statusFilter={statusFilter}
              loading={loadingData || savingUser}
              error={actionError}
              canManageUsers={canManageUsers}
              onSearchChange={setUserSearch}
              onStatusChange={setStatusFilter}
              onCreate={openCreateDialog}
              onEdit={openEditDialog}
              onToggleStatus={toggleUserStatus}
            />
          </Grid>
          <Grid item xs={12} md={5}>
            <RolesPermissionsCard roles={roles} />
          </Grid>
        </Grid>
      </TabPanel>

      <TabPanel value={tabIndex} index={tabs.findIndex((item) => item.key === "integrations")}>
        <Stack spacing={2}>
          <IntegrationsOverviewCard sources={sources} />
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Paper sx={{ ...surfaceCardSx, p: 2 }}>
                <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>Capability matrix</Typography>
                {capabilities?.types?.length ? (
                  capabilities.types.map((item) => (
                    <Typography key={item.type} sx={{ color: "#cbd5e1", fontSize: 13, mb: 0.4 }}>
                      {item.label}: {item.status.toUpperCase()} · test:{item.supports_test_connection ? "yes" : "no"} · run-now:
                      {item.supports_run_now ? "yes" : "no"}
                    </Typography>
                  ))
                ) : (
                  <Typography sx={{ color: "#94a3b8" }}>Nessuna capability disponibile.</Typography>
                )}
              </Paper>
            </Grid>
            <Grid item xs={12} md={6}>
              <Paper sx={{ ...surfaceCardSx, p: 2 }}>
                <Typography sx={{ color: "#e2e8f0", fontWeight: 700, mb: 1 }}>Ultimi ingestion run</Typography>
                {ingestionRuns.length ? (
                  ingestionRuns.slice(0, 10).map((run) => (
                    <Typography key={run.id} sx={{ color: "#cbd5e1", fontSize: 13, mb: 0.4 }}>
                      #{run.id} · source:{run.source} · {formatRunStatus(run.status)} · {new Date(run.started_at).toLocaleString("it-IT")}
                    </Typography>
                  ))
                ) : (
                  <Typography sx={{ color: "#94a3b8" }}>Nessun run disponibile.</Typography>
                )}
              </Paper>
            </Grid>
          </Grid>
        </Stack>
      </TabPanel>

      <UserDialog
        open={dialogOpen}
        editingUser={editingUser}
        draftUser={draftUser}
        roleOptions={roles}
        canManageUsers={canManageUsers}
        onChange={setDraftUser}
        onClose={closeDialog}
        onSave={saveUser}
      />
    </Stack>
  );
}
