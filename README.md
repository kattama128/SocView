# SocView

Piattaforma SOC multi-tenant per gestione alert, ingestion e workflow operativi.

## Panoramica

SocView è composto da:

- `backend` Django/DRF multi-tenant (`django-tenants`)
- `frontend` React + TypeScript + MUI
- `postgres` per dati applicativi
- `redis` per code/task asincroni
- `celery worker` e `celery beat`
- `nginx` come reverse proxy unico (porta 80/443)

Il repository è intenzionalmente **pulito**: non include seed di clienti, fonti o alert fittizi.

## Requisiti

- Docker Desktop (o Docker Engine + Compose plugin)
- `docker compose` disponibile da terminale
- Porte locali libere: `80`, `443`

Verifica rapida:

```bash
docker --version
docker compose version
```

## Struttura Repository

- `backend/` API, modelli, task Celery, auth, tenancy
- `frontend/` applicazione UI
- `nginx/` configurazione proxy/TLS dev
- `scripts/` utility operative (`bootstrap.sh`, `migrate.sh`)
- `docs/` hardening, ops, changelog, RBAC
- `docker-compose.yml` stack locale completo

## Avvio Rapido (consigliato)

### Opzione 1: bottone di avvio

```bash
chmod +x ./start.sh
./start.sh
```

`start.sh` esegue in sequenza:

1. controllo prerequisiti Docker
2. creazione `.env` da `.env.example` (se assente)
3. `docker compose up -d --build`
4. attesa health backend (`/healthz`)
5. migrazioni shared + tenant
6. verifica readiness (`/readyz`)

### Opzione 2: avvio manuale

```bash
cp .env.example .env
docker compose up -d --build
docker compose exec backend python manage.py migrate_schemas --shared --noinput
docker compose exec backend python manage.py migrate_schemas --tenant --noinput
```

## URL Principali

- App: [http://localhost](http://localhost)
- API Docs (Swagger): [http://localhost/api/docs/](http://localhost/api/docs/)
- Health: [http://localhost/healthz](http://localhost/healthz)
- Ready: [http://localhost/readyz](http://localhost/readyz)

## Configurazione Tenant

SocView supporta due modalità di routing tenant.

- `subdomain` (default)
- `path` (utile in sviluppo locale)

Variabili principali:

- backend `.env`: `TENANT_ROUTING_MODE=subdomain|path`
- frontend `.env`: `VITE_TENANT_ROUTING_MODE=subdomain|path`

## Primo Provisioning (senza demo data)

Dopo il primo avvio devi creare tenant/domain reali e gli utenti necessari.

Esempio minimo (shell Django):

```bash
docker compose exec backend python manage.py shell
```

```python
from customers.models import Client, Domain

tenant = Client.objects.create(schema_name="acme", name="ACME SOC")
Domain.objects.create(domain="acme.localhost", tenant=tenant, is_primary=True)
```

Poi crea gli utenti via API/Auth UI o comandi Django in base al tuo flusso operativo.

## Comandi Operativi Utili

### Migrazioni

```bash
./scripts/migrate.sh
```

### Log servizi

```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f nginx
docker compose logs -f celery_worker
```

### Stop stack

```bash
docker compose down
```

### Reset completo locale (distruttivo)

```bash
docker compose down -v --remove-orphans
docker compose up -d --build
```

## Qualità e Test

### Backend

```bash
docker compose exec backend python manage.py test --noinput
```

### Frontend

```bash
cd frontend
npm ci
npm run lint
npm run test
npm run build
```

## Variabili Ambiente (selezione)

Usa `.env.example` come base.

Sezioni principali:

- Django (`DEBUG`, `SECRET_KEY`, `ALLOWED_HOSTS`)
- Database (`POSTGRES_*`)
- Redis/Celery (`REDIS_URL`, `CELERY_*`)
- JWT cookie-based auth (`AUTH_*`)
- Sicurezza (`CSRF_*`, `SESSION_*`, `SECURE_*`)
- Routing tenant (`TENANT_ROUTING_MODE`, `VITE_TENANT_ROUTING_MODE`)

## Troubleshooting

### `Cannot connect to the Docker daemon`

Avvia Docker Desktop e riprova.

### `readyz` non torna `200`

Controlla stato container e log:

```bash
docker compose ps
docker compose logs --tail=200 backend
```

### UI raggiungibile ma login/API falliscono

Verifica:

- host usato (`localhost` vs dominio tenant)
- cookie/CORS/CSRF in `.env`
- eventuale mismatch tra modalità tenant backend/frontend

## Sicurezza

- Non committare `.env` reali o segreti di produzione
- Non riutilizzare credenziali di sviluppo in ambienti pubblici
- Consulta [docs/hardening.md](docs/hardening.md)

## Documentazione Collegata

- [docs/ops.md](docs/ops.md)
- [docs/hardening.md](docs/hardening.md)
- [docs/rbac-permission-matrix.md](docs/rbac-permission-matrix.md)
- [docs/changelog.md](docs/changelog.md)
- [docs/source-capability-matrix.md](docs/source-capability-matrix.md)

