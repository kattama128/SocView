# RBAC Permission Matrix

Data: `2026-03-03`  
Scope: API tenant (`tenant*.localhost`)

## Capability model

- `view`: accesso in lettura a dashboard/allarmi/notifiche.
- `triage`: workflow operativo alert (assegnazione, stati, tag, commenti, allegati).
- `manage_sources`: gestione fonti ingestion/parser/config e run operativi.
- `manage_customers`: gestione customer, settings customer, audit operativo customer.
- `manage_users`: gestione utenti e membership utente-cliente.
- `export`: export dati alert.
- `admin`: amministrazione globale e pieno bypass scope cliente.

## Role -> capability

| Role | view | triage | manage_sources | manage_customers | manage_users | export | admin |
|---|---|---|---|---|---|---|---|
| `SUPER_ADMIN` | yes | yes | yes | yes | yes | yes | yes |
| `SOC_MANAGER` | yes | yes | yes | yes | yes | yes | no |
| `SOC_ANALYST` | yes | yes | no | no | no | yes | no |
| `READ_ONLY` | yes | no | no | no | no | yes | no |

## Membership model (customer scope)

Modello: `tenant_data.CustomerMembership`

- chiave univoca: `(user, customer)`
- attributi: `scope`, `is_active`, `notes`
- scope:
  - `viewer`: `view`, `export`
  - `triage`: `view`, `triage`, `export`
  - `manager`: `view`, `triage`, `export`, `manage_sources`, `manage_customers`, `manage_users`

Regola effettiva: `capability(role)` AND `capability(scope customer)`  
Eccezione: `SUPER_ADMIN`/`admin` bypassano lo scope cliente.

## Endpoint policy (sintesi)

- `/api/auth/users/*`
  - CRUD: `manage_users`
  - lista scoped a utenti presenti su customer condivisi con il manager richiedente
  - manager non puo creare/assegnare ruoli manager/admin
- `/api/auth/users/assignable/`
  - `triage`, ritorna utenti assegnabili nello scope cliente
- `/api/auth/security-audit/`
  - `manage_users`
  - manager vede eventi di utenti nel proprio scope
- `/api/alerts/*`
  - lettura: `view`
  - azioni write: `triage`
  - export: `export`
  - filtro automatico su customer membership se `customer_id` assente
- `/api/ingestion/sources/*` + `/api/ingestion/parsers/*`
  - lettura/scrittura: `manage_sources`
  - enforcement scope cliente su fonte/parser
- `/api/alerts/audit-logs/`
  - lettura: `manage_customers`
  - scoped per customer membership
- `/api/core/dashboard/widgets/`
  - `view`
  - scoped su customer membership

## Audit sicurezza

Modello: `accounts.SecurityAuditEvent`

Campi: `actor`, `action`, `object_type`, `object_id`, `metadata`, `ip_address`, `user_agent`, `created_at`.

Operazioni tracciate:

- `user.created`
- `user.updated`
- `user.updated_partial`
- `user.deactivated`
