# Fullstack Audit Report - Socview

## 1. Executive Summary
- Stato complessivo: **Amber**
- Conteggio issue: **Critical 0 / High 2 / Medium 5 / Low 2**
- Copertura funzionale testata vs non testata:
  - OpenAPI operations: **124/144 testate (86.1%)**
    - Pass: 121
    - Fail: 3 (2 negativi intenzionali + 1 feature disabilitata)
    - Untested: 20
  - Frontend route checks (manual exploratory): **38/38 eseguite** (13 protette unauth, 13 protette auth, 12 legacy)
  - Suite automatiche FE/QA/E2E: eseguite tutte le richieste; backend full suite bloccata (vedi SOC-F-002)
- Top 5 rischi:
  1. Realtime notifications WebSocket non operative via nginx (errori routing continui) 
  2. Test gate backend non affidabile: `manage.py test` non completabile in questo ambiente
  3. QA harness dashboard instabile (falsi negativi sistematici)
  4. Path routing tenant (`TENANT_ROUTING_MODE=path`) non verificato in run dedicato
  5. 20 metodi API non coperti (prevalentemente varianti PUT/PATCH/DELETE destructive)

## 2. Ambiente e Metodologia
### Setup eseguito
- Repo: `/Users/federicocattani/Projects/SocView`
- Branch: `main`
- Routing attivo rilevato:
  - backend: default `subdomain` (env non valorizzata; `PUBLIC_SCHEMA_DOMAIN=localhost`) 
  - frontend: `VITE_TENANT_ROUTING_MODE=subdomain`
- Stack docker verificato:
  - `socview-postgres`, `socview-redis`, `socview-backend`, `socview-celery-worker`, `socview-celery-beat`, `socview-frontend`, `socview-nginx` up/healthy

### Comandi eseguiti con esito (tracciati)
| Comando | Esito | Evidenza |
|---|---:|---|
| `./start.sh` | 0 | `/Users/federicocattani/Projects/SocView/audit_artifacts/precheck_start_sh.log` |
| `docker compose exec -T backend python manage.py migrate_schemas --shared --noinput` | 0 | `/Users/federicocattani/Projects/SocView/audit_artifacts/precheck_migrate_shared.log` |
| `docker compose exec -T backend python manage.py migrate_schemas --tenant --noinput` | 0 | `/Users/federicocattani/Projects/SocView/audit_artifacts/precheck_migrate_tenant.log` |
| `curl /healthz` | 200 | `/Users/federicocattani/Projects/SocView/audit_artifacts/precheck_healthz_code.txt` |
| `curl /readyz` | 200 | `/Users/federicocattani/Projects/SocView/audit_artifacts/precheck_readyz_code.txt` |
| `curl /api/docs/` | 200 | `/Users/federicocattani/Projects/SocView/audit_artifacts/precheck_api_docs_code.txt` |
| API audit script (`run_api_audit.sh`) | 0 | `/Users/federicocattani/Projects/SocView/audit_artifacts/api_audit_run.log` |
| `docker compose exec -T backend python manage.py test` | 1 | `/Users/federicocattani/Projects/SocView/audit_artifacts/auto_backend_manage_test.log` |
| `docker compose exec -T backend python manage.py test --keepdb --noinput` | 137 | `/Users/federicocattani/Projects/SocView/audit_artifacts/auto_backend_manage_test_keepdb.log` |
| `cd frontend && npm ci` | 0 | `/Users/federicocattani/Projects/SocView/audit_artifacts/auto_frontend_npm_ci.log` |
| `cd frontend && npm run lint` | 0 | `/Users/federicocattani/Projects/SocView/audit_artifacts/auto_frontend_lint.log` |
| `cd frontend && npm run test` | 0 | `/Users/federicocattani/Projects/SocView/audit_artifacts/auto_frontend_test.log` |
| `cd frontend && npm run build` | 0 | `/Users/federicocattani/Projects/SocView/audit_artifacts/auto_frontend_build.log` |
| `npm run qa:*` batch richiesto | mixed | `/Users/federicocattani/Projects/SocView/audit_artifacts/auto_qa_scripts_summary.csv` |
| `npx playwright test frontend/tests/socview_full.spec.ts` | 1 (57 pass, 3 fail) | `/Users/federicocattani/Projects/SocView/audit_artifacts/auto_playwright_socview_full.log` |

