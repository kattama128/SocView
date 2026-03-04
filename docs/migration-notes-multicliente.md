# Migration Notes - Multi-Cliente Operativo

Data: 2026-03-03

## Obiettivo

Introdurre un modello business multi-cliente nello stesso schema operativo tenant, mantenendo compatibilita temporanea con i dati legacy.

## Modifiche principali

- Nuovo modello `tenant_data.Customer` (cliente business).
- Nuove relazioni opzionali:
  - `Alert.customer`
  - `Source.customer`
  - `SavedSearch.customer`
  - `NotificationEvent.customer`
  - `IngestionRun.customer`
- Filtri `customer_id` su API allarmi/search/saved-searches/notifiche/ingestion/parsers/field-schema.
- Dashboard widgets filtrabili con `customer_id`.

## Migrazione DB

Migration: `tenant_data.0007_customer_alert_alert_customer_event_ts_idx_and_more`

La migration:

1. Crea la tabella `tenant_data_customer`.
2. Aggiunge i campi FK `customer` ai modelli principali.
3. Esegue backfill automatico:
   - crea un customer legacy per schema (`Legacy <schema_name>`)
   - assegna tutti i record legacy con `customer IS NULL` al customer legacy
4. Aggiunge indici per query per-cliente.
5. Aggiorna i vincoli univoci:
   - `Source`: da `(name, type)` a `(customer, name, type)`
   - `SavedSearch`: da `(user, name)` a `(user, customer, name)`

## Backfill manuale (idempotente)

Comando disponibile:

`python manage.py backfill_customers`

Utile se si importano dati legacy dopo la migration.

## Compatibilita temporanea

- I campi `customer` restano `NULLABLE` in questa fase.
- Le API funzionano anche senza `customer_id`, restituendo il comportamento legacy (tutti i record del tenant schema corrente).
- I record nuovi possono essere creati con `customer_id` esplicito oppure con fallback (query param/payload).

## Deprecazioni pianificate

1. Rendere `customer` obbligatorio (`NOT NULL`) sui modelli core dopo stabilizzazione.
2. Eliminare il fallback legacy senza `customer_id` lato API.
3. Portare i flussi frontend a contesto cliente esplicito in tutte le chiamate.
4. Rivedere il perimetro `django-tenants` riducendolo a compatibilita infrastrutturale.

## Query consigliate

- Alert per cliente: indice `alert_customer_event_ts_idx`.
- Fonti per cliente/stato: indice `src_cust_type_enabled_idx`.
- Notifiche attive per cliente: indice `notif_cust_active_created_idx`.
- Saved searches per utente e cliente: indice `savedsearch_customer_user_idx`.
