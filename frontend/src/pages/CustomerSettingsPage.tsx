import { Alert, Stack, Tab, Tabs } from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import TabPanel from "../components/TabPanel";
import { useCustomer } from "../context/CustomerContext";
import CustomerAlarmPolicyCard from "../features/customers/CustomerAlarmPolicyCard";
import CustomerProfileCard from "../features/customers/CustomerProfileCard";
import CustomerSettingsHeader from "../features/customers/CustomerSettingsHeader";
import CustomerSourcesTable from "../features/customers/CustomerSourcesTable";
import CustomerSummaryChips from "../features/customers/CustomerSummaryChips";
import { defaultCustomerSettings, type CustomerSettings } from "../features/customers/types";
import {
  fetchCustomerSettings,
  updateCustomerSettings,
} from "../services/alertsApi";
import { CustomerSettingsApi, CustomerSourceCatalogEntry } from "../types/alerts";

type Notice = { severity: "success" | "error" | "info"; message: string } | null;

function fromApi(settings: CustomerSettingsApi): CustomerSettings {
  return {
    tier: settings.tier,
    timezone: settings.timezone,
    slaTarget: settings.sla_target,
    primaryContact: settings.primary_contact,
    contactEmail: settings.contact_email,
    contactPhone: settings.contact_phone,
    notifyChannels: settings.notify_channels,
    escalationMatrix: settings.escalation_matrix,
    maintenanceWindow: settings.maintenance_window,
    defaultSeverity: settings.default_severity,
    autoAssignTeam: settings.auto_assign_team,
    notifyOnCritical: settings.notify_on_critical,
    notifyOnHigh: settings.notify_on_high,
    allowSuppress: settings.allow_suppress,
    retentionDays: settings.retention_days,
    tagDefaults: settings.tag_defaults,
    enrichGeo: settings.enrich_geo,
    enrichThreatIntel: settings.enrich_threat_intel,
    allowExternalSharing: settings.allow_external_sharing,
  };
}

function toApi(settings: CustomerSettings): Omit<CustomerSettingsApi, "created_at" | "updated_at"> {
  return {
    tier: settings.tier as CustomerSettingsApi["tier"],
    timezone: settings.timezone.trim(),
    sla_target: settings.slaTarget.trim(),
    primary_contact: settings.primaryContact.trim(),
    contact_email: settings.contactEmail.trim(),
    contact_phone: settings.contactPhone.trim(),
    notify_channels: settings.notifyChannels.trim(),
    escalation_matrix: settings.escalationMatrix.trim(),
    maintenance_window: settings.maintenanceWindow.trim(),
    default_severity: settings.defaultSeverity as CustomerSettingsApi["default_severity"],
    auto_assign_team: settings.autoAssignTeam.trim(),
    notify_on_critical: settings.notifyOnCritical,
    notify_on_high: settings.notifyOnHigh,
    allow_suppress: settings.allowSuppress,
    retention_days: settings.retentionDays,
    tag_defaults: settings.tagDefaults.trim(),
    enrich_geo: settings.enrichGeo,
    enrich_threat_intel: settings.enrichThreatIntel,
    allow_external_sharing: settings.allowExternalSharing,
  };
}

function validateSettings(settings: CustomerSettings): Partial<Record<keyof CustomerSettings, string>> {
  const errors: Partial<Record<keyof CustomerSettings, string>> = {};
  if (!settings.tier.trim()) {
    errors.tier = "Tier obbligatorio.";
  }
  if (!settings.timezone.trim()) {
    errors.timezone = "Timezone obbligatoria.";
  }
  if (!settings.slaTarget.trim()) {
    errors.slaTarget = "SLA target obbligatorio.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.contactEmail.trim())) {
    errors.contactEmail = "Email non valida.";
  }
  if (!Number.isFinite(settings.retentionDays) || settings.retentionDays < 1 || settings.retentionDays > 3650) {
    errors.retentionDays = "Retention deve essere tra 1 e 3650 giorni.";
  }
  return errors;
}