### Vincoli / blocchi
- Backend test suite completa non eseguibile end-to-end in questa sessione:
  - run standard fallisce per prompt interattivo su DB test già esistente (`EOFError` su non-TTY)
  - run `--keepdb --noinput` termina con **exit 137** dopo avvio test
- Push subscription endpoint ritorna 404 perché feature flag disabilitata (`ENABLE_BROWSER_PUSH=false`) 
- Path routing tenant non validato in esecuzione dedicata (ambiente attuale in `subdomain`)

### Dati QA creati/modificati (dettagliati)
Source of truth: `/Users/federicocattani/Projects/SocView/audit_artifacts/seed_audit_data.json` e `/Users/federicocattani/Projects/SocView/audit_artifacts/final_audit_inventory.json`

Credenziali create:
- `audit_super_admin` / `AuditPass123!` (id 15)
- `audit_soc_manager` / `AuditPass123!` (id 16)
- `audit_soc_analyst` / `AuditPass123!` (id 17)
- `audit_read_only` / `AuditPass123!` (id 18)
- `audit_tmp_user` / temporanea (id 19, poi deattivato)

Tenancy / customer / data seed:
- Tenant1 (`schema=tenant1`, id 1):
  - Customers: `Audit Customer Alpha` (id 7), `Audit Customer Beta` (id 8)
  - Sources: `Audit Global Source` (id 16), `Audit Scoped Source` (id 17)
  - Parser: `Audit Scoped Parser` (id 6), revisions `[8,9,11]`, test case id 2
  - Alerts: `Audit Alert Alpha` (id 44), `Audit Alert Beta` (id 45)
  - Notifications: ids 37, 38
  - Attachment: id 2 (`audit-attachment.txt` su alert 44)
  - Memberships: manager/analyst su customer 7, readonly su customer 8
- Tenant2 (`schema=tenant2`, id 2):
  - Customer: `Audit Tenant2 Customer` (id 3)
  - Alert: `Audit Tenant2 Isolation Alert` (id 2)
  - Memberships manager/analyst su customer 3

Modifiche QA run-time (non-fix):
- Commento aggiunto su alert 44
- Upload allegato addizionale su alert 44 (poi mantenuto come evidenza)
- Configurazioni dashboard/preferenze notifica aggiornate durante test
- Entità temporanee create e ripulite (source/tag/state/saved-search/test-case parser) salvo seed persistente `audit_*`

## 3. Feature Coverage Matrix
Matrice API completa (144 operazioni OpenAPI):
- `/Users/federicocattani/Projects/SocView/audit_artifacts/api_coverage_matrix.csv`
- Raw calls con trace command->status->body: `/Users/federicocattani/Projects/SocView/audit_artifacts/api_results.jsonl`

Tabella sintetica coverage funzionale:

