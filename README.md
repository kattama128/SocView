# SocView (M1)

Monorepo SocView con stack:
- Backend: Django + DRF + SimpleJWT
- Multi-tenant: django-tenants (schema `public` + tenant schema)
- DB: PostgreSQL
- Async: Celery + Redis
- Frontend: React + TypeScript + Material UI (IT)
- Reverse proxy: Nginx

## Struttura

- `backend/` API Django + modelli tenant
- `frontend/` UI React
- `nginx/` configurazione reverse proxy
- `scripts/` script bootstrap/migrate/seed
- `docker-compose.yml` stack locale

## Setup rapido

```bash
cp .env.example .env
docker compose up -d --build
```

URL principali:
- UI public: [http://localhost](http://localhost)
- UI tenant demo: [http://tenant1.localhost](http://tenant1.localhost)
- Swagger: [http://localhost/api/docs/](http://localhost/api/docs/)
- Health: [http://localhost/healthz](http://localhost/healthz)
- Readiness: [http://localhost/readyz](http://localhost/readyz)

## Migrazioni

Shared schema (`public`):

```bash
docker compose exec backend python manage.py migrate_schemas --shared --noinput
```

Tenant schemas:

```bash
docker compose exec backend python manage.py migrate_schemas --tenant --noinput
```

Verifica migrazioni pendenti:

```bash
docker compose exec backend python manage.py migrate_schemas --shared --check
docker compose exec backend python manage.py migrate_schemas --tenant --check
```

## Seed demo

```bash
docker compose exec backend python manage.py seed_demo
```

Crea/aggiorna:
- tenant demo: `tenant1.localhost`, `tenant2.localhost`
- stati default: `Nuovo`, `In lavorazione`, `Risolto`, `Falso positivo`
- tag demo
- alert demo con assegnazioni/note
- utenti demo in `public` + tenant schema

## Credenziali demo

- SuperAdmin: `admin` / `Admin123!`
- SOC Manager: `manager` / `Manager123!`
- SOC Analyst: `analyst` / `Analyst123!`
- ReadOnly: `readonly` / `ReadOnly123!`

## Test

```bash
docker compose exec backend python manage.py test
```

## API M1 (core)

- `GET/POST /api/alerts/alerts/` CRUD alert
- `GET/PATCH/DELETE /api/alerts/alerts/{id}/` dettaglio alert
- `POST /api/alerts/alerts/{id}/change-state/`
- `POST /api/alerts/alerts/{id}/add-tag/`
- `POST /api/alerts/alerts/{id}/remove-tag/`
- `POST /api/alerts/alerts/{id}/assign/`
- `GET/POST /api/alerts/alerts/{id}/comments/`
- `GET/POST /api/alerts/alerts/{id}/attachments/`
- `GET /api/alerts/alerts/{id}/audit/`
- `GET /api/alerts/alerts/export/` export CSV

Configurazione tenant:
- `GET/POST /api/alerts/states/`
- `PATCH/DELETE /api/alerts/states/{id}/`
- `POST /api/alerts/states/reorder/`
- `GET/POST /api/alerts/tags/`
- `PATCH/DELETE /api/alerts/tags/{id}/`

Audit:
- `GET /api/alerts/audit-logs/?alert_id=<id>&action=<action>`

Auth supporto UI:
- `GET /api/auth/users/`

## UI M1

Su host tenant (es: `tenant1.localhost`):
- `/tenant` lista alert + filtri base (state/severity/text)
- `/alerts/:id` dettaglio alert con stato, tag, assegnazione, note, allegati, audit
- `/configurazione` gestione stati/tag (RBAC)

## RBAC (M1)

- SuperAdmin: tutto
- SOC Manager: gestione completa tenant (alert + config stati/tag)
- SOC Analyst: CRUD alert + cambio stato + tagging + note/allegati + export
- ReadOnly: sola lettura (nessuna write API)

## Audit obbligatorio implementato

Generato su:
- edit alert
- cambio stato
- add/remove tag
- assegnazione
- aggiunta note
- upload allegati
- edit configurazioni stati/tag (create/update/delete/reorder)

## Script helper

```bash
./scripts/bootstrap.sh
./scripts/migrate.sh
./scripts/seed.sh
```
