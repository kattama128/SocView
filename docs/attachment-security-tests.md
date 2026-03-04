# Attachment Security Tests

Data: 2026-03-03

## Scope

- Download allegati protetto da autenticazione/autorizzazione oggetto.
- Upload allegati con validazioni produzione (dimensione/MIME/estensione/contenuto).
- Audit operativo e security audit su upload/download.
- Blocco accesso diretto ai media sensibili.

## Automated backend tests

Classe test:

- `tenant_data.tests.AttachmentSecurityTests`

Esecuzione:

```bash
docker compose exec backend python manage.py test --keepdb --noinput tenant_data.tests.AttachmentSecurityTests
```

Copertura principale:

- `test_direct_download_requires_authentication`
- `test_download_is_scoped_by_customer_membership`
- `test_authorized_download_streams_and_audits`
- `test_upload_rejects_risky_content_and_writes_audit`
- `test_upload_accepts_clean_file_and_writes_audit`

## Manual checks (Nginx + API)

1. Accesso diretto media allegato:

```bash
curl -i http://localhost/media/attachments/alert_1/sample.txt
```

Atteso: `403 Forbidden`.

2. Download protetto senza token:

```bash
curl -i http://localhost/api/alerts/attachments/1/download/
```

Atteso: `401 Unauthorized`.

3. Download protetto con token utente non autorizzato al customer:

Atteso: `403 Forbidden` e evento `attachment.download_denied` in security audit.