| Feature | Area (FE/BE/Integration) | Endpoint/Route | Test Type | Status | Evidence |
|---|---|---|---|---|---|
| Auth login/refresh/migrate/logout/me/ws-token | BE | `/api/auth/*` | API manual+systematic | Pass | `api_audit_run.log` idx 0001-0032 |
| Roles/users/security audit RBAC | BE | `/api/auth/users*`, `/api/auth/security-audit*` | API RBAC | Pass | idx 0017-0030 |
| Tenant context/list | BE | `/api/tenancy/*` | API + cross-host | Pass | idx 0033-0037 |
| Core context/widgets/tenant dashboard | BE | `/api/core/context`, `/dashboard/widgets`, `/dashboard/tenants` | API | Pass | idx 0038-0044 |
| Core tenants admin (public-only) | BE | `/api/core/tenants*` | API negative/positive | Pass (GET), Fail-intentional (POST invalid payload) | idx 0045-0050 |
| Customers list/detail/settings/memberships | BE | `/api/alerts/customers*` | API + RBAC + scope | Pass | idx 0053-0063 + supplemental S006-S007 |
| Alert states/tags | BE | `/api/alerts/states*`, `/api/alerts/tags*` | API | Pass | idx 0064-0072 + supplemental S008 |
| Alerts list/detail/actions | BE | `/api/alerts/alerts*` | API + RBAC + scope | Pass | idx 0073-0101 |
| Alert attachments upload/download | BE/Integration | `/api/alerts/alerts/{id}/attachments`, `/api/alerts/attachments/{id}/download` | API + file handling | Pass | idx 0091-0096 |
| Audit logs/search/field schemas | BE | `/api/alerts/audit-logs*`, `/search`, `/field-schemas` | API | Pass | idx 0102-0105 + supplemental S010 |
| SLA config | BE | `/api/alerts/sla-config` | API + RBAC | Pass | idx 0106-0108 |
| Saved searches/detail-field configs | BE | `/api/alerts/saved-searches*`, `/detail-field-configs*` | API CRUD | Pass | idx 0109-0116 |
| Notifications ack/ack-all/snooze/preferences | BE/Integration | `/api/alerts/notifications*`, `/notification-preferences` | API | Pass | idx 0117-0123 + supplemental S009 |
| Push subscriptions | BE | `/api/alerts/push-subscriptions` | API | Blocked by config (404 expected) | idx 0124 |
| Analytics overview/by-source/by-customer/heatmap | BE | `/api/alerts/analytics/*` | API | Pass | idx 0125-0128 |
| Source capability matrix/presets | BE | `/api/ingestion/sources/capabilities`, `/create-from-preset` | API | Pass | idx 0129, 0136 |
| Source CRUD/test-connection/run-now/stats/error-log | BE | `/api/ingestion/sources*` | API | Pass | idx 0130-0141 |
| Ingestion runs | BE | `/api/ingestion/runs*` | API | Pass | idx 0142-0143 |
| Webhook ingestion + API key validation | BE/Integration | `/api/ingestion/webhook/{source_id}/` | API | Pass | idx 0145-0146 |
| Parser preview/revisions/diff/test-cases/rollback | BE | `/api/ingestion/parsers*` | API | Pass | idx 0147-0160 |
| Cross-tenant isolation (alerts/sources/customers) | BE | tenant1 vs tenant2 host | API security | Pass | idx 0162-0166 |
| Protected routes unauth redirect | FE | `/, /active-alarms, ...` | Exploratory browser | Pass | `frontend_route_audit.json` unauthenticated |
| Protected routes auth deep-link | FE | routes richieste | Exploratory browser | Pass | `frontend_route_audit.json` authenticated |
| Legacy redirects | FE | `/home,/dashboard,/alerts,...,/costumers*` | Exploratory browser | Pass (redirect attivo) | `frontend_route_audit.json` legacyRedirects |
| FE standard quality gates | FE | `npm ci/lint/test/build` | Automated | Pass | `auto_frontend_*.log` |
| QA scripts batch | FE/Integration | `qa:*` | Automated E2E scripts | Partial (5 pass, 3 fail initial run) | `auto_qa_scripts_summary.csv` |
| Playwright full spec | FE/Integration | `tests/socview_full.spec.ts` | Automated E2E | Partial (57 pass, 3 fail) | `auto_playwright_socview_full.log` |
| Backend unittest suite | BE | `python manage.py test` | Automated | Blocked/Fail infra | `auto_backend_manage_test*.log` |

## 4. Findings (ordinati per severità)

### ID: SOC-F-001
- Titolo: WebSocket notifiche real-time non instradato correttamente (slash mismatch)
- Severità: **High**
- Area: Integration (nginx + ASGI + FE)
- File/Line:
  - `/Users/federicocattani/Projects/SocView/nginx/nginx.conf:93-105`
  - `/Users/federicocattani/Projects/SocView/backend/tenant_data/routing.py:6-7`
  - `/Users/federicocattani/Projects/SocView/frontend/src/hooks/useNotificationsWS.ts:24-29`
- Endpoint/Route: `GET/WS /ws/notifications`, `/t/{tenant}/ws/notifications`
- Passi di riproduzione:
  1. Login utente e apri app con notification WS attivo
  2. Backend riceve tentativi websocket (`WSCONNECTING /ws/notifications`)
  3. ASGI logga errore `No route found for path 'ws/notifications'`
