#!/bin/sh
set -e

python - <<'PY'
import os
import time
import psycopg2

host = os.getenv("POSTGRES_HOST", "postgres")
port = os.getenv("POSTGRES_PORT", "5432")
user = os.getenv("POSTGRES_USER", "socview")
password = os.getenv("POSTGRES_PASSWORD", "socview")
dbname = os.getenv("POSTGRES_DB", "socview")

for _ in range(60):
    try:
        psycopg2.connect(host=host, port=port, user=user, password=password, dbname=dbname).close()
        print("PostgreSQL pronto")
        break
    except Exception:
        print("Attendo PostgreSQL...")
        time.sleep(1)
else:
    raise SystemExit("PostgreSQL non raggiungibile")
PY

python manage.py migrate_schemas --shared --noinput
python manage.py collectstatic --noinput

exec python manage.py runserver 0.0.0.0:8000
