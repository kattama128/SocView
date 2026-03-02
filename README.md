# SocView (M2)

Monorepo SOC multi-tenant con stack:
- Backend: Django + DRF + SimpleJWT
- Multi-tenant: django-tenants (schema `public` + schema tenant)
- DB: PostgreSQL
- Async: Celery + Redis
- Frontend: React + TypeScript + Material UI (IT)
- Reverse proxy: Nginx

## Struttura repo

- `backend/` API Django, modelli tenant/public, ingestion engine
- `frontend/` UI React TypeScript
- `nginx/` reverse proxy
- `scripts/` helper bootstrap/migrate/seed
- `docker-compose.yml` stack locale

## Avvio rapido

```bash
cp .env.example .env
docker compose up -d --build
```

URL principali:
- UI public: [http://localhost](http://localhost)
- UI tenant demo: [http://tenant1.localhost](http://tenant1.localhost)
- Swagger/OpenAPI: [http://localhost/api/docs/](http://localhost/api/docs/)
- Health: [http://localhost/healthz](http://localhost/healthz)
- Readiness: [http://localhost/readyz](http://localhost/readyz)

## Migrazioni

Shared schema (`public`):

```bash
docker compose exec backend python manage.py migrate_schemas --shared --noinput
```

Tenant schema:

```bash
docker compose exec backend python manage.py migrate_schemas --tenant --noinput
```

Check migrazioni pendenti:

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
- utenti demo in `public` + tenant schema
- stati/tag/alert demo
- fonti ingestion demo: IMAP, REST pull, Webhook push

## Credenziali demo

- SuperAdmin: `admin` / `Admin123!`
- SOC Manager: `manager` / `Manager123!`
- SOC Analyst: `analyst` / `Analyst123!`
- ReadOnly: `readonly` / `ReadOnly123!`

## Test e build

Backend test:

```bash
docker compose exec backend python manage.py test
```

Frontend build:

```bash
cd frontend
npm run build
```

## Ingestion engine (M2)

### Tipi fonte supportati

- IMAP (`poll`)
- REST API pull (`poll`)
- Webhook (`push`)

### Modelli M2

- `Source`
- `SourceConfig`
- `DedupPolicy`
- `IngestionRun`
- `IngestionEventLog`

### API ingestion

- `GET/POST /api/ingestion/sources/`
- `GET/PATCH/DELETE /api/ingestion/sources/{id}/`
- `POST /api/ingestion/sources/{id}/test-connection/`
- `POST /api/ingestion/sources/{id}/run-now/`
- `GET /api/ingestion/runs/`
- `POST /api/ingestion/webhook/{source_id}/`
- `GET /api/ingestion/mock/rest-events/` (mock feed locale)

### Comportamento pipeline

- salva sempre `raw_payload`
- parsing placeholder con gestione errori
- se parsing fallisce: alert creato/aggiornato + tag automatico `#unparsed`
- dedup per fingerprint configurabile (`DedupPolicy`)
- strategy MVP: incremento `AlertOccurrence.count`
- aggiorna `last_success`, `last_error`, `status`, `health_details`

### Esempio config JSON IMAP

```json
{
  "use_mock": true,
  "mock_messages": [
    {
      "event_id": "imap-demo-1",
      "subject": "IMAP suspicious login",
      "severity": "high",
      "date": "2026-01-10T10:30:00Z",
      "body": "Tentativo di accesso sospetto."
    },
    {
      "event_id": "imap-demo-2",
      "subject": "IMAP parser failure demo",
      "severity": "medium",
      "force_parse_error": true,
      "parse_error_message": "Errore parser simulato da IMAP mock"
    }
  ]
}
```

### Esempio config JSON REST

```json
{
  "url": "http://backend:8000/api/ingestion/mock/rest-events/",
  "method": "GET",
  "headers": {
    "Host": "tenant1.localhost"
  },
  "pagination": {
    "type": "none"
  }
}
```

Nota: per i tenant demo, il seed imposta automaticamente l'header `Host` coerente con il tenant (`tenant1.localhost`, `tenant2.localhost`).

### Esempio webhook curl

```bash
curl -X POST "http://tenant1.localhost/api/ingestion/webhook/<SOURCE_ID>/" \
  -H "X-API-Key: <WEBHOOK_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"event_id":"wh-demo-1","title":"Webhook test","severity":"high","message":"Demo webhook"}'
```

## UI (M2)

Su host tenant (es. `tenant1.localhost`):
- `/tenant`: tabella alert + filtri base
- `/alerts/:id`: dettaglio alert (stato/tag/assegnazione/note/allegati/audit)
- `/configurazione`: gestione stati/tag
- `/fonti`: gestione fonti ingestion + test connessione + run-now + log run + esempio webhook curl

## RBAC

- SuperAdmin: tutto
- SOC Manager: gestione completa tenant (inclusa configurazione fonti ingestion)
- SOC Analyst: CRUD alert e operazioni operative; non può creare/modificare fonti ingestion
- ReadOnly: sola lettura

## Checklist M2 (accettazione)

- `docker compose up -d --build` avvia tutti i servizi
  - verifica: `docker compose ps`
- login locale JWT funzionante
  - verifica: `POST /api/auth/token/`
- health/readiness 200
  - verifica: `GET /healthz`, `GET /readyz`
- swagger accessibile
  - verifica: `GET /api/docs/`
- seed crea tenant/utenti/fonti demo
  - verifica: `python manage.py seed_demo` + `GET /api/ingestion/sources/`
- almeno una fonte per tipo genera alert reali
  - verifica:
    - IMAP/REST: `POST /api/ingestion/sources/{id}/run-now/`
    - Webhook: `POST /api/ingestion/webhook/{source_id}/`
- dedup incrementa `occurrence`
  - verifica: dettaglio alert `GET /api/alerts/alerts/{id}/` (`occurrence.count`)
- parsing failure crea alert visibile con tag `#unparsed`
  - verifica: alert `rest-demo-2` / `imap-demo-2` in UI/API
- `last_success` / `last_error` / log ingestion visibili
  - verifica: `GET /api/ingestion/sources/` e `GET /api/ingestion/runs/`

## Script helper

```bash
./scripts/bootstrap.sh
./scripts/migrate.sh
./scripts/seed.sh
```
