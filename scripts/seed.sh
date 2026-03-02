#!/usr/bin/env sh
set -e

docker compose exec backend python manage.py seed_demo