export default function CustomerSettingsPage() {
  const navigate = useNavigate();
  const { customerId } = useParams();
  const { customers, selectedCustomer, selectedCustomerId, setSelectedCustomerId } = useCustomer();

  const [tab, setTab] = useState(0);
  const [settings, setSettings] = useState<CustomerSettings>(defaultCustomerSettings);
  const [sources, setSources] = useState<CustomerSourceCatalogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [togglingSourceId, setTogglingSourceId] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof CustomerSettings, string>>>({});

  const routeCustomerId = Number(customerId ?? 0) || null;

  useEffect(() => {
    if (routeCustomerId && routeCustomerId !== selectedCustomerId) {
      setSelectedCustomerId(routeCustomerId);
      return;
    }
    if (!selectedCustomerId && customers.length) {
      setSelectedCustomerId(customers[0].id);
    }
  }, [customers, routeCustomerId, selectedCustomerId, setSelectedCustomerId]);

  useEffect(() => {
    if (selectedCustomerId && selectedCustomerId !== routeCustomerId) {
      navigate(`/customers/${selectedCustomerId}/settings`, { replace: true });
    }
  }, [navigate, routeCustomerId, selectedCustomerId]);

  const activeCustomer = useMemo(() => {
    if (selectedCustomer) return selectedCustomer;
    if (selectedCustomerId) return customers.find((item) => item.id === selectedCustomerId) ?? null;
    return null;
  }, [customers, selectedCustomer, selectedCustomerId]);

  const loadSettings = useCallback(async (customerIdToLoad: number) => {
    setLoading(true);
    try {
      const response = await fetchCustomerSettings(customerIdToLoad);
      setSettings(fromApi(response.settings));
      setSources(response.sources);
      setNotice(null);
      setFieldErrors({});
    } catch {
      setNotice({ severity: "error", message: "Impossibile caricare impostazioni cliente." });
      setSettings(defaultCustomerSettings);
      setSources([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeCustomer) return;
    void loadSettings(activeCustomer.id);
  }, [activeCustomer, loadSettings]);

  const enabledCount = useMemo(() => {
    return sources.filter((source) => source.customer_enabled).length;
  }, [sources]);

  const updateSettings = (partial: Partial<CustomerSettings>) => {
    setSettings((current) => ({ ...current, ...partial }));
    setFieldErrors((current) => {
      const next = { ...current };
      Object.keys(partial).forEach((key) => {
        delete next[key as keyof CustomerSettings];
      });
      return next;
    });
  };

  const toggleSourceForCustomer = async (sourceId: number, enabled: boolean) => {
    if (!activeCustomer) return;
    const previousSources = sources;
    setTogglingSourceId(sourceId);
    setSources((current) =>
      current.map((item) => (item.source_id === sourceId ? { ...item, customer_enabled: enabled } : item)),
    );
    try {
      const response = await updateCustomerSettings(activeCustomer.id, {
        source_overrides: [{ source_id: sourceId, is_enabled: enabled }],
      });
      setSources(response.sources);
      setNotice({ severity: "success", message: "Abilitazione fonte aggiornata." });
    } catch {
      setSources(previousSources);
      setNotice({ severity: "error", message: "Impossibile aggiornare la fonte per il cliente." });
    } finally {
      setTogglingSourceId(null);
    }
  };

  const save = async () => {
    if (!activeCustomer) return;
    const errors = validateSettings(settings);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setNotice({ severity: "error", message: "Correggi i campi evidenziati prima di salvare." });
      return;
    }
    setSaving(true);
    try {
      const response = await updateCustomerSettings(activeCustomer.id, { settings: toApi(settings) });
      setSettings(fromApi(response.settings));
      setSources(response.sources);
      setNotice({ severity: "success", message: "Impostazioni cliente salvate con successo." });
    } catch {
      setNotice({ severity: "error", message: "Salvataggio impostazioni cliente non riuscito." });
    } finally {
      setSaving(false);
    }
  };

  if (!activeCustomer) {
    return <Alert severity="info">Seleziona un cliente dal menu in alto a destra.</Alert>;
  }

  return (
    <Stack spacing={2} sx={{ minHeight: "calc(100vh - 148px)" }}>
      <CustomerSettingsHeader
        customers={customers}
        activeCustomerId={activeCustomer.id}
        onSelectCustomer={setSelectedCustomerId}
        onBack={() => navigate(`/customers/${activeCustomer.id}`)}
        onManageSources={() => navigate("/sources")}
        onSave={save}
        saving={saving}
      />

      {notice ? <Alert severity={notice.severity}>{notice.message}</Alert> : null}
      {loading ? <Alert severity="info">Caricamento configurazioni cliente in corso...</Alert> : null}

      <CustomerSummaryChips
        customerName={activeCustomer.name}
        enabledCount={enabledCount}
        sourcesCount={sources.length}
        tier={settings.tier}
      />

      <Tabs value={tab} onChange={(_, value) => setTab(value)} textColor="inherit" indicatorColor="primary">
        <Tab label="Profilo Cliente" />
        <Tab label="Policy Allarmi" />
        <Tab label="Fonti abilitate" />
      </Tabs>

      <TabPanel value={tab} index={0}>
        <CustomerProfileCard settings={settings} onChange={updateSettings} errors={fieldErrors} />
      </TabPanel>

      <TabPanel value={tab} index={1}>
        <CustomerAlarmPolicyCard settings={settings} onChange={updateSettings} />
      </TabPanel>

      <TabPanel value={tab} index={2}>
        <CustomerSourcesTable
          sources={sources}
          onToggle={toggleSourceForCustomer}
          loading={loading || saving || togglingSourceId !== null}
        />
      </TabPanel>
    </Stack>
  );
}