- Risultato atteso: handshake WS su route notifiche riuscito
- Risultato attuale: handshake fallisce ripetutamente; fallback polling prende il controllo
- Evidenza:
  - `/Users/federicocattani/Projects/SocView/audit_artifacts/backend_logs_tail_after_tests.log` (es. line 22+34)
- Impatto:
  - Notifiche realtime degradate/assenti
  - Rumore errori continuo nei log runtime
- Root cause ipotizzata:
  - nginx proxya verso `/ws/notifications` senza trailing slash, mentre backend route richiede `/ws/notifications/`
- Fix consigliato (non applicato):
  - allineare path in uno dei layer:
    - nginx `proxy_pass .../ws/notifications/` **oppure**
    - backend `re_path` con slash opzionale `/?$`
- Test da aggiungere/aggiornare:
  - test integrazione WS end-to-end dietro nginx con assert handshake 101
  - smoke test su `useNotificationsWS` con URL effettivo risolto

### ID: SOC-F-002
- Titolo: Suite backend non eseguibile stabilmente in modalità non interattiva
- Severità: **High**
- Area: Backend test infrastructure
- File/Line: N/A (runtime execution)
- Endpoint/Route: N/A
- Passi di riproduzione:
  1. `docker compose exec -T backend python manage.py test`
  2. Prompt DB test già esistente richiede input interattivo -> `EOFError`
  3. Rerun `--keepdb --noinput` -> processo terminato con exit 137
- Risultato atteso: suite test completa eseguita con risultato pass/fail deterministico
- Risultato attuale: suite bloccata prima del completamento
- Evidenza:
  - `/Users/federicocattani/Projects/SocView/audit_artifacts/auto_backend_manage_test.log`
  - `/Users/federicocattani/Projects/SocView/audit_artifacts/auto_backend_manage_test_keepdb.log`
  - `/Users/federicocattani/Projects/SocView/audit_artifacts/auto_backend_manage_test_keepdb_rerun.log`
- Impatto:
  - Regression gate backend non affidabile
  - rischio rilascio senza validazione completa
- Root cause ipotizzata:
  - pipeline test non idempotente su DB test preesistente + limite risorse/process kill in container
- Fix consigliato (non applicato):
  - standardizzare comando CI (`--noinput --keepdb` + lifecycle DB test controllato)
  - investigare kill 137 (memory/cgroup limit, singolo test killer)
- Test da aggiungere/aggiornare:
  - job CI dedicato che verifica esecuzione completa e produce junit report

### ID: SOC-F-003
- Titolo: `qa:dashboard` fallisce per race condition nel harness (`waitForResponse`)
- Severità: **Medium**
- Area: Test harness
- File/Line: `/Users/federicocattani/Projects/SocView/frontend/scripts/dashboard-e2e.mjs:82-96`
- Endpoint/Route: `/api/core/dashboard/widgets/`, `/api/alerts/search/`
- Passi di riproduzione:
  1. Esegui `npm run qa:dashboard`
  2. Step “Dashboard usa endpoint reali” fallisce timeout 15s
- Risultato atteso: test passa se endpoint sono stati chiamati con 2xx
- Risultato attuale: timeout anche con dashboard funzionante
- Evidenza:
  - `/Users/federicocattani/Projects/SocView/audit_artifacts/auto_qa_dashboard.log`
  - `/Users/federicocattani/Projects/SocView/audit_artifacts/auto_qa_dashboard_rerun.log`
- Impatto:
  - falsi negativi in smoke/QA pipeline
- Root cause ipotizzata:
  - `waitForResponse` attende chiamate future; parte delle chiamate avviene già durante login/load
- Fix consigliato (non applicato):
  - usare `widgetsHit/searchHit` già tracciati dagli event listener o agganciare `waitForResponse` prima del trigger
- Test da aggiungere/aggiornare:
  - test harness deterministico per dashboard bootstrap API

### ID: SOC-F-004
- Titolo: `qa:smoke` dashboard branch non deterministica su drag&drop widget
- Severità: **Medium**
- Area: Test harness
- File/Line: `/Users/federicocattani/Projects/SocView/frontend/scripts/dashboard-e2e.mjs:123-142`
- Endpoint/Route: `/` dashboard
- Passi di riproduzione:
  1. Esegui `npm run qa:smoke`
  2. Talvolta fallisce step drag&drop (`ordine non cambia`)
