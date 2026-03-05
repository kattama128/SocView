# SocView

Piattaforma SOC multi-tenant (Django + DRF + React + TypeScript + MUI).

## Stack

- Backend: Django + DRF + SimpleJWT
- Multi-tenant: `django-tenants` (`public` + schemi tenant)
- Database: PostgreSQL
- Async: Celery + Redis
- Frontend: React + TypeScript + Material UI
- Reverse proxy: Nginx

## Struttura repo

- `backend/` API Django, modelli, ingestion, parser, ricerca, audit
- `frontend/` UI React
- `nginx/` reverse proxy
- `scripts/` bootstrap e migrazioni
- `docker-compose.yml` stack locale

## Avvio rapido

```bash
cp .env.example .env
docker compose up -d --build
docker compose exec backend python manage.py migrate_schemas --shared --noinput
docker compose exec backend python manage.py migrate_schemas --tenant --noinput
```

In alternativa:

```bash
./start.sh
```

## Routing tenant

- Default: `TENANT_ROUTING_MODE=subdomain`
- Alternativa dev path-based:
  - backend `.env`: `TENANT_ROUTING_MODE=path`
  - frontend env: `VITE_TENANT_ROUTING_MODE=path`

## URL principali

- UI: [http://localhost](http://localhost)
- Swagger: [http://localhost/api/docs/](http://localhost/api/docs/)
- Health: [http://localhost/healthz](http://localhost/healthz)
- Ready: [http://localhost/readyz](http://localhost/readyz)

## Migrazioni

```bash
docker compose exec backend python manage.py migrate_schemas --shared --noinput
docker compose exec backend python manage.py migrate_schemas --tenant --noinput
```

## Test

```bash
docker compose exec backend python manage.py test
cd frontend && npm ci && npm run lint && npm run test && npm run build
```

## Documentazione

- Hardening: [`docs/hardening.md`](docs/hardening.md)
- Operazioni e backup Postgres: [`docs/ops.md`](docs/ops.md)
- Changelog: [`docs/changelog.md`](docs/changelog.md)
