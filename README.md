# SocView (M3)

Monorepo SOC multi-tenant con:
- Backend: Django + DRF + SimpleJWT
- Multi-tenant: django-tenants (`public` + tenant schema)
- DB: PostgreSQL
- Async: Celery + Redis
- Frontend: React + TypeScript + Material UI (IT)
- Reverse proxy: Nginx

## Struttura

- `backend/` API Django + modelli tenant
- `frontend/` UI React
- `nginx/` reverse proxy
- `scripts/` helper bootstrap/migrate/seed
- `docker-compose.yml` stack locale

## Avvio

```bash
cp .env.example .env
docker compose up -d --build
```

URL:
- UI: [http://localhost](http://localhost)
- Tenant demo: [http://tenant1.localhost](http://tenant1.localhost)
- Swagger: [http://localhost/api/docs/](http://localhost/api/docs/)
- Health: [http://localhost/healthz](http://localhost/healthz)
- Readiness: [http://localhost/readyz](http://localhost/readyz)

## Migrazioni

Shared schema:

```bash
docker compose exec backend python manage.py migrate_schemas --shared --noinput
```

Tenant schema:

```bash
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

Seed crea/aggiorna:
- tenant demo: `tenant1.localhost`, `tenant2.localhost`
- utenti demo su `public` + tenant schema
- stati/tag/alert demo
- fonti ingestion demo (`imap`, `rest`, `webhook`)
- parser definition + parser revision demo per fonte

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
cd ..
```

## Ingestion e parsing (M2 + M3)

### Fonti ingestion

- `imap` (poll)
- `rest` pull (poll)
- `webhook` push

Endpoint principali ingestion:
- `GET/POST /api/ingestion/sources/`
- `GET/PATCH/DELETE /api/ingestion/sources/{id}/`
- `POST /api/ingestion/sources/{id}/test-connection/`
- `POST /api/ingestion/sources/{id}/run-now/`
- `GET /api/ingestion/runs/`
- `POST /api/ingestion/webhook/{source_id}/`
- `GET /api/ingestion/mock/rest-events/`

### Parser config-driven (stile pipeline)

Modelli:
- `ParserDefinition`
- `ParserRevision`

Pipeline step:
1. `extract` (jsonpath/regex/grok-like)
2. `transform` (rename/cast/concat/map_values)
3. `normalize` (mapping ECS-like)
4. `output` (`parsed_payload` + `field_schema`)

Versioning parser:
- ogni modifica config crea una nuova revisione
- rollback crea una nuova revisione derivata dalla revisione scelta

In ingestion:
- se parser configurato sulla fonte: ogni raw event passa dal parser
- su failure parser:
  - `parsed_payload = null`
  - `parse_error_detail` valorizzato
  - tag automatico `#unparsed`
  - alert comunque creato/visibile

### API parser

- `GET/POST /api/ingestion/parsers/`
- `GET/PATCH/DELETE /api/ingestion/parsers/{id}/`
- `POST /api/ingestion/parsers/preview-config/` (preview config non salvata)
- `POST /api/ingestion/parsers/{id}/preview/`
- `POST /api/ingestion/parsers/{id}/rollback/`

## Esempio parser config (JSON)

```json
{
  "extract": [
    { "type": "jsonpath", "name": "event_id", "path": "$.event_id" },
    { "type": "jsonpath", "name": "severity", "path": "$.severity" },
    { "type": "jsonpath", "name": "message", "path": "$.message" },
    { "type": "grok", "source": "message", "pattern": "user=%{WORD:user} ip=%{IPV4:ip}" }
  ],
  "transform": [
    { "type": "concat", "target": "summary", "fields": ["event_id", "user"], "separator": " :: " }
  ],
  "normalize": {
    "ecs": {
      "event.id": "event_id",
      "event.severity": "severity",
      "event.original": "message",
      "source.ip": "ip",
      "user.name": "user",
      "event.summary": "summary"
    }
  },
  "output": { "mode": "normalized" }
}
```

## Come usare preview endpoint

Preview config non ancora salvata:

```bash
curl -X POST "http://tenant1.localhost/api/ingestion/parsers/preview-config/" \
  -H "Authorization: Bearer <JWT_MANAGER_OR_SUPERADMIN>" \
  -H "Content-Type: application/json" \
  -d '{
    "config_text": "{ \"extract\": [{\"type\":\"jsonpath\",\"name\":\"event_id\",\"path\":\"$.event_id\"}], \"transform\": [], \"normalize\": {\"ecs\": {\"event.id\":\"event_id\"}}, \"output\": {\"mode\":\"normalized\"} }",
    "raw_payload": { "event_id": "preview-1" }
  }'
```

Preview parser già salvato:

```bash
curl -X POST "http://tenant1.localhost/api/ingestion/parsers/<PARSER_ID>/preview/" \
  -H "Authorization: Bearer <JWT_MANAGER_OR_SUPERADMIN>" \
  -H "Content-Type: application/json" \
  -d '{ "raw_payload": { "event_id": "preview-2", "severity": "high" } }'
```

Rollback revisione parser:

```bash
curl -X POST "http://tenant1.localhost/api/ingestion/parsers/<PARSER_ID>/rollback/" \
  -H "Authorization: Bearer <JWT_MANAGER_OR_SUPERADMIN>" \
  -H "Content-Type: application/json" \
  -d '{ "revision_id": <REVISION_ID> }'
```

## UI

Host tenant (`tenant1.localhost`):
- `/tenant` lista alert
- `/alerts/:id` dettaglio alert con switch Raw/Parsed + errore parsing
- `/fonti` gestione fonti ingestion
- `/parser` editor parser (config textarea, preview, revisioni, rollback)
- `/configurazione` gestione stati/tag

## RBAC

- SuperAdmin: tutto
- SOC Manager: gestione tenant completa (fonti/parser inclusi)
- SOC Analyst: operazioni alert; non può gestire parser/fonti
- ReadOnly: sola lettura

## Checklist accettazione M3

- Creo/modifico parser e vedo preview:
  - API: `POST /api/ingestion/parsers/`, `PATCH /api/ingestion/parsers/{id}/`, `POST /preview/`
  - UI: pagina `/parser`
- Rollback parser funziona:
  - API: `POST /api/ingestion/parsers/{id}/rollback/`
  - verifica nuova revisione attiva con versione incrementata
- Evento che rompe parser genera `#unparsed` e errore visibile:
  - API: alert con `parsed_payload=null` + `parse_error_detail` valorizzato
  - UI: `/alerts/:id` mostra errore parsing + payload parsed nullo

## Script helper

```bash
./scripts/bootstrap.sh
./scripts/migrate.sh
./scripts/seed.sh
```