- Risultato atteso: comportamento stabile pass/fail coerente
- Risultato attuale: flaky
- Evidenza:
  - `/Users/federicocattani/Projects/SocView/audit_artifacts/auto_qa_smoke_rerun.log`
- Impatto:
  - bassa affidabilità del segnale QA
- Root cause ipotizzata:
  - assert troppo rigido su ordine immediato in headless DnD
- Fix consigliato (non applicato):
  - validare con persistenza dopo save/reload + retry limitato, non su singola mutazione DOM immediata
- Test da aggiungere/aggiornare:
  - scenario DnD robusto con fallback se meno di 2 widget draggable

### ID: SOC-F-005
- Titolo: `qa:sources` cleanup fallito con 429 in run ad alto carico (flaky)
- Severità: **Medium**
- Area: Test harness / environment load
- File/Line: `/Users/federicocattani/Projects/SocView/frontend/scripts/sources-e2e.mjs:170-187`
- Endpoint/Route: `DELETE /api/ingestion/sources/{id}/`
- Passi di riproduzione:
  1. Esegui batch QA dopo storm API
  2. Step cleanup fallisce `status 429`, fonte temporanea resta presente
  3. Rerun isolato passa
- Risultato atteso: cleanup sempre idempotente
- Risultato attuale: fallimento intermittente
- Evidenza:
  - `/Users/federicocattani/Projects/SocView/audit_artifacts/auto_qa_sources.log`
  - `/Users/federicocattani/Projects/SocView/audit_artifacts/auto_qa_sources_rerun.log`
- Impatto:
  - inquinamento dati test e falsi allarmi smoke
- Root cause ipotizzata:
  - dipendenza da rate limit / stato ambiente condiviso
- Fix consigliato (non applicato):
  - cleanup retry con backoff su 429
  - nomi univoci + sweep finale robusto
- Test da aggiungere/aggiornare:
  - verifica post-cleanup con retry bounded

### ID: SOC-F-006
- Titolo: Playwright full spec: aspettativa `ack-all` non allineata al comportamento UX reale
- Severità: **Medium**
- Area: Test harness
- File/Line: `/Users/federicocattani/Projects/SocView/frontend/tests/socview_full.spec.ts:311-318`
- Endpoint/Route: Notification drawer
- Passi di riproduzione:
  1. `npx playwright test frontend/tests/socview_full.spec.ts`
  2. Test si aspetta drawer vuoto dopo ack-all
- Risultato atteso: test verifica regola UX corretta
- Risultato attuale: item restano visibili ma marcati read (design corrente)
- Evidenza:
  - `/Users/federicocattani/Projects/SocView/audit_artifacts/auto_playwright_socview_full.log`
  - `/Users/federicocattani/Projects/SocView/frontend/src/components/NotificationDrawer.tsx` (lista include anche read)
- Impatto:
  - falso fail in regression suite
- Root cause ipotizzata:
  - test assume filtro unread-only, UI mostra all by default
- Fix consigliato (non applicato):
  - aggiornare assertion su `is_read`/badge unread, non su invisibilità totale
- Test da aggiungere/aggiornare:
  - caso separato `status=unread` per assert drawer vuoto

### ID: SOC-F-007
- Titolo: Playwright full spec: test parser cerca Monaco, UI attuale usa editor diverso/testid non presente
- Severità: **Medium**
- Area: Test harness
- File/Line: `/Users/federicocattani/Projects/SocView/frontend/tests/socview_full.spec.ts:416-420`
- Endpoint/Route: `/parsers`
- Passi di riproduzione:
  1. esegui full spec
  2. test fallisce su `.monaco-editor`/`[data-testid="parser-editor"]`
- Risultato atteso: selector allineato all’UI corrente
- Risultato attuale: element not found
- Evidenza:
  - `/Users/federicocattani/Projects/SocView/audit_artifacts/auto_playwright_socview_full.log`
  - `/Users/federicocattani/Projects/SocView/frontend/test-results/socview_full-Parser-editor-Monaco-presente-nel-detail-parser/error-context.md`
- Impatto:
  - falso fail su suite E2E principale
- Root cause ipotizzata:
  - drift tra spec e implementazione parser page
