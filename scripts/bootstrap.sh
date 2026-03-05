#!/usr/bin/env sh
set -e

cp -n .env.example .env || true

docker compose up -d --build

docker compose exec backend python manage.py migrate_schemas --shared --noinput
docker compose exec backend python manage.py migrate_schemas --tenant --noinput

echo "Bootstrap completato. Apri http://localhost"
