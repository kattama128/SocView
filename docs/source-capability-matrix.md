# Source Capability Matrix

Data: 2026-03-03

## Stato ufficiale tipi fonte

| Tipo | Stato | Operativo | Test connection | Run now | Note |
| --- | --- | --- | --- | --- | --- |
| `imap` | GA | Sì | Sì | Sì | Polling mailbox IMAP |
| `rest` | GA | Sì | Sì | Sì | Polling REST API |
| `webhook` | GA | Sì | Sì | No | Push HTTP con API key |
| `syslog_udp` | Planned | No | No | No | Non implementato |
| `syslog_tcp` | Planned | No | No | No | Non implementato |
| `kafka_topic` | Planned | No | No | No | Non implementato |
| `s3_bucket` | Planned | No | No | No | Non implementato |
| `azure_event_hub` | Planned | No | No | No | Non implementato |
| `gcp_pubsub` | Planned | No | No | No | Non implementato |
| `sftp_drop` | Planned | No | No | No | Non implementato |

## Regole operative

- Nessun tipo `Planned` viene presentato come operativo.
- Creazione nuove fonti consentita solo per tipi `create_enabled` (GA/Beta).
- `run-now` disponibile solo per `imap` e `rest`.
- `webhook` è push-only: `run-now` non disponibile.

## Preset vendor reali (REST)

- `canary_tools_rest`
  - Fonte REST pronta per API Canary Tools.
  - Parser dedicato creato automaticamente.
  - Healthcheck dedicato (`healthcheck_url`).
- `sentinelone_rest`
  - Fonte REST pronta per API SentinelOne.
  - Parser dedicato creato automaticamente.
  - Healthcheck dedicato (`healthcheck_url`).

## Endpoint API correlati

- `GET /api/ingestion/sources/capabilities/`
- `POST /api/ingestion/sources/create-from-preset/`
- `POST /api/ingestion/sources/{id}/test-connection/`
- `POST /api/ingestion/sources/{id}/run-now/`
