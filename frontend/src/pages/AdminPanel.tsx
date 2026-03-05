import { Alert, Stack, Tab, Tabs, Typography } from "@mui/material";
import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import TabAudit from "./AdminPanel/TabAudit";
import TabRuoli from "./AdminPanel/TabRuoli";
import TabTenant from "./AdminPanel/TabTenant";
import TabUtenti from "./AdminPanel/TabUtenti";

export default function AdminPanel() {
  const { user } = useAuth();
  const [tab, setTab] = useState(0);

  const isAdmin = Boolean(user?.permissions?.admin);
  const isPublicSchema = Boolean(user?.is_public_schema);

  const tabs = useMemo(
    () => ["Utenti", "Ruoli & Membership", "Tenant", "Audit Sicurezza"],
    [],
  );

  if (!isAdmin) {
    return <Navigate to="/403" replace />;
  }

  return (
    <Stack spacing={1.2} data-testid="admin-panel">
      <Typography variant="h4" sx={{ fontWeight: 700 }}>
        Pannello Admin
      </Typography>
      {!isPublicSchema ? (
        <Alert severity="info">Sei in schema tenant: la tab Tenant è disponibile solo in schema public.</Alert>
      ) : null}

      <Tabs value={tab} onChange={(_, value) => setTab(value)}>
        {tabs.map((item, index) => (
          <Tab
            key={item}
            label={item}
            data-testid={
              index === 0
                ? "tab-users"
                : index === 1
                  ? "tab-roles"
                  : index === 2
                    ? "tab-tenant"
                    : "tab-audit"
            }
          />
        ))}
      </Tabs>

      {tab === 0 ? <TabUtenti /> : null}
      {tab === 1 ? <TabRuoli /> : null}
      {tab === 2 ? <TabTenant isPublicSchema={isPublicSchema} /> : null}
      {tab === 3 ? <TabAudit /> : null}
    </Stack>
  );
}
