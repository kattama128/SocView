# SocView (M4)

Monorepo SOC multi-tenant con:
- Backend: Django + DRF + SimpleJWT
- Multi-tenant: django-tenants (`public` + tenant schema)
- DB: PostgreSQL
- Async: Celery + Redis
- Ricerca: Full-text + filtri dinamici (Elastic opzionale, fallback Postgres)
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

Con Elastic abilitato (profilo opzionale):

```bash
docker compose --profile elastic up -d --build
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
- saved searches demo per `manager` e `analyst`

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

Check migrazioni:

```bash
docker compose exec backend python manage.py migrate_schemas --shared --check
docker compose exec backend python manage.py migrate_schemas --tenant --check
```

## Search M4 (full-text + dynamic filters + saved searches)

### Abilitare/disabilitare Elastic

Abilitare Elastic (profilo compose):

```bash
docker compose --profile elastic up -d elasticsearch
```

Disabilitare Elastic:

```bash
docker compose stop elasticsearch
```

Parametri `.env`:

```env
SEARCH_BACKEND=auto
ELASTICSEARCH_URL=http://elasticsearch:9200
ELASTICSEARCH_INDEX_PREFIX=socview-alerts
SEARCH_INDEX_SYNC_ENABLED=true
SEARCH_INDEX_SYNC_ASYNC=true
```

- `SEARCH_BACKEND=auto`: usa Elastic se raggiungibile, altrimenti fallback Postgres.
- `SEARCH_BACKEND=postgres`: forza fallback Postgres.
- `SEARCH_BACKEND=elastic`: forza Elastic.

### Endpoint M4

- `POST /api/alerts/search/`
- `GET /api/alerts/field-schemas/`
- `GET /api/alerts/field-schemas/?source_name=<SOURCE_NAME>`
- `GET/POST/PATCH/DELETE /api/alerts/saved-searches/`

### Esempi query search API

Ricerca full-text base:

```bash
curl -X POST "http://tenant1.localhost/api/alerts/search/" \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "vpn",
    "page": 1,
    "page_size": 20
  }'
```

Ricerca con filtri dinamici per fonte:

```bash
curl -X POST "http://tenant1.localhost/api/alerts/search/" \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "source_name": "REST Demo Feed",
    "dynamic_filters": [
      { "field": "event.id", "type": "keyword", "operator": "contains", "value": "rest-demo" },
      { "field": "event.severity", "type": "keyword", "operator": "eq", "value": "high" }
    ],
    "ordering": "-event_timestamp",
    "page": 1,
    "page_size": 50
  }'
```

Salvare una ricerca utente:

```bash
curl -X POST "http://tenant1.localhost/api/alerts/saved-searches/" \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Alert aperti critici",
    "text_query": "vpn",
    "source_name": "vpn-gateway",
    "state_id": null,
    "severity": "high",
    "is_active": true,
    "dynamic_filters": [],
    "ordering": "-event_timestamp",
    "visible_columns": ["title", "severity", "state", "event_timestamp"]
  }'
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
- `/tenant` ricerca full-text + filtri dinamici per fonte + saved searches
- `/alerts/:id` dettaglio alert con switch Raw/Parsed + errore parsing
- `/fonti` gestione fonti ingestion
- `/parser` editor parser (config textarea, preview, revisioni, rollback)
- `/configurazione` gestione stati/tag

## RBAC

- SuperAdmin: tutto
- SOC Manager: gestione tenant completa (fonti/parser inclusi)
- SOC Analyst: operazioni alert; non può gestire parser/fonti
- ReadOnly: sola lettura

## Checklist accettazione M4

- Full-text su raw/parsed funziona:
  - API: `POST /api/alerts/search/` con `text`
  - UI: `/tenant` campo "Ricerca testo"
- Filtri dinamici per fonte funzionano:
  - API: `GET /api/alerts/field-schemas/?source_name=<source>`
  - UI: `/tenant` sezione "Filtri dinamici"
- Saved searches persistono per utente:
  - API: CRUD `saved-searches`
  - UI: `/tenant` sezione "Saved Searches"
- Elastic on/off senza rotture:
  - con `elasticsearch` up: response `backend=elastic`
  - con `elasticsearch` stopped: response `backend=postgres`

## Script helper

```bash
./scripts/bootstrap.sh
./scripts/migrate.sh
./scripts/seed.sh
```
