# SocView (M5)

Piattaforma SOC multi-tenant demo end-to-end.

## Stack

- Backend: Django + DRF + SimpleJWT
- Multi-tenant: `django-tenants` (`public` + schema tenant)
- Database: PostgreSQL
- Async: Celery + Redis
- Frontend: React + TypeScript + Material UI (IT)
- Reverse proxy: Nginx
- Ricerca: Elastic opzionale (`--profile elastic`) con fallback Postgres

## Struttura repo

- `backend/` API Django, modelli, ingestion, parser, ricerca, audit
- `frontend/` UI React (dashboard, tenant, dettaglio alert, fonti, parser)
- `nginx/` reverse proxy + TLS dev self-signed
- `scripts/` bootstrap/migrate/seed
- `docker-compose.yml` stack locale

## Avvio rapido

```bash
cp .env.example .env
docker compose up -d --build
```

Abilitare Elastic:

```bash
docker compose --profile elastic up -d --build
```

## URL principali

- UI HTTP: [http://localhost](http://localhost)
- UI HTTPS (self-signed): [https://localhost](https://localhost)
- Tenant demo: [http://tenant1.localhost](http://tenant1.localhost), [http://tenant2.localhost](http://tenant2.localhost), [http://tenant3.localhost](http://tenant3.localhost)
- Swagger: [http://localhost/api/docs/](http://localhost/api/docs/)
- Health: [http://localhost/healthz](http://localhost/healthz)
- Ready: [http://localhost/readyz](http://localhost/readyz)

Nota importante:
- `localhost` e `https://localhost` sono dominio `public`.
- Le funzioni SOC tenant (`/api/alerts/*`, `/api/ingestion/*`, notifiche) sono disponibili solo su domini tenant (`tenant1.localhost`, `tenant2.localhost`, `tenant3.localhost`).
- Dalla dashboard Home su `public` trovi tutti i tenant con pulsante `Apri`: il passaggio al dominio tenant mantiene automaticamente la sessione utente.
- In sviluppo il pulsante `Apri` usa `http://tenantX.localhost` per evitare problemi di certificato self-signed sui subdomini tenant.

## Migrazioni

```bash
docker compose exec backend python manage.py migrate_schemas --shared --noinput
docker compose exec backend python manage.py migrate_schemas --tenant --noinput
```

Check migrazioni:

```bash
docker compose exec backend python manage.py migrate_schemas --shared --check
docker compose exec backend python manage.py migrate_schemas --tenant --check
```

## Seed demo

```bash
docker compose exec backend python manage.py seed_demo
```

Il seed crea/aggiorna:

- tenant demo `tenant1`, `tenant2`, `tenant3`
- utenti demo (`admin`, `manager`, `analyst`, `readonly`)
- dashboard preference per utente (layout widget + tenant ordering)
- stati/tag/alert demo
- fonti ingestion demo IMAP/REST/Webhook
- parser definition/revision demo
- saved searches demo

## Credenziali demo

- SuperAdmin: `admin` / `Admin123!`
- SOC Manager: `manager` / `Manager123!`
- SOC Analyst: `analyst` / `Analyst123!`
- ReadOnly: `readonly` / `ReadOnly123!`

## RBAC enterprise (nuovo)

- Permessi granulari: `view`, `triage`, `manage_sources`, `manage_customers`, `manage_users`, `export`, `admin`.
- Scope per cliente via membership `tenant_data.CustomerMembership` (`viewer`, `triage`, `manager`).
- Enforcement applicato agli endpoint dati (`/api/alerts/*`, `/api/ingestion/*`, `/api/core/dashboard/widgets/`).
- Operazioni sensibili utenti/membership tracciate in `accounts.SecurityAuditEvent`.

Matrice completa ruoli/permessi:

- [`docs/rbac-permission-matrix.md`](docs/rbac-permission-matrix.md)

## Comandi run/test/export demo

Run stack:

```bash
docker compose up -d --build
```

Test backend:

```bash
docker compose exec backend python manage.py test
```

Build frontend:

```bash
docker compose exec frontend npm run build
```

Quality gates frontend (host):

```bash
cd frontend
npm ci
npm run lint
npm run test
npm run build
```

Smoke UI reale (Playwright):

```bash
cd frontend
npx playwright install chromium
npm run qa:session
npm run qa:dashboard
```

Disk cleanup sicuro (preserva i dati DB/media in uso):

```bash
# artefatti rigenerabili frontend
rm -rf frontend/node_modules frontend/dist

# cache browser Playwright (rigenerabile con `npx playwright install chromium`)
rm -rf "$HOME/Library/Caches/ms-playwright"

# cache build Docker non usata
docker builder prune -af

# eventuali immagini dangling
docker image prune -f

# ricostruzione rapida stack
docker compose up -d --build
```

Hard reset locale (DISTRUTTIVO: elimina anche i volumi dati):

```bash
docker compose down -v --remove-orphans
docker compose up -d --build
```

Export CSV demo (lista filtrata + colonne configurabili):

```bash
TOKEN=$(curl -s -H "Host: tenant1.localhost" -H "Content-Type: application/json" \
  -d '{"username":"manager","password":"Manager123!"}' \
  http://localhost/api/auth/token/ | python3 -c 'import json,sys; print(json.load(sys.stdin)["access"])')

curl -s -H "Host: tenant1.localhost" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"vpn","columns":["id","title","severity","source_name","dyn:event.id"],"all_results":true}' \
  http://localhost/api/alerts/alerts/export-configurable/ \
  -o alerts-export.csv
```

## Hardening (M5)

### TLS Nginx

- Certificato dev self-signed incluso:
  - `nginx/certs/dev.crt`
  - `nginx/certs/dev.key`
- Nginx espone:
  - `80` (HTTP)
  - `443` (HTTPS)

Per certificati reali (production-ish):

1. Sostituire `nginx/certs/dev.crt` e `nginx/certs/dev.key` con i certificati reali.
2. Aggiornare `nginx/nginx.conf` se necessario (catena/intermediate).
3. Abilitare in `.env`:
   - `SECURE_SSL_REDIRECT=true`
   - `SESSION_COOKIE_SECURE=true`
   - `CSRF_COOKIE_SECURE=true`
   - `SECURE_HSTS_SECONDS=31536000`

### Rate limiting

- DRF throttling configurabile da `.env`:
  - `DRF_THROTTLE_AUTH` (auth)
  - `DRF_THROTTLE_WEBHOOK` (webhook)
  - `DRF_THROTTLE_ANON`
- Nginx ha `limit_req` su:
  - `/api/auth/token/`, `/api/auth/token/refresh/`
  - `/api/ingestion/webhook/*`

### CORS e security headers

Config da `.env`:

- `CORS_ALLOW_ALL_ORIGINS`
- `CORS_ALLOWED_ORIGINS`
- `CSRF_TRUSTED_ORIGINS`
- `SECURE_REFERRER_POLICY`
- `X_FRAME_OPTIONS`

Header di sicurezza base applicati in Nginx (`nosniff`, `x-frame-options`, `referrer-policy`, `xss-protection`).  
Nota dev: HSTS non e forzato per evitare blocchi dei subdomini tenant con cert self-signed.

### Upload allegati sicuro

- Limite upload allegati: `MAX_ATTACHMENT_SIZE_MB`
- Validazioni upload:
  - MIME type consentiti/bloccati (`ATTACHMENT_ALLOWED_MIME_TYPES`, `ATTACHMENT_BLOCKED_MIME_TYPES`)
  - estensioni consentite/bloccate (`ATTACHMENT_ALLOWED_EXTENSIONS`, `ATTACHMENT_BLOCKED_EXTENSIONS`)
  - blocco pattern contenuto rischioso e signature EICAR test
- Scanning:
  - backend reale AV via ClamAV adapter (`ATTACHMENT_SCAN_BACKEND=clamav`, `CLAMAV_*`)
  - placeholder consentito solo in dev con feature flag (`ENABLE_DEV_ATTACHMENT_SCANNER=true`)
  - comportamento su scanner non disponibile configurabile (`BLOCK_UNSCANNED_ATTACHMENTS`)
- Download allegati solo via endpoint autenticato/autorizzato:
  - `GET /api/alerts/attachments/{id}/download/`
- Hardening Nginx:
  - accesso diretto `/media/attachments/*` negato (403)
- Audit upload/download:
  - audit operativo `AuditLog` + security audit `SecurityAuditEvent`

### Audit retention

- Policy configurabile: `AUDIT_RETENTION_DAYS`
- Job periodico Celery Beat: `cleanup_audit_logs_task`

### Logging strutturato

- Logging JSON lato backend (`core.logging_utils.JsonLogFormatter`)
- Livello log configurabile: `LOG_LEVEL`

## Backup Postgres (production-ish)

Dump:

```bash
docker compose exec postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup_socview.sql
```

Restore:

```bash
cat backup_socview.sql | docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'
```

## Endpoint principali

Sistema:

- `GET /healthz`
- `GET /readyz`
- `GET /api/docs/`
- `GET /api/schema/`

Auth/Core:

- `POST /api/auth/token/`
- `POST /api/auth/token/refresh/`
- `GET /api/auth/me/`
- `GET /api/auth/users/`
- `GET /api/auth/users/assignable/`
- `GET /api/auth/security-audit/`
- `GET/PUT /api/core/dashboard/widgets/`
- `GET /api/core/dashboard/tenants/`
- `POST /api/core/dashboard/tenants/reorder/`

Alert workflow:

- `GET/POST/PATCH/DELETE /api/alerts/alerts/`
- `POST /api/alerts/alerts/{id}/change-state/`
- `POST /api/alerts/alerts/{id}/add-tag/`
- `POST /api/alerts/alerts/{id}/remove-tag/`
- `POST /api/alerts/alerts/{id}/assign/`
- `GET/POST /api/alerts/alerts/{id}/comments/`
- `GET/POST /api/alerts/alerts/{id}/attachments/`
- `GET /api/alerts/attachments/{id}/download/`
- `GET /api/alerts/alerts/{id}/timeline/`
- `POST /api/alerts/alerts/export-configurable/`

Config tenant:

- `GET/POST/PATCH/DELETE /api/alerts/customers/`
- `GET/PATCH /api/alerts/customers/{id}/settings/`
- `GET/POST/PATCH/DELETE /api/alerts/states/`
- `POST /api/alerts/states/reorder/`
- `GET/POST/PATCH/DELETE /api/alerts/tags/`
- `GET /api/alerts/audit-logs/`

Customer settings notes:
- Le fonti sono globali (`/api/ingestion/sources/`, scope globale).
- In `/api/alerts/customers/{id}/settings/` il cliente puo solo abilitare/disabilitare fonti globali (`source_overrides`), senza modificare la configurazione globale della fonte.

Ricerca:

- `POST /api/alerts/search/`
- `GET /api/alerts/field-schemas/`
- `GET/POST/PATCH/DELETE /api/alerts/saved-searches/`

Notifiche:

- `GET /api/alerts/notifications/`
- `POST /api/alerts/notifications/{id}/ack/`
- `POST /api/alerts/notifications/ack-all/`

Ingestion + parser:

- `GET/POST /api/ingestion/sources/`
- `GET /api/ingestion/sources/capabilities/`
- `POST /api/ingestion/sources/create-from-preset/`
- `POST /api/ingestion/sources/{id}/test-connection/`
- `POST /api/ingestion/sources/{id}/run-now/`
- `GET /api/ingestion/runs/`
- `POST /api/ingestion/webhook/{source_id}/`
- `GET/POST/PATCH/DELETE /api/ingestion/parsers/`
- `POST /api/ingestion/parsers/preview-config/`
- `POST /api/ingestion/parsers/{id}/preview/`
- `POST /api/ingestion/parsers/{id}/rollback/`

Capability matrix ufficiale + preset vendor:

- [`docs/source-capability-matrix.md`](docs/source-capability-matrix.md)

## Multi-cliente operativo (business)

All interno dello stesso schema tenant e disponibile il modello `Customer` business.

- Le principali API dati supportano filtro `customer_id` (query param o payload, dove applicabile).
- Migrazione e backfill: vedi [docs/migration-notes-multicliente.md](docs/migration-notes-multicliente.md).

Comando backfill idempotente:

```bash
docker compose exec backend python manage.py backfill_customers
```

## Checklist accettazione M5 (con dove verificare)

- Dashboard configurabile e persistenza layout per utente:
  - UI: `Home` (`/`) widget toggle/reorder + refresh pagina
  - API: `GET/PUT /api/core/dashboard/widgets/`
- Tenant ordering manuale persistito:
  - UI: `Home` drag&drop tenant list
  - API: `POST /api/core/dashboard/tenants/reorder/`
- Notifiche critiche + notification center:
  - UI: icona campanella top-right, drawer notifiche, popup su alert critico
  - API: `GET /api/alerts/notifications/`, `POST .../ack/`, `POST .../ack-all/`
- Alert detail quick actions + timeline:
  - UI: `/alerts/:id` sezione Quick Actions, timeline eventi
  - API: change-state/tag/assign/comment/upload + `GET /api/alerts/alerts/{id}/timeline/`
- Export CSV configurabile con filtri:
  - UI: pagina `/tenant`, builder colonne export + bottone `Esporta CSV`
  - API: `POST /api/alerts/alerts/export-configurable/`
- Hardening base:
  - API/Nginx: TLS 443, rate limit auth/webhook, security headers, CORS configurabile
  - Backend: limiti upload + scan placeholder + retention audit
- Test minimi:
  - `docker compose exec backend python manage.py test`
  - suite include parser unit, webhook+dedup integration, smoke API principali