- Fix consigliato (non applicato):
  - rifattorizzare test su controlli funzionali (`save`, `preview`, output) e selector stabili
- Test da aggiungere/aggiornare:
  - locator resilient con fallback validato su DOM reale

### ID: SOC-F-008
- Titolo: Dipendenze frontend con vulnerabilità moderate + warning bundle size
- Severità: **Low**
- Area: Frontend build/runtime hygiene
- File/Line: N/A (tool output)
- Endpoint/Route: N/A
- Passi di riproduzione:
  1. `npm ci`
  2. `npm run build`
- Risultato atteso: nessuna vuln moderata + warning chunk controllati
- Risultato attuale: 2 moderate vulnerabilities, chunk >500kB warning
- Evidenza:
  - `/Users/federicocattani/Projects/SocView/audit_artifacts/auto_frontend_npm_ci.log`
  - `/Users/federicocattani/Projects/SocView/audit_artifacts/auto_frontend_build.log`
- Impatto:
  - rischio sicurezza/performance non critico ma accumulativo
- Root cause ipotizzata:
  - dependency tree non aggiornato + chunking da ottimizzare
- Fix consigliato (non applicato):
  - `npm audit` + remediation mirata; revisione manualChunks/dynamic imports
- Test da aggiungere/aggiornare:
  - budget CI su bundle size e security audit gating

### ID: SOC-F-009
- Titolo: Gap di copertura su 20 metodi API (prevalentemente varianti destructive)
- Severità: **Low**
- Area: QA coverage
- File/Line: N/A
- Endpoint/Route: es. `PUT/PATCH/DELETE` su alerts/customers/states/tags/users/sources/parsers
- Passi di riproduzione:
  1. confronta schema OpenAPI vs calls eseguite
- Risultato atteso: copertura completa o risk-accepted esplicita
- Risultato attuale: 20 operazioni `Untested`
- Evidenza:
  - `/Users/federicocattani/Projects/SocView/audit_artifacts/api_coverage_matrix.csv`
- Impatto:
  - regressioni possibili su percorsi non esercitati
- Root cause ipotizzata:
  - scelta prudenziale su operazioni destructive in ambiente condiviso
- Fix consigliato (non applicato):
  - suite dedicata su tenant usa-e-getta per copertura PUT/PATCH/DELETE completa
- Test da aggiungere/aggiornare:
  - contract tests CRUD full-cycle su ogni resource

## 5. Contratti FE/BE
### Mismatch payload/status/error handling
1. **WebSocket path contract mismatch (prodotto)**
   - FE genera URL con trailing slash (`/ws/notifications/`)
   - nginx proxya verso backend senza trailing slash (`/ws/notifications`)
   - backend accetta pattern con slash finale
   - Impatto: realtime notifications non connesse, fallback polling

2. **Authorization semantics su scope risorsa (ambiguità contratto)**
   - Accessi cross-scope/cross-tenant tornano spesso `404` (queryset filtering) anziché `403`
   - Esempi: idx 0061/0063/0079/0163/0164/0166
   - Impatto: lato FE difficile distinguere “non esiste” da “forbidden” (UX messaging/debug)

3. **Feature-flagged endpoint push subscriptions**
   - `POST /api/alerts/push-subscriptions/` -> `404 Browser push disabilitato`
   - Impatto: FE deve gestire esplicitamente capability disabled senza trattarlo come errore inatteso

### Endpoint coinvolti
- `/ws/notifications`, `/t/{tenant}/ws/notifications`
- `/api/alerts/*` scoped resources (customers/alerts/sources cross-scope)
- `/api/alerts/push-subscriptions/`

### Impatto UX/operatività
- Notifiche near-realtime degradate
- Possibile messaggistica errore non ottimale lato FE per 404/403 semantico
- Funzionalità push web non attiva in env corrente (atteso ma da comunicare chiaramente in UI)

