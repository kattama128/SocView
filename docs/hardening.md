# Hardening

## TLS Nginx

- Certificato dev self-signed incluso:
  - `nginx/certs/dev.crt`
  - `nginx/certs/dev.key`
- Nginx espone:
  - `80` (HTTP)
  - `443` (HTTPS)

Per certificati reali (production-ish):

1. Sostituire `nginx/certs/dev.crt` e `nginx/certs/dev.key` con i certificati reali.
2. Aggiornare `nginx/nginx.conf` se necessario (catena/intermediate).
3. Abilitare in `.env`:
   - `SECURE_SSL_REDIRECT=true`
   - `SESSION_COOKIE_SECURE=true`
   - `CSRF_COOKIE_SECURE=true`
   - `SECURE_HSTS_SECONDS=31536000`

## Rate limiting

- DRF throttling configurabile da `.env`:
  - `DRF_THROTTLE_AUTH` (auth)
  - `DRF_THROTTLE_WEBHOOK` (webhook)
  - `DRF_THROTTLE_ANON`
- Nginx ha `limit_req` su:
  - `/api/auth/token/`, `/api/auth/token/refresh/`
  - `/api/ingestion/webhook/*`

## CORS e security headers

Config da `.env`:

- `CORS_ALLOW_ALL_ORIGINS`
- `CORS_ALLOWED_ORIGINS`
- `CSRF_TRUSTED_ORIGINS`
- `SECURE_REFERRER_POLICY`
- `X_FRAME_OPTIONS`

Header di sicurezza base applicati in Nginx (`nosniff`, `x-frame-options`, `referrer-policy`, `xss-protection`).
Nota dev: HSTS non e forzato per evitare blocchi dei subdomini tenant con cert self-signed.

## Upload allegati sicuro

- Limite upload allegati: `MAX_ATTACHMENT_SIZE_MB`
- Validazioni upload:
  - MIME type consentiti/bloccati (`ATTACHMENT_ALLOWED_MIME_TYPES`, `ATTACHMENT_BLOCKED_MIME_TYPES`)
  - estensioni consentite/bloccate (`ATTACHMENT_ALLOWED_EXTENSIONS`, `ATTACHMENT_BLOCKED_EXTENSIONS`)
  - blocco pattern contenuto rischioso e signature EICAR test
- Scanning:
  - backend reale AV via ClamAV adapter (`ATTACHMENT_SCAN_BACKEND=clamav`, `CLAMAV_*`)
  - placeholder consentito solo in dev con feature flag (`ENABLE_DEV_ATTACHMENT_SCANNER=true`)
  - comportamento su scanner non disponibile configurabile (`BLOCK_UNSCANNED_ATTACHMENTS`)
- Download allegati solo via endpoint autenticato/autorizzato:
  - `GET /api/alerts/attachments/{id}/download/`
- Hardening Nginx:
  - accesso diretto `/media/attachments/*` negato (403)
- Audit upload/download:
  - audit operativo `AuditLog` + security audit `SecurityAuditEvent`

## Audit retention

- Policy configurabile: `AUDIT_RETENTION_DAYS`
- Job periodico Celery Beat: `cleanup_audit_logs_task`

## Logging strutturato

- Logging JSON lato backend (`core.logging_utils.JsonLogFormatter`)
- Livello log configurabile: `LOG_LEVEL`
