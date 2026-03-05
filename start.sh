#!/usr/bin/env sh
set -eu

# One-click local startup script for SocView.
# It downloads/builds dependencies, starts all services, runs migrations,
# seeds demo data and opens the application.

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$SCRIPT_DIR"

log() {
  printf '%s\n' "$1"
}

fail() {
  printf 'ERRORE: %s\n' "$1" >&2
  exit 1
}

if ! command -v docker >/dev/null 2>&1; then
  fail "Docker non trovato. Installa Docker Desktop e riprova."
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  fail "docker compose non disponibile. Installa Docker Compose plugin."
fi

if ! docker info >/dev/null 2>&1; then
  fail "Docker daemon non raggiungibile. Avvia Docker Desktop e riprova."
fi

if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example .env
    log "Creato .env da .env.example"
  else
    fail ".env.example non trovato."
  fi
fi

log "Scarico immagini disponibili..."
# Keep going even if some images are build-only.
$COMPOSE_CMD pull || true

log "Build + avvio stack..."
$COMPOSE_CMD up -d --build

wait_for_http() {
  url="$1"
  max_tries="${2:-60}"
  sleep_seconds="${3:-2}"
  i=1
  while [ "$i" -le "$max_tries" ]; do
    code="$(curl -s -o /dev/null -w '%{http_code}' "$url" || true)"
    if [ "$code" = "200" ]; then
      log "OK: $url"
      return 0
    fi
    sleep "$sleep_seconds"
    i=$((i + 1))
  done
  return 1
}

log "Attendo backend health..."
if ! wait_for_http "http://localhost/healthz" 90 2; then
  fail "Backend non healthy su /healthz."
fi

log "Eseguo migrazioni shared + tenant..."
$COMPOSE_CMD exec -T backend python manage.py migrate_schemas --shared --noinput
$COMPOSE_CMD exec -T backend python manage.py migrate_schemas --tenant --noinput

log "Seed demo (idempotente)..."
$COMPOSE_CMD exec -T backend python manage.py seed_demo

log "Verifica readiness..."
if ! wait_for_http "http://localhost/readyz" 45 2; then
  fail "Servizio non ready su /readyz."
fi

if command -v open >/dev/null 2>&1; then
  open "http://localhost" >/dev/null 2>&1 || true
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost" >/dev/null 2>&1 || true
fi

log ""
log "SocView avviato."
log "URL principali:"
log "- Public:   http://localhost"
log "- Tenant 1: http://tenant1.localhost"
log "- Swagger:  http://localhost/api/docs/"
log ""
log "Credenziali demo:"
log "- admin / Admin123!"
log "- manager / Manager123!"
log "- analyst / Analyst123!"
log "- readonly / ReadOnly123!"