## 6. Piano Fix pronto per fase successiva
| Task ID | Priorità | Obiettivo | File target | Criteri accettazione | Test verifica |
|---|---|---|---|---|---|
| SOC-T-001 | P1 | Ripristinare WS notifications end-to-end dietro nginx | `nginx/nginx.conf`, `backend/tenant_data/routing.py` | handshake WS 101 senza errori “No route found” | integrazione WS + grep log assenza errore |
| SOC-T-002 | P1 | Rendere eseguibile `manage.py test` in modalità CI non interattiva | config test DB / CI runner | suite completa termina con exit code deterministico | `python manage.py test --noinput` completato |
| SOC-T-003 | P2 | Stabilizzare `qa:dashboard` (race response) | `frontend/scripts/dashboard-e2e.mjs` | nessun timeout falso in 3 run consecutivi | `npm run qa:dashboard` x3 |
| SOC-T-004 | P2 | Hardening cleanup `qa:sources` su 429/rate-limit | `frontend/scripts/sources-e2e.mjs` | cleanup affidabile senza residui fonte temporanea | `npm run qa:sources` in batch e rerun |
| SOC-T-005 | P2 | Allineare `socview_full.spec.ts` con UX corrente (ack-all/parser editor/logout selector) | `frontend/tests/socview_full.spec.ts` | full spec senza falsi negativi | `npx playwright test tests/socview_full.spec.ts` |
| SOC-T-006 | P3 | Coprire 20 metodi API untested in ambiente isolate-tenant | suite QA API | coverage OpenAPI >=95% | diff `api_coverage_matrix.csv` |
| SOC-T-007 | P3 | Ridurre warning security/performance FE | dependency + vite config | 0 moderate vulnerabilities + warning chunk sotto soglia definita | `npm ci`, `npm audit`, `npm run build` |

## 7. Prompt pronto per fix phase
Usa questo prompt copy-paste nella sessione fix:

```text
Obiettivo: applica fix minimi e sicuri per i task SOC-T-001..SOC-T-007 in ordine priorità.

Regole:
1) Parti da SOC-T-001 (WebSocket nginx/backend trailing slash mismatch) e valida con test integrazione WS reale dietro nginx.
2) Poi SOC-T-002 (stabilità backend test runner non-interattivo) senza introdurre workaround distruttivi.
3) Aggiorna harness E2E (SOC-T-003/004/005) eliminando falsi negativi, mantenendo test behavior-driven.
4) Estendi copertura API sui metodi untested (SOC-T-006) in tenant isolato e con cleanup garantito.
5) Chiudi con hygiene FE (SOC-T-007): audit dipendenze e chunking.

Per ogni task:
- applichi patch minima
- aggiungi/aggiorni test
- esegui test mirati + regression set
- riporti evidenze (comando, exit code, output chiave)

Rerun finale obbligatorio:
- docker compose exec -T backend python manage.py test --noinput
- cd frontend && npm run lint && npm run test && npm run build
- cd frontend && npm run qa:smoke && npm run qa:dashboard && npm run qa:sources
- cd frontend && npx playwright test tests/socview_full.spec.ts

Output finale richiesto:
- changelog tecnico per file
- stato finding (Resolved/Remaining)
- rischi residui
```

## 8. Recheck Post-Fix (solo se applicabile)
- Non applicabile in questo ciclo: **nessun fix applicato** (fase solo audit/test).
- Stato finding attuale:
  - Open: SOC-F-001, SOC-F-002, SOC-F-003, SOC-F-004, SOC-F-005, SOC-F-006, SOC-F-007, SOC-F-008, SOC-F-009
  - Resolved: nessuno (in questa fase)
  - Blocked: validazione path-mode tenancy (richiede run dedicato con `TENANT_ROUTING_MODE=path` + FE env coerente)

---

### Riepilogo numerico finale
- API operations coperte: **124/144** (86.1%)
- API calls eseguite con evidenza: **173 + 10 supplementari**
- Frontend route checks: **38**
- Playwright full spec: **57 pass / 3 fail**
- QA scripts batch: **5 pass / 3 fail** (con rerun: `qa:sources` passa, `qa:dashboard` resta fail)
- Backend full unit suite: **bloccata** (`EOF`/`137`)

### Lista prioritaria fix raccomandati
1. SOC-T-001 (WS routing mismatch)
2. SOC-T-002 (backend test runner stability)
3. SOC-T-003 (qa:dashboard race)
4. SOC-T-005 (playwright spec drift)
5. SOC-T-006 (coverage gap 20 metodi)

### Blocchi residui
- Backend suite completa non conclusa in ambiente corrente
- Path routing mode non ancora validato
