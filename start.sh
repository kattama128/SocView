#!/usr/bin/env sh
set -eu

if [ -f "./backend/manage.py" ]; then
  cd ./backend
elif [ ! -f "./manage.py" ]; then
  echo "manage.py non trovato (atteso in ./backend o cartella corrente)" >&2
  exit 1
fi

python - <<'PY'
import os
import time

import psycopg2

host = os.getenv("PGHOST") or os.getenv("POSTGRES_HOST") or "localhost"
port = os.getenv("PGPORT") or os.getenv("POSTGRES_PORT") or "5432"
user = os.getenv("PGUSER") or os.getenv("POSTGRES_USER") or "socview"
password = os.getenv("PGPASSWORD") or os.getenv("POSTGRES_PASSWORD") or "socview"
dbname = os.getenv("PGDATABASE") or os.getenv("POSTGRES_DB") or "socview"

for _ in range(90):
    try:
        psycopg2.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            dbname=dbname,
        ).close()
        print("PostgreSQL pronto")
        break
    except Exception:
        print("Attendo PostgreSQL...")
        time.sleep(1)
else:
    raise SystemExit("PostgreSQL non raggiungibile")
PY

python manage.py migrate_schemas --shared --noinput
python manage.py migrate_schemas --tenant --noinput
python manage.py collectstatic --noinput

PORT="${PORT:-8000}"
exec daphne -b 0.0.0.0 -p "${PORT}" socview.asgi:application
