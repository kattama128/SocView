# Operazioni

## Backup Postgres (production-ish)

Dump:

```bash
docker compose exec postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup_socview.sql
```

Restore:

```bash
cat backup_socview.sql | docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'
```

## Ricerca avanzata (opzionale)

La configurazione standard usa backend Postgres search.

Per avviare Elastic in locale come opzione avanzata:

```bash
docker compose -f docker-compose.yml -f docker-compose.elastic.yml up -d
```

La procedura base (`docker compose up -d --build`) resta senza Elastic.
