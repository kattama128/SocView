# SocView M0 Bootstrap

Bootstrap monorepo di SocView con:
- Backend `Django + DRF`
- Multi-tenant schema-based con `django-tenants`
- Auth locale JWT (`SimpleJWT`)
- Async `Celery + Redis`
- Frontend `React + TypeScript + Material UI` (lingua italiana)
- Reverse proxy `Nginx`

## Struttura

- `backend/` Django project + API
- `frontend/` React + TS
- `nginx/` reverse proxy config
- `scripts/` comandi helper bootstrap/migrate/seed
- `docker-compose.yml` stack locale completa

## Prerequisiti

- Docker + Docker Compose plugin
- Porte libere: `80`, `5432` (interna compose), `6379` (interna compose)

Nota tenant locali: i domini `tenant1.localhost` e `tenant2.localhost` funzionano in locale perché `*.localhost` punta a loopback.

## Configurazione ambiente

```bash
cp .env.example .env
```

Variabili principali (vedi `.env.example`):
- DB Postgres
- Redis broker/cache
- `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`

## Avvio rapido

```bash
docker compose up -d --build
docker compose exec backend python manage.py seed_demo
```

Apri:
- UI: <http://localhost>
- Swagger: <http://localhost/api/docs/>
- Health: <http://localhost/healthz>
- Readiness: <http://localhost/readyz>

## Migrazioni

Creazione migrazioni:

```bash
docker compose exec backend python manage.py makemigrations
```

Applicazione migrazioni schema `public`:

```bash
docker compose exec backend python manage.py migrate_schemas --shared --noinput
```

## Seed demo

```bash
docker compose exec backend python manage.py seed_demo
```

Il comando crea/aggiorna:
- tenant `tenant1` con dominio `tenant1.localhost`
- tenant `tenant2` con dominio `tenant2.localhost`
- utenti demo con ruoli:
  - `admin` -> `SUPER_ADMIN`
  - `manager` -> `SOC_MANAGER`
  - `analyst` -> `SOC_ANALYST`

## Credenziali demo

- SuperAdmin: `admin` / `Admin123!`
- SOC Manager: `manager` / `Manager123!`
- SOC Analyst: `analyst` / `Analyst123!`

## Script helper

```bash
./scripts/bootstrap.sh
./scripts/migrate.sh
./scripts/seed.sh
```

## Endpoints principali

- `POST /api/auth/token/` login JWT
- `POST /api/auth/token/refresh/` refresh JWT
- `GET /api/auth/me/` utente corrente autenticato
- `GET /api/tenancy/tenant-context/` contesto tenant corrente
- `GET /api/docs/` Swagger UI
- `GET /healthz` health check
- `GET /readyz` readiness check (DB + cache)

## Servizi Docker

- `postgres`
- `redis`
- `backend`
- `celery_worker`
- `celery_beat`
- `frontend`
- `nginx`

## Verifica minima manuale

1. Avvio stack:

```bash
docker compose up -d --build
```

2. Seed:

```bash
docker compose exec backend python manage.py seed_demo
```

3. Health:

```bash
curl -i http://localhost/healthz
curl -i http://localhost/readyz
```

4. Login API:

```bash
curl -X POST http://localhost/api/auth/token/ \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"Admin123!"}'
```

5. UI protetta:
- vai su <http://localhost>
- login con utente demo
- verifica redirect a dashboard e accesso route `/tenant`

## Note implementative M0

- `django-tenants` configurato con schema `public` + tenant schema dedicati.
- Modello `accounts.User` esteso con enum ruoli: `SUPER_ADMIN`, `SOC_MANAGER`, `SOC_ANALYST`, `READ_ONLY`.
- OpenAPI generata con `drf-spectacular`.
