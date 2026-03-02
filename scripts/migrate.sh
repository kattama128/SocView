#!/usr/bin/env sh
set -e

docker compose exec backend python manage.py migrate_schemas --shared --noinput
docker compose exec backend python manage.py migrate_schemas --tenant --noinput
