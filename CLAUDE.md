# SocView — Contesto per Claude Code

## Cos'è questo progetto

Piattaforma SOC multi-tenant per gestione alert di sicurezza, ingestion da sorgenti eterogenee e workflow operativi. Stack principale:

- **Backend**: Django 4.2 + DRF + `django-tenants` (schema PostgreSQL per tenant)
- **Frontend**: React 18 + TypeScript + MUI 5 + Vite
- **Infra**: PostgreSQL 16, Redis 7, Celery (worker + beat), nginx reverse proxy

## Setup locale

```bash
git clone https://github.com/kattama128/SocView.git && cd SocView
./start.sh          # costruisce e avvia tutto, esegue le migrazioni
```

Oppure manualmente:
```bash
docker compose up -d --build
docker exec socview-backend python manage.py migrate_schemas --shared
docker exec socview-backend python manage.py migrate_schemas
```

L'app è su `http://localhost`. Credenziali default: **admin / admin**, **analyst1 / analyst1**.

## Struttura

```
backend/
  socview/            # settings, urls, wsgi
  core/               # auth, throttling
  tenant_admin/       # modelli public schema (Client, Domain, UserProfile)
  tenant_data/        # modelli tenant: Alert, Source, Customer, Tag, SlaConfig, ...
    views.py          # ~1500 righe — API principale
    ingestion/        # pipeline ingestion (service.py, parser.py)
    tasks.py          # task Celery
  customers/          # modelli legacy
frontend/
  src/
    pages/            # pagine principali
    features/         # componenti per dominio (alerts, management, sources, ...)
    services/         # API layer (alertsApi.ts, ingestionApi.ts, usersApi.ts)
    types/            # tipi TypeScript (alerts.ts, ingestion.ts, users.ts)
    context/          # AuthContext
    styles/           # surfaces.ts (temi card)
```

## Architettura multi-tenant

- nginx mappa `localhost` → backend con header `Host: tenant1.localhost`
- Il DB deve avere il dominio `tenant1.localhost` registrato nella tabella `customers_domain`
- Le API tenant sono sotto `/alerts/`, `/ingestion/`, `/auth/`
- Le API public-schema (super admin) sono sotto `/admin-api/`
- Se aggiungi un dominio: `docker exec socview-backend python manage.py shell -c "from customers.models import Client, Domain; c=Client.objects.get(schema_name='tenant1'); Domain.objects.get_or_create(domain='tenant1.localhost', tenant=c, is_primary=False)"`

## RBAC

Ruoli: `SUPER_ADMIN`, `SOC_MANAGER`, `SOC_ANALYST`, `READ_ONLY`

Permessi chiave: `view`, `triage`, `manage_sources`, `manage_customers`, `manage_users`, `export`, `admin`

Le capability sono definite in `backend/tenant_data/rbac.py`.

## Branch

- `main` — stabile, include fix paginazione (`fetchCustomers`/`fetchAuditLogs`)
- `claude/sleepy-bhaskara` — branch di sviluppo attivo con Management page completa

## Fix noti applicati

- **Paginazione frontend**: `fetchCustomers` e `fetchAuditLogs` in `alertsApi.ts` gestiscono sia array puri che `{count, results:[]}` (backend usa `StandardPagination`)
- **Dominio tenant**: `tenant1.localhost` deve essere in DB per le API tenant
- **vite.config.ts** (branch `claude/sleepy-bhaskara`): `cookieDomainRewrite: ""` per dev server proxy

## Pagine principali

| Route | Componente | Permesso |
|-------|-----------|---------|
| `/home` | DashboardPage | view |
| `/active-alarms` | ActiveAlarmsPage | view |
| `/search` | TenantPage (search + saved) | view |
| `/sources` | SourcesPage | manage_sources |
| `/parsers` | ParserPage | manage_sources |
| `/customers` | CustomersPage | manage_customers |
| `/analytics` | AnalyticsPage | view |
| `/configurazione` | AdminConfigPage (Management) | view |
| `/admin-panel` | AdminPanelPage | admin |
| `/403` | ForbiddenPage | — |

## Management page (`/configurazione`) — stato attuale

Tab implementati:
- **Panoramica**: KPI cards + distribuzione allarmi
- **Piattaforma**: Profilo piattaforma, Sicurezza (localStorage), NotificationsIntegrationsCard (wired → `PATCH /alerts/notification-preferences/`), RetentionCompliance (localStorage), **SlaConfigCard** (wired → `POST /alerts/sla-config/`)
- **Sicurezza**: RolesPermissionsCard + security audit log
- **Utenti**: UserManagementCard con CRUD + **dialog membership editing** per cliente/scope
- **Integrazioni**: **IntegrationsOverviewCard** con Source CRUD completo (create/edit/delete/test/run-now) via `SourceDialog`

## API chiave

```typescript
// alertsApi.ts
fetchCustomers()         // GET /alerts/customers/
fetchCustomersOverview() // GET /alerts/customers/overview/
fetchSlaConfig()         // GET /alerts/sla-config/
saveSlaConfig(payload)   // POST /alerts/sla-config/
fetchNotificationPreferences()         // GET /alerts/notification-preferences/
updateNotificationPreferences(payload) // PATCH /alerts/notification-preferences/
upsertCustomerMembership(customerId, payload) // POST /alerts/customers/{id}/memberships/
deleteCustomerMembership(customerId, userId)  // DELETE /alerts/customers/{id}/memberships/

// ingestionApi.ts
fetchSources(options?)         // GET /ingestion/sources/
createSource(payload)          // POST /ingestion/sources/
updateSource(id, payload)      // PATCH /ingestion/sources/{id}/
deleteSource(id)               // DELETE /ingestion/sources/{id}/
testSourceConnection(id)       // POST /ingestion/sources/{id}/test-connection/
runSourceNow(id)               // POST /ingestion/sources/{id}/run-now/

// usersApi.ts
fetchUserAccounts()            // GET /auth/users/
createUserAccount(payload)     // POST /auth/users/
updateUserAccount(id, payload) // PATCH /auth/users/{id}/
```

## Comandi utili

```bash
# Rebuild frontend dopo modifiche al codice
docker build -t socview-frontend ./frontend
docker stop socview-frontend && docker rm socview-frontend
docker compose up -d frontend

# TypeScript check (dalla directory frontend)
npx tsc --noEmit

# Build produzione
npm run build

# Logs
docker logs socview-backend --tail=50 -f
docker logs socview-frontend --tail=20

# Shell backend
docker exec -it socview-backend python manage.py shell

# Ricrea tutto da zero
docker compose down -v && ./start.sh
```

## Note importanti

- Il **Docker frontend** si costruisce dalla directory del repository corrente (`./frontend`), NON dalla directory del worktree. Se si lavora in un worktree, usare `docker build -t socview-frontend ./frontend` dalla directory del worktree, poi `docker compose up -d frontend` dalla directory principale.
- I file di style condivisi sono in `frontend/src/styles/surfaces.ts` (pattern card dark mode)
- Le migrazioni Django richiedono `migrate_schemas --shared` poi `migrate_schemas` (in questo ordine)
- Il backend usa `X-Schema-Name` header per routing tenant in alcuni endpoint pubblici
