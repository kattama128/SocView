# Review Architetturale: Implementazione Elasticsearch in SocView

**Reviewer**: Principal Staff Engineer
**Data review**: 6 marzo 2026
**Documento revisionato**: Documento di Progettazione v1.0
**Metodo**: Verifica incrociata report vs codebase reale

---

## A) Verdetto sintetico

| Dimensione | Score | Note |
|------------|-------|------|
| **Completezza** | 78/100 | Copre i gap principali, manca su dynamic_filters ES (gia implementati), client HTTP raw, SYNC_ASYNC setting, export_configurable |
| **Correttezza tecnica** | 82/100 | Riferimenti a line number verificati e corretti. Alcune imprecisioni su struttura moduli (search/ e subdirectory) e omissioni su implementazioni esistenti |
| **Fattibilita** | 72/100 | Stime Fase 2-3 sottodimensionate. Manca analisi impatto `search_after` su sort-uniqueness. Uso HTTP raw vs client ufficiale non affrontato |
| **Operativita** | 75/100 | Rollback plan solido. Manca sizing ES produzione, ILM concreto, backup indici, monitoring alerting thresholds |
| **Testabilita** | 68/100 | Test plan generico. Mancano: test di carico, test consistenza sotto concorrenza, test di recovery post-failure, test tenant isolation |
| **Gestione rischio** | 70/100 | Rischi principali identificati. Mancano: rischio HTTP raw senza connection pooling, rischio memory pressure ES, rischio split-brain su rebuild concorrenti, rischio race condition signals |

**Verdetto finale**: `APPROVABILE CON MODIFICHE`

**Motivazione**: Il report dimostra comprensione accurata della baseline AS-IS (verificata al 90%+ sui line number). I gap identificati sono reali e le soluzioni proposte sono tecnicamente valide. Le modifiche richieste riguardano: (1) stime irrealistiche per Fase 2-3 che vanno raddoppiate, (2) decisione architetturale mancante su HTTP raw vs elasticsearch-py, (3) gestione concorrenza rebuild/sync non affrontata, (4) test plan insufficiente per production-readiness, (5) omissione di funzionalita ES gia implementate (dynamic_filters nested queries). Il piano e eseguibile dopo queste correzioni.

---

## B) Findings ordinati per severita

### P0 — Bloccanti

| # | Area | Problema | Impatto | Evidenza | Fix consigliato | Confidenza |
|---|------|----------|---------|----------|-----------------|------------|
| 1 | Backend/Architettura | Il report non affronta la scelta HTTP raw (urllib) vs client `elasticsearch-py`. Il backend attuale usa `_request()` custom con urllib. Questo impatta retry, connection pooling, bulk API, scroll/search_after | Implementare bulk API e search_after su HTTP raw richiede reimplementazione significativa. Connection pooling assente causa latenza sotto carico | `backends.py:440-470` usa `urllib.request.urlopen` diretto | **Decidere**: (a) migrare a `elasticsearch-py` in Fase 1 e semplificare tutto il resto, oppure (b) documentare esplicitamente la scelta raw-HTTP e stimare effort aggiuntivo per bulk/retry/pooling | 0.95 |
| 2 | Sync/Consistenza | Race condition su rebuild concorrente + sync real-time. Se rebuild e sync_alert corrono in parallelo sullo stesso alert, possibile perdita dati o documento stale | Indice inconsistente in produzione sotto carico | `tasks.py:52-64` — rebuild e sync sono task indipendenti senza locking | Aggiungere: (a) lock distribuito (Redis) su rebuild per tenant, (b) epoch/version field nel documento ES, (c) rebuild deve disabilitare sync durante esecuzione o usare alias swap | 0.90 |
| 3 | Stima | Fase 2 (mapping + query parity) stimata 2gg e irrealistica. Solo `search_after` richiede: sort-uniqueness guarantee, refactor paginazione export, test regressione. Dynamic filters ES sono gia implementati (il report non lo riconosce) ma mancano tag_ids/assignee/state_since che richiedono mapping + query + test | Slip di timeline, pressione su QA | Confronto: export_configurable ha serializer dedicato (`serializers.py:559-563`), max_pages=50 hardcoded (`views.py:718`) | Stimare Fase 2 a **4gg** minimo. Separare: 2a) mapping+filtri (2gg), 2b) search_after+export (2gg) | 0.85 |
| 4 | Stima | Fase 3 (sync pipeline) stimata 2gg. Richiede: 4 nuovi signal handlers, on_commit migration, dedupe logic, batch task, test consistenza sotto concorrenza. Ogni signal handler richiede: implementazione, test unitario, test integrazione | Stessa pressione timeline | `signals.py` ha solo 2 handlers (alert save/delete). Servono handlers per AlertTag, Assignment, state_change — ciascuno con edge case (cascade delete, bulk operations) | Stimare Fase 3 a **3-4gg** | 0.85 |

### P1 — Importanti

| # | Area | Problema | Impatto | Evidenza | Fix consigliato | Confidenza |
|---|------|----------|---------|----------|-----------------|------------|
| 5 | Backend | `search_after` richiede sort tie-breaker unico. Il sort attuale usa `{"id": {"order": "desc"}}` come tie-breaker (`backends.py:691`), ma search_after richiede che il valore sia globalmente unico nel resultset. Se `id` e integer PK, funziona, ma va verificato che non ci siano sort secondari che rompono l'unicita | Paginazione profonda restituisce risultati duplicati o mancanti | `backends.py:691` — sort payload include `{"id": {"order": "desc"}}` | Verificare che `id` sia PK Alert (FATTO: `models.py` conferma AutoField). Documentare vincolo: search_after funziona SOLO se ultimo sort field e unique | 0.90 |
| 6 | Backend | Report ignora che dynamic_filters su ES sono GIA implementati con nested queries (`backends.py:558-596`). La sezione gap non lo menziona, rischiando lavoro duplicato | Effort sprecato se qualcuno reimplementa | `backends.py:558-596` implementa `_match_dynamic_filter` per ES con nested bool query | Aggiornare gap analysis: dynamic_filters ES funzionano. Gap reali sono SOLO: tag_ids, assigned_to_id, in_state_since | 0.95 |
| 7 | Frontend | Report non menziona `export_configurable` endpoint (`views.py:1347-1451`) che ha serializer dedicato e logica di export separata. Questo endpoint e impattato dalla migrazione search_after | Export configurable potrebbe non beneficiare delle modifiche o rompersi | `views.py:1347-1451`, `serializers.py:559-563` — ExportConfigurableRequestSerializer estende AlertSearchRequestSerializer | Aggiungere a catalogo modifiche: refactor `_collect_alert_ids_for_export()` per usare search_after. Testare export_configurable con dataset > 5000 alert | 0.90 |
| 8 | Config | Report non menziona setting `SEARCH_INDEX_SYNC_ASYNC` (`settings.py:190-191`) che controlla sync sincrono vs asincrono. Interagisce con le modifiche proposte a signals e tasks | Modifiche ai task Celery potrebbero rompere modalita sync (usata nei test) | `settings.py:190-191`, test usano `SEARCH_INDEX_SYNC_ASYNC=False` | Documentare interazione SYNC_ASYNC con nuovi signal handlers. Garantire che tutti i nuovi handlers rispettino il flag | 0.85 |
| 9 | Operativita | Manca sizing ES per produzione: RAM, disco, sharding strategy per multi-tenant. Con N tenant e M alert/tenant, quanti shard totali? | Cluster ES sottodimensionato o over-sharded in produzione | `docker-compose.elastic.yml` ha `ES_JAVA_OPTS=-Xms512m -Xmx512m` — dev only | Aggiungere a Fase 0: definire sizing model basato su volume alert atteso. Regola: max 20 shard/GB heap, max 50GB/shard | 0.80 |
| 10 | Sicurezza | Report menziona TLS/auth ma non specifica come gestire credenziali ES in container orchestration. `ELASTICSEARCH_URL` include potenzialmente user:pass in URL | Credenziali in chiaro in env vars, log, docker inspect | `settings.py:186` — URL letta da env senza sanitizzazione | Specificare: (a) variabili separate `ELASTICSEARCH_USER`/`ELASTICSEARCH_PASSWORD`, (b) supporto API key, (c) sanitizzazione URL nei log | 0.80 |

### P2 — Migliorativi

| # | Area | Problema | Impatto | Evidenza | Fix consigliato | Confidenza |
|---|------|----------|---------|----------|-----------------|------------|
| 11 | Architettura | Report propone alias versionati (`{prefix}-{schema}-v{n}`) ma non specifica dove persistere il numero versione corrente. Settings? DB? File? | Rotate command non sa quale versione e attiva | Report sezione 5.1 punto 1 | Persistere versione in tabella DB `SearchIndexVersion(schema_name, version, created_at, is_active)` nel public schema | 0.85 |
| 12 | Backend | `is_available()` fa GET / su ogni `sync_alert` e `search` (via `ensure_index`). Report propone cache ma non specifica TTL ne invalidation | Health check troppo frequente o cache stale che maschera failure | `backends.py:475` — `is_available()` chiamato da `ensure_index()` | Cache con TTL 30s e invalidazione su ConnectionError. Usare `threading.local()` o setting Django cache | 0.80 |
| 13 | Test | Test plan non include: test di tenant isolation (un tenant non vede alert di un altro), test sotto carico concorrente, test di recovery post ES restart | Bug di sicurezza (data leakage) non rilevati in CI | `tests.py:1071` — test solo Postgres, nessun test ES isolation | Aggiungere test specifici: (a) multi-tenant isolation, (b) sync sotto burst di 1000 alert, (c) fallback durante ES restart | 0.75 |
| 14 | Frontend | Report modifica 4 pagine frontend per diagnostica ma non menziona componente condiviso. Rischio duplicazione logica badge/tooltip | Manutenzione duplicata su 4 file | `ActiveAlarmsPage.tsx`, `CustomerAlarmsPage.tsx`, `TenantPage.tsx` | Creare componente `SearchBackendBadge` riusabile. Una modifica, 4 import | 0.90 |
| 15 | Documentazione | Report non menziona `build_source_field_schema` e `build_all_source_field_schemas` in `service.py` che forniscono metadata per dynamic filters. Questi impattano la strategia di mapping ES | Dynamic filter schema potrebbe divergere da ES mapping | `service.py` esporta queste funzioni, usate dall'endpoint `/ingestion/source-field-schema/` | Documentare relazione tra source field schema e ES nested mapping. Verificare coerenza tipi | 0.70 |

### P3 — Cosmetici/Minor

| # | Area | Problema | Impatto | Evidenza | Fix consigliato | Confidenza |
|---|------|----------|---------|----------|-----------------|------------|
| 16 | Report | Numerazione rotta nella sezione 2 (AS-IS): passa da punto 9 a punto 1, poi da 9.6 a 1 | Confusione nella lettura | Sezione 2 e 3 del report | Rinumerare correttamente | 1.0 |
| 17 | Report | Sezione 6 (funzionalita finali): numerazione ricomincia da 1 dopo punto 9 | Stessa confusione | Sezione 6 del report | Rinumerare | 1.0 |
| 18 | Report | Il report referenzia `backends.py` senza specificare che e in `tenant_data/search/backends.py` (subdirectory `search/`) | Sviluppatore potrebbe cercare il file nella directory sbagliata | Struttura reale: `backend/tenant_data/search/backends.py` | Usare path completi relativi | 0.95 |

---

## C) Gap Analysis strutturata

### Gap funzionali

| ID | Gap | Stato attuale | Target | Priorita |
|----|-----|---------------|--------|----------|
| GF-1 | Filtro `tag_ids` su ES | Raise RuntimeError, fallback Postgres (`backends.py:601-604`) | Query ES nativa con keyword array | Alta |
| GF-2 | Filtro `assigned_to_id` su ES | Force fallback in service.py (`service.py:17-20`) | Query ES nativa con integer field | Alta |
| GF-3 | Filtro `in_state_since` su ES | Force fallback in service.py (`service.py:17-20`) | Query ES nativa con date range | Alta |
| GF-4 | Export oltre 5000 alert | Hardcoded `max_pages=50` * `page_size=100` (`views.py:718`) | search_after per paginazione illimitata | Alta |
| GF-5 | Rebuild con progress | `rebuild_alert_index()` senza progress (`service.py:56-66`) | Batch + progress log + percentage reporting | Media |
| GF-6 | Verify index integrity | Non esiste | Comando confronto count + campi critici DB vs ES | Media |

### Gap architetturali

| ID | Gap | Impatto | Priorita |
|----|-----|---------|----------|
| GA-1 | HTTP raw (urllib) senza connection pooling | Latenza sotto carico, no retry nativo, bulk API complessa da implementare | Alta — **DECISIONE ARCHITETTURALE RICHIESTA** |
| GA-2 | Nessun locking su rebuild concorrente | Data loss/inconsistenza se 2 rebuild corrono in parallelo | Alta |
| GA-3 | Alias versionati senza storage versione | Rotate command non operabile | Media |
| GA-4 | `ensure_index()` chiamato su ogni operazione | Overhead I/O; mapping drift se cambiato fuori banda | Media |
| GA-5 | SearchResult non trasporta metadati fallback | Frontend e operatori non vedono perche e scattato fallback | Media |

### Gap operativi/DevOps

| ID | Gap | Impatto | Priorita |
|----|-----|---------|----------|
| GO-1 | `readyz` senza check ES | K8s/LB non sa se ES e down, traffico search fallisce silenziosamente | Alta |
| GO-2 | `start.sh` non supporta ES | Onboarding sviluppatori richiede step manuale | Bassa |
| GO-3 | Nessun sizing model ES produzione | Cluster sottodimensionato o over-sharded | Alta per go-prod |
| GO-4 | Nessun ILM/retention policy | Indici crescono indefinitamente | Media |
| GO-5 | Nessun backup/snapshot indici | Perdita indice richiede rebuild completo (potenzialmente ore) | Media |
| GO-6 | Nessun alerting su fallback rate | Degrado ES passa inosservato | Alta |

### Gap sicurezza/compliance

| ID | Gap | Impatto | Priorita |
|----|-----|---------|----------|
| GS-1 | `xpack.security.enabled=false` in compose | Dev-only, ma rischio copy-paste in produzione | Media |
| GS-2 | Credenziali ES in URL potenzialmente in chiaro | Leakage via log, docker inspect | Alta per prod |
| GS-3 | Nessun test di tenant isolation su ES | Possibile data leakage cross-tenant | Alta |
| GS-4 | ES esposto su porta 9200 senza network policy | Accesso diretto al cluster | Alta per prod |

### Gap QA/CI

| ID | Gap | Impatto | Priorita |
|----|-----|---------|----------|
| GQ-1 | CI senza ES service | Zero coverage su backend Elastic | Alta |
| GQ-2 | Nessun test Elastic-specifico | Regressioni non rilevate | Alta |
| GQ-3 | Nessun test export > 5000 alert | Bug paginazione profonda non rilevati | Media |
| GQ-4 | Nessun test tenant isolation ES | Data leakage non rilevato | Alta |
| GQ-5 | Nessun test concorrenza sync/rebuild | Race condition non rilevate | Media |
| GQ-6 | Nessun test recovery post ES restart | Fallback non validato in condizioni reali | Media |

---

## D) Backlog implementativo migliorato

| ID | Task | File/Componente | Tipo | Dipendenze | Stima | Priorita | Owner |
|----|------|-----------------|------|------------|-------|----------|-------|
| T-00 | Decidere HTTP raw vs elasticsearch-py | ADR document | decision | — | 0.5gg | P0 | Backend+Arch |
| T-01 | Freeze Search Contract v1: snapshot filtri, sort, response shape | doc: search-contract.md | doc | — | 0.5gg | P0 | Backend |
| T-02 | Definire sizing model ES (shard/replica/RAM per volume alert) | doc: es-sizing.md | doc | — | 0.5gg | P0 | DevOps |
| T-03 | Aggiungere env vars nuove a settings.py | backend/socview/settings.py | config | T-00 | 0.25gg | P1 | Backend |
| T-04 | Aggiornare .env.example con tutte le variabili | .env.example | config | T-03 | 0.1gg | P1 | Backend |
| T-05 | Aggiungere healthcheck a docker-compose.elastic.yml | docker-compose.elastic.yml | config | — | 0.25gg | P1 | DevOps |
| T-06 | Aggiungere --with-elastic a start.sh | start.sh | config | T-05 | 0.25gg | P2 | DevOps |
| T-07 | Introdurre credenziali ES separate (user/pass/api-key) | settings.py, backends.py | update | T-03 | 0.5gg | P1 | Backend |
| T-08 | (Se elasticsearch-py) Migrare client da urllib a elasticsearch-py | backends.py | refactor | T-00 | 1.5gg | P0 | Backend |
| T-09 | Estendere mapping ES: tag_ids, assigned_to_id, state_since | backends.py:492 | update | T-08 | 0.5gg | P0 | Backend |
| T-10 | Aggiungere index settings configurabili (shards, replicas, refresh) | backends.py:492 | update | T-03 | 0.25gg | P1 | Backend |
| T-11 | Arricchire _build_doc con tag_ids, assigned_to_id, state_since, checksum | backends.py:527 | update | T-09 | 0.5gg | P0 | Backend |
| T-12 | Implementare filtri ES: tag_ids (terms query) | backends.py:598 | update | T-09, T-11 | 0.5gg | P0 | Backend |
| T-13 | Implementare filtri ES: assigned_to_id (term query) | backends.py:598 | update | T-09, T-11 | 0.25gg | P0 | Backend |
| T-14 | Implementare filtro ES: in_state_since (range query) | backends.py:598 | update | T-09, T-11 | 0.25gg | P0 | Backend |
| T-15 | Rimuovere forced fallback per assignee/in_state_since da service.py | service.py:17-20 | update | T-12, T-13, T-14 | 0.25gg | P0 | Backend |
| T-16 | Impostare track_total_hits=true | backends.py:691 | update | — | 0.1gg | P1 | Backend |
| T-17 | Implementare search_after per paginazione profonda | backends.py | update | T-16 | 1gg | P0 | Backend |
| T-18 | Refactor _collect_alert_ids_for_export con search_after | views.py:712-728 | update | T-17 | 0.5gg | P0 | Backend |
| T-19 | Aggiornare export_configurable per usare search_after | views.py:1347-1451 | update | T-18 | 0.25gg | P1 | Backend |
| T-20 | Cache health check con TTL 30s | backends.py:475 | update | — | 0.25gg | P2 | Backend |
| T-21 | Retry policy con exponential backoff (429/502/503/504) | backends.py:452 | update | T-08 | 0.5gg | P1 | Backend |
| T-22 | Bulk API per sync e rebuild | backends.py:548 | update | T-08 | 1gg | P1 | Backend |
| T-23 | Fallback osservabile: restituire metadati in SearchResult | service.py:15 | update | — | 0.5gg | P1 | Backend |
| T-24 | SEARCH_BACKEND_STRICT mode | service.py, settings.py | add | T-03 | 0.25gg | P1 | Backend |
| T-25 | Rebuild batch-aware con progress log | service.py:56 | update | T-22 | 0.5gg | P1 | Backend |
| T-26 | Spostare enqueue sync in transaction.on_commit | signals.py:130 | update | — | 0.5gg | P0 | Backend |
| T-27 | Dedupe key per burst update signals | signals.py | update | T-26 | 0.5gg | P1 | Backend |
| T-28 | Signal post_save/post_delete AlertTag -> reindex alert | signals.py | add | T-11 | 0.5gg | P0 | Backend |
| T-29 | Signal post_save/post_delete Assignment -> reindex alert | signals.py | add | T-11 | 0.5gg | P0 | Backend |
| T-30 | Signal state_change via AuditLog -> reindex alert | signals.py | add | T-11 | 0.5gg | P1 | Backend |
| T-31 | Rispettare SEARCH_INDEX_SYNC_ASYNC in nuovi signal handlers | signals.py | update | T-28, T-29, T-30 | 0.25gg | P1 | Backend |
| T-32 | Task batch: sync_alerts_index_batch_task | tasks.py | add | T-22 | 0.5gg | P1 | Backend |
| T-33 | Task: rebuild_alert_index_all_tenants_task | tasks.py | add | T-25 | 0.25gg | P1 | Backend |
| T-34 | Lock distribuito su rebuild per tenant | tasks.py | add | T-32 | 0.5gg | P0 | Backend |
| T-35 | Estendere response search con fallback metadata + query_time_ms | views.py:2003 | update | T-23 | 0.25gg | P1 | Backend |
| T-36 | Campo opzionale prefer_backend in request | serializers.py:450 | update | — | 0.1gg | P2 | Backend |
| T-37 | Endpoint GET /alerts/search/health/ | views.py, urls.py | add | T-23 | 0.5gg | P1 | Backend |
| T-38 | Check ES in readyz (degraded/strict) | core/views.py:95 | update | T-03 | 0.5gg | P1 | Backend |
| T-39 | Management command: rebuild_search_index | management/commands/ | add | T-25, T-34 | 1gg | P1 | Backend |
| T-40 | Management command: verify_search_index | management/commands/ | add | T-11 | 1gg | P1 | Backend |
| T-41 | Management command: rotate_search_index (alias swap) | management/commands/ | add | T-09 | 1gg | P2 | Backend |
| T-42 | Management command: purge_search_index | management/commands/ | add | — | 0.25gg | P2 | Backend |
| T-43 | Tabella SearchIndexVersion per alias versioning | models.py (public schema) | add | T-41 | 0.5gg | P2 | Backend |
| T-44 | Estendere SearchResponse type con diagnostica | frontend/src/types/alerts.ts | update | T-35 | 0.25gg | P1 | Frontend |
| T-45 | Componente SearchBackendBadge riusabile | frontend/src/components/ | add | T-44 | 0.5gg | P1 | Frontend |
| T-46 | Integrare badge in ActiveAlarmsPage | ActiveAlarmsPage.tsx | update | T-45 | 0.1gg | P2 | Frontend |
| T-47 | Integrare badge in CustomerAlarmsPage | CustomerAlarmsPage.tsx | update | T-45 | 0.1gg | P2 | Frontend |
| T-48 | Integrare badge in TenantPage | TenantPage.tsx | update | T-45 | 0.1gg | P2 | Frontend |
| T-49 | Supportare nuovi campi diagnostici in alertsApi.ts | alertsApi.ts | update | T-44 | 0.1gg | P2 | Frontend |
| T-50 | Job CI con ES service | .github/workflows/ci.yml | config | T-05 | 0.5gg | P1 | DevOps |
| T-51 | Test suite ES-specifica: filtri, mapping, sync | tests_search_elastic.py | add | T-12-T-14 | 2gg | P0 | QA |
| T-52 | Test fallback + strict mode | tests_search_fallback.py | add | T-23, T-24 | 0.5gg | P1 | QA |
| T-53 | Test management commands | tests_search_commands.py | add | T-39-T-42 | 1gg | P1 | QA |
| T-54 | Test tenant isolation su ES | tests_search_elastic.py | add | T-51 | 0.5gg | P0 | QA |
| T-55 | Test export > 5000 alert con search_after | tests_search_elastic.py | add | T-18 | 0.5gg | P1 | QA |
| T-56 | Test concorrenza sync/rebuild | tests_search_elastic.py | add | T-34 | 0.5gg | P1 | QA |
| T-57 | Runbook ops.md completo | docs/ops.md | doc | T-39-T-42 | 0.5gg | P1 | DevOps |
| T-58 | Doc architettura ES | docs/elasticsearch-architecture.md | doc | T-09, T-41 | 0.5gg | P2 | Backend |
| T-59 | Runbook incident response | docs/elasticsearch-runbook.md | doc | T-38, T-39 | 0.5gg | P2 | DevOps |
| T-60 | Doc sicurezza ES | docs/elasticsearch-security.md | doc | T-07 | 0.25gg | P2 | DevOps |

**Totale stimato**: ~24-28 giorni uomo (vs 12.5 del report originale)

---

## E) Piano d'azione migliorato

### Fase 0: Decisioni architetturali e contratto (1.5gg)

**Obiettivo**: Risolvere le decisioni bloccanti e congelare il contratto API search.

**Deliverable**:
- ADR: HTTP raw vs elasticsearch-py (T-00)
- Search Contract v1 (T-01)
- ES sizing model (T-02)

**Exit criteria**:
- Decisione client ES documentata e approvata
- Contratto API search congelato con test di snapshot
- Sizing target per dev/staging/prod definito

**Rischi fase**: Decisione client ES puo cambiare significativamente effort Fase 1-2.
**Mitigazione**: Valutare impatto su bulk API, retry, connection pooling per entrambe le opzioni prima di decidere.

---

### Fase 1: Fondazione infra e sicurezza (1.5gg)

**Obiettivo**: Rendere l'infrastruttura ES bootstrappabile in modo sicuro e configurabile.

**Deliverable**:
- Settings.py con nuove env vars (T-03, T-04)
- Credenziali ES separate (T-07)
- docker-compose.elastic.yml con healthcheck (T-05)
- start.sh con --with-elastic (T-06)
- (Se deciso in Fase 0) Migrazione a elasticsearch-py (T-08)

**Exit criteria**:
- `docker compose -f ... up -d` avvia ES con healthcheck verde
- `start.sh --with-elastic` funziona end-to-end
- Credenziali non in URL

**Rischi fase**: Migrazione client (T-08) puo avere impatto superiore al previsto su tutto backends.py.
**Mitigazione**: Se T-08 e scelto, eseguirlo come primo task con test di regressione Postgres immediato.

---

### Fase 2: Mapping, filtri e paginazione (4gg)

**Obiettivo**: Raggiungere parita filtri al 100% e paginazione profonda.

**Deliverable** (2a — mapping + filtri, 2gg):
- Mapping esteso (T-09, T-10)
- _build_doc arricchito (T-11)
- Filtri ES: tag_ids, assigned_to_id, in_state_since (T-12, T-13, T-14)
- Rimozione forced fallback (T-15)
- track_total_hits (T-16)

**Deliverable** (2b — paginazione, 2gg):
- search_after implementation (T-17)
- Export refactor (T-18, T-19)
- Health check cache (T-20)
- Retry policy (T-21)

**Exit criteria**:
- Tutti i filtri del Search Contract v1 funzionano su ES senza fallback forzato
- Export restituisce dataset > 5000 alert correttamente
- Zero regressioni su test Postgres esistenti

**Rischi fase**: search_after richiede stateless pagination (niente session state). Sort uniqueness su `id` va garantita.
**Mitigazione**: Test con dataset 10k alert, verifica assenza duplicati/gap in export.

---

### Fase 3: Sync pipeline e consistenza (4gg)

**Obiettivo**: Garantire consistenza near-real-time indice-DB su tutte le mutate.

**Deliverable**:
- on_commit migration (T-26)
- Dedupe burst (T-27)
- Signal AlertTag (T-28)
- Signal Assignment (T-29)
- Signal state_change (T-30)
- Rispetto SYNC_ASYNC flag (T-31)
- Bulk API (T-22)
- Batch task (T-32, T-33)
- Lock distribuito rebuild (T-34)

**Exit criteria**:
- Aggiunta/rimozione tag su alert -> ES aggiornato entro 5s
- Assignment alert -> ES aggiornato entro 5s
- Cambio stato alert -> ES aggiornato entro 5s
- Rebuild non corrompe indice sotto sync concorrente
- Test sync funzionano sia con SYNC_ASYNC=true che =false

**Rischi fase**: Signal su AlertTag con cascade delete puo generare burst eccessivo. AuditLog signal richiede pattern matching su action string.
**Mitigazione**: Dedupe key + batch window 1s su Celery. Per AuditLog, filtrare solo action="alert.state_changed" nel signal handler.

---

### Fase 4: API diagnostica e observability (1.5gg)

**Obiettivo**: Rendere visibile lo stato del backend search a operatori e frontend.

**Deliverable**:
- Fallback metadata in SearchResult (T-23)
- STRICT mode (T-24)
- Response search estesa (T-35)
- prefer_backend debug (T-36)
- Endpoint /search/health/ (T-37)
- readyz con ES check (T-38)

**Exit criteria**:
- Response search include `effective_backend`, `fallback`, `fallback_reason`, `query_time_ms`
- /search/health/ restituisce stato indice, doc count, lag
- readyz riporta ES status (degraded se down, not_ready se STRICT)

**Rischi fase**: Basso. Modifiche additive, nessun breaking change.
**Mitigazione**: Feature flag su diagnostica verbose per evitare payload bloat in produzione.

---

### Fase 5: Tooling gestione indice (2gg)

**Obiettivo**: Fornire comandi operativi per lifecycle indice.

**Deliverable**:
- rebuild_search_index command (T-39)
- verify_search_index command (T-40)
- rotate_search_index command (T-41)
- purge_search_index command (T-42)
- SearchIndexVersion model (T-43)
- Rebuild batch-aware con progress (T-25)

**Exit criteria**:
- `manage.py rebuild_search_index --schema tenant1 --batch-size 500` completa con progress log
- `manage.py verify_search_index --schema tenant1 --sample 100` riporta discrepanze
- `manage.py rotate_search_index --schema tenant1` esegue alias swap atomico
- Nessun downtime search durante rotate

**Rischi fase**: Alias swap richiede che il nuovo indice sia completamente popolato prima dello swap. Timeout su tenant con milioni di alert.
**Mitigazione**: Rotate deve: (1) creare indice v(n+1), (2) rebuild nel nuovo indice, (3) swap alias, (4) drop v(n) solo dopo verifica. Timeout configurabile per batch.

---

### Fase 6: Frontend (1gg)

**Obiettivo**: Rendere visibile backend effettivo e diagnostica nell'UI.

**Deliverable**:
- SearchResponse type esteso (T-44)
- SearchBackendBadge componente (T-45)
- Integrazione nelle 3 pagine (T-46, T-47, T-48)
- alertsApi.ts aggiornato (T-49)

**Exit criteria**:
- Badge visibile su ActiveAlarms, CustomerAlarms, TenantPage
- Tooltip mostra fallback_reason quando presente
- Nessun breaking change su pagine esistenti

**Rischi fase**: Basso.
**Mitigazione**: Componente condiviso previene drift.

---

### Fase 7: CI, test e quality gates (4gg)

**Obiettivo**: Garantire coverage automatica su backend Elastic.

**Deliverable**:
- CI con ES service (T-50)
- Test suite ES (T-51)
- Test tenant isolation (T-54)
- Test fallback/strict (T-52)
- Test commands (T-53)
- Test export large (T-55)
- Test concorrenza (T-56)

**Exit criteria**:
- CI green con ES service
- Coverage filtri ES >= 90%
- Test tenant isolation passa (2+ tenant, zero leakage)
- Test export 10k alert senza duplicati/gap

**Rischi fase**: ES in CI aggiunge ~30s al tempo di setup job. Test concorrenza possono essere flaky.
**Mitigazione**: ES service con tmpfs per velocita. Test concorrenza con retry tolerance annotata.

---

### Fase 8: Documentazione (1gg)

**Obiettivo**: Documentazione operativa completa.

**Deliverable**: T-57, T-58, T-59, T-60

**Exit criteria**: Runbook copre deploy, rebuild, rotate, rollback, incident response, hardening.

---

### Fase 9: Rollout staging (1.5gg)

**Obiettivo**: Validazione end-to-end su ambiente reale.

**Deliverable**:
- Deploy staging con SEARCH_BACKEND=auto
- Rebuild indice completo
- Verifica parita su casi reali
- Go/no-go checklist

**Exit criteria**:
- Fallback rate < 1% su staging
- Latenza p99 search ES <= 2x latenza Postgres
- Zero data leakage in verifica manuale
- Export completo su tenant piu grande

**Rischi fase**: Dati reali possono esporre edge case non coperti da test sintetici.
**Mitigazione**: verify_search_index su tutti i tenant staging prima di go/no-go.

---

### Fase 10: Rollout produzione (1.5gg)

**Obiettivo**: Go-live controllato.

**Deliverable**:
- Deploy con fallback abilitato
- Rebuild per tenant a finestre
- Monitoraggio 24h
- Passaggio a strict opzionale post-stabilizzazione

**Exit criteria**:
- Rebuild completato su tutti i tenant
- Fallback rate < 0.5% per 24h
- Zero alert di sicurezza
- Rollback testato e documentato

---

### Fase 11: Hardening (1gg)

**Obiettivo**: Ottimizzazione post-go-live.

**Deliverable**:
- Tuning mapping/analyzer
- ILM policy
- Riduzione fallback
- Assetto definitivo

**Exit criteria**:
- Fallback solo su errori ES (non su gap filtri)
- ILM attivo
- Documentazione aggiornata con lesson learned

---

**Totale piano**: ~24.5 giorni (range 22-28)

---

## F) Report v2 completo

---

# Documento di Progettazione: Implementazione Elasticsearch in SocView

**Versione**: 2.0
**Data**: 6 marzo 2026
**Stato**: Proposta tecnica revisionata — nessuna modifica codice eseguita
**Revisore**: Principal Staff Engineer

---

## Executive Summary

SocView dispone di un'integrazione Elasticsearch parziale ma funzionale. Il backend search astratto, il backend ES, il fallback a Postgres, la sync su alert save/delete e la selezione automatica del backend sono gia implementati. I gap principali sono: (1) tre filtri non supportati su ES (tag_ids, assigned_to_id, in_state_since) che forzano fallback silenzioso a Postgres, (2) paginazione profonda limitata a 5000 risultati per l'export, (3) nessun signal di sync per mutate indirette (tag, assignment, state change), (4) zero test coverage su ES in CI, (5) nessun tooling operativo per gestione lifecycle indice.

Il progetto propone di portare l'integrazione ES a production-readiness in ~24.5 giorni uomo distribuiti su 11 fasi, con rollback garantito a Postgres in qualsiasi momento via configurazione.

**Decisione architetturale bloccante**: migrare il client HTTP da urllib raw a `elasticsearch-py` oppure mantenere l'approccio custom. Questa decisione impatta effort e complessita di Fase 1-3.

---

## 1. Baseline tecnica (AS-IS)

Tutti i riferimenti sono verificati contro il codebase al 6 marzo 2026.

### 1.1 Infrastruttura e configurazione

| # | Componente | File | Stato |
|---|-----------|------|-------|
| 1 | Configurazione ES in settings | `backend/socview/settings.py:184-191` | SEARCH_BACKEND, ELASTICSEARCH_URL, INDEX_PREFIX, TIMEOUT, SYNC_ENABLED, SYNC_ASYNC |
| 2 | Variabili env documentate | `.env.example:41-47` | 6 variabili sotto sezione "Search (M4)" |
| 3 | Container ES separato | `docker-compose.elastic.yml:1-17` | ES 8.15.2, single-node, xpack.security=false, 512MB heap |
| 4 | Doc operativa minima | `docs/ops.md:17-28` | Comando per avvio con ES, nota su procedura base senza ES |
| 5 | start.sh standard | `start.sh:49` | Non include compose ES |

### 1.2 Backend search

| # | Componente | File | Stato |
|---|-----------|------|-------|
| 6 | Backend astratto | `backend/tenant_data/search/backends.py:256` | `BaseSearchBackend` con search(), ensure_index(), sync_alert(), remove_alert() |
| 7 | Backend Postgres | `backend/tenant_data/search/backends.py:277-402` | Full filter support incluso tag_ids, assignee, in_state_since. FTS con SearchVector/SearchQuery |
| 8 | Backend Elastic | `backend/tenant_data/search/backends.py:438-704` | HTTP raw via urllib. Mapping base senza tag_ids/assignee/state_since. Dynamic filters implementati con nested queries |
| 9 | Selezione backend | `backend/tenant_data/search/backends.py:707-720` | auto/postgres/elastic. Auto: prova ES, fallback Postgres |
| 10 | Servizio search | `backend/tenant_data/search/service.py:15-27` | Fallback automatico su exception. Forced fallback per assigned_to_id e in_state_since |
| 11 | Rebuild | `backend/tenant_data/search/service.py:56-66` | Per singolo tenant, non batch, senza progress |

### 1.3 Sync pipeline

| # | Componente | File | Stato |
|---|-----------|------|-------|
| 12 | Signal alert save | `backend/tenant_data/signals.py:130-137` | post_save -> enqueue sync (rispetta SYNC_ENABLED e SYNC_ASYNC) |
| 13 | Signal alert delete | `backend/tenant_data/signals.py:171-173` | post_delete -> enqueue delete |
| 14 | Task sync singolo | `backend/tenant_data/tasks.py:52-55` | sync_alert_index_task(schema_name, alert_id) |
| 15 | Task delete singolo | `backend/tenant_data/tasks.py:57-60` | delete_alert_index_task(schema_name, alert_id) |
| 16 | Task rebuild | `backend/tenant_data/tasks.py:62-65` | rebuild_alert_index_task(schema_name) |

### 1.4 API e frontend

| # | Componente | File | Stato |
|---|-----------|------|-------|
| 17 | Endpoint search | `backend/tenant_data/views.py:2003-2082` | POST /alerts/search/ con AlertSearchRequestSerializer |
| 18 | Serializer search | `backend/tenant_data/serializers.py:450-502` | Tutti i filtri, page_size max 100, validazione range date |
| 19 | Export configurable | `backend/tenant_data/views.py:1347-1451` | POST /alerts/export-configurable/ con serializer dedicato (559-563) |
| 20 | Paginazione export | `backend/tenant_data/views.py:712-728` | max_pages=50, loop su pagine, max 5000 alert |
| 21 | Frontend search API | `frontend/src/services/alertsApi.ts:111-116` | POST /alerts/search/, tipo SearchResponse |
| 22 | Frontend tipo risposta | `frontend/src/types/alerts.ts:266-272` | backend, count, page, page_size, results |
| 23 | Frontend badge backend | `frontend/src/pages/ActiveAlarmsPage.tsx:488-505` | Mostra response.backend |

### 1.5 Health e CI

| # | Componente | File | Stato |
|---|-----------|------|-------|
| 24 | readyz | `backend/core/views.py:95-136` | Check: database, cache, celery. NO Elasticsearch |
| 25 | CI backend | `.github/workflows/ci.yml:48-83` | PostgreSQL + Redis. NO Elasticsearch service |
| 26 | Test search | `backend/tenant_data/tests.py:1071+` | `@override_settings(SEARCH_BACKEND="postgres")` — solo Postgres |

### 1.6 Modelli rilevanti

| Modello | File | Relazione ES |
|---------|------|-------------|
| Alert | `models.py` | Documento principale indicizzato |
| AlertTag | `models.py:239-249` | M2M alert-tag, non sincronizzato su ES |
| Assignment | `models.py:251-273` | OneToOne alert-user, non sincronizzato su ES |
| AuditLog | `models.py` | Contiene state changes, non sincronizzato su ES |
| Tag | `models.py` | Riferimento da AlertTag |

---

## 2. Gap Analysis (AS-IS vs TO-BE)

### 2.1 Gap filtri ES

| Filtro | Postgres | Elastic | Gap |
|--------|----------|---------|-----|
| customer_id | OK | OK | — |
| source_names | OK | OK | — |
| state_ids | OK | OK | — |
| severities | OK | OK | — |
| alert_types | OK | OK | — |
| text (full-text) | OK | OK | — |
| event_timestamp range | OK | OK | — |
| is_active | OK | OK | — |
| dynamic_filters | OK | OK (nested queries) | — |
| **tag_ids** | OK | **RuntimeError -> fallback** | **GAP** |
| **assigned_to_id** | OK | **Forced fallback in service.py** | **GAP** |
| **in_state_since** | OK | **Forced fallback in service.py** | **GAP** |

### 2.2 Gap sync pipeline

| Evento | Sync ES | Gap |
|--------|---------|-----|
| Alert create/update | OK (signal post_save) | Signal non in on_commit — rischio index transazione non committata |
| Alert delete | OK (signal post_delete) | — |
| AlertTag add/remove | **NO** | Alert in ES ha tag_ids stale |
| Assignment create/update/delete | **NO** | Alert in ES ha assigned_to_id stale |
| State change (via AuditLog) | **NO** | Alert in ES ha state_since stale |

### 2.3 Gap operativi

| Area | Gap |
|------|-----|
| readyz | Non include ES |
| Management commands | Solo `backfill_customers`, nessun comando search/index |
| Rebuild | Per singolo tenant, non batch, senza progress |
| Verify | Non esiste |
| Rotate/alias | Non esiste |
| Sizing | Non definito |
| ILM | Non esiste |
| Backup indici | Non esiste |

### 2.4 Gap sicurezza

| Area | Gap |
|------|-----|
| Auth ES | `xpack.security.enabled=false` |
| TLS | Non configurato |
| Credenziali | In URL, non separate |
| Network policy | ES esposto su 9200 |
| Tenant isolation test | Non esiste |

### 2.5 Gap CI/QA

| Area | Gap |
|------|-----|
| ES in CI | Non presente |
| Test ES backend | Non esistono |
| Test tenant isolation | Non esistono |
| Test export large | Non esistono |
| Test concorrenza | Non esistono |

---

## 3. Funzionalita target (TO-BE)

1. **Parita filtri 100%**: Tutti i filtri del Search Contract funzionano su ES senza fallback forzato funzionale.
2. **Paginazione profonda**: search_after per export illimitato (eliminazione max_pages=50).
3. **Sync completa**: Near-real-time su alert save/delete/tag/assignment/state_change, con on_commit e dedupe.
4. **Locking rebuild**: No race condition tra rebuild e sync concorrente.
5. **Observability**: Fallback metadata in response, endpoint /search/health/, readyz con ES, logging strutturato.
6. **Tooling**: Comandi rebuild, verify, rotate, purge.
7. **Sicurezza**: Auth/TLS/credenziali separate/network policy per produzione.
8. **CI**: ES in CI, test suite dedicata, test tenant isolation.
9. **Frontend**: Badge backend effettivo con tooltip reason, componente condiviso.
10. **Rollback**: Postgres immediato via SEARCH_BACKEND=postgres, nessuna modifica schema.

---

## 4. Decisione architetturale bloccante: Client HTTP

**Stato attuale**: `backends.py` usa `urllib.request.urlopen` diretto (linee 440-470).

**Opzione A — Migrare a elasticsearch-py**:
- Pro: connection pooling nativo, bulk helpers, retry built-in, search_after support, community maintained
- Contro: +1.5gg effort migrazione, nuova dipendenza
- Impatto: semplifica T-17, T-21, T-22 significativamente

**Opzione B — Mantenere HTTP raw**:
- Pro: zero dipendenze aggiuntive, controllo totale
- Contro: bulk API da implementare manualmente, connection pooling da aggiungere, retry custom, manutenzione a carico del team
- Impatto: +2-3gg su T-17, T-21, T-22

**Raccomandazione**: Opzione A. Il costo di migrazione (1.5gg) e recuperato e superato dalla semplificazione di bulk, retry e search_after.

---

## 5. Catalogo modifiche previste

### 5.1 Backend Search Core (`backend/tenant_data/search/backends.py`)

| # | Modifica | Linea/Area | Dettaglio |
|---|---------|-----------|----------|
| 1 | Migrazione client (se Opzione A) | 440-470 | Sostituire urllib con `Elasticsearch()` client |
| 2 | Mapping esteso | 492 | Aggiungere: `tag_ids` (integer array), `assigned_to_id` (integer), `state_since` (date) |
| 3 | Index settings configurabili | 492 | shards, replicas, refresh_interval da settings |
| 4 | _build_doc arricchito | 527 | tag_ids da alert.alert_tags, assigned_to_id da alert.assignment, state_since da ultimo AuditLog, checksum |
| 5 | Filtro tag_ids | 598-604 | Rimuovere RuntimeError, implementare terms query su tag_ids |
| 6 | Filtro assigned_to_id | post-598 | term query su assigned_to_id |
| 7 | Filtro in_state_since | post-598 | range query su state_since |
| 8 | track_total_hits | 691 | Aggiungere `"track_total_hits": true` al payload |
| 9 | search_after | 691+ | Implementare modalita search_after per paginazione profonda (usata da export) |
| 10 | Health check cache | 475 | TTL 30s su is_available(), invalidazione su ConnectionError |
| 11 | Retry policy | 452 | Backoff esponenziale su 429/502/503/504 |
| 12 | Bulk API | 548 | Metodo bulk_sync_alerts(alert_ids) per batch indexing |

### 5.2 Servizio search (`backend/tenant_data/search/service.py`)

| # | Modifica | Linea/Area | Dettaglio |
|---|---------|-----------|----------|
| 13 | Fallback osservabile | 15-27 | SearchResult esteso con fallback, fallback_reason, requested_backend, effective_backend |
| 14 | Rimuovere forced fallback | 17-20 | Eliminare condizione su assigned_to_id/in_state_since (post implementazione filtri ES) |
| 15 | STRICT mode | 15 | Se SEARCH_BACKEND_STRICT=true, raise su fallback invece di degradare |
| 16 | Rebuild batch + progress | 56-66 | Batch con configurable size, progress log percentuale, supporto --since |

### 5.3 Sync pipeline (`backend/tenant_data/signals.py`)

| # | Modifica | Linea/Area | Dettaglio |
|---|---------|-----------|----------|
| 17 | on_commit | 130 | Spostare `_enqueue_sync` dentro `transaction.on_commit()` |
| 18 | Dedupe burst | 130 | Cache key con TTL breve per evitare re-index multipli sullo stesso alert |
| 19 | Signal AlertTag | nuovo | post_save/post_delete su AlertTag -> reindex alert.id. Rispettare SYNC_ENABLED e SYNC_ASYNC |
| 20 | Signal Assignment | nuovo | post_save/post_delete su Assignment -> reindex alert.id |
| 21 | Signal state_change | nuovo | post_save su AuditLog con action="alert.state_changed" -> reindex alert correlato |

### 5.4 Task Celery (`backend/tenant_data/tasks.py`)

| # | Modifica | Linea/Area | Dettaglio |
|---|---------|-----------|----------|
| 22 | Task batch | nuovo | sync_alerts_index_batch_task(schema_name, alert_ids) |
| 23 | Task rebuild all tenants | nuovo | rebuild_alert_index_all_tenants_task() con loop Client.objects.exclude(schema_name='public') |
| 24 | Lock distribuito rebuild | nuovo | Redis lock per tenant durante rebuild, sync in coda |

### 5.5 API (`backend/tenant_data/views.py`, `serializers.py`, `urls.py`)

| # | Modifica | Linea/Area | Dettaglio |
|---|---------|-----------|----------|
| 25 | Response search estesa | views.py:2064-2082 | Aggiungere fallback, fallback_reason, effective_backend, query_time_ms |
| 26 | prefer_backend param | serializers.py:450 | Campo opzionale per debug (auto/postgres/elastic) |
| 27 | Export search_after | views.py:712-728 | Sostituire loop pagine con search_after, rimuovere max_pages |
| 28 | Export configurable aggiornato | views.py:1347+ | Allineare a nuova paginazione search_after |
| 29 | Endpoint /search/health/ | views.py + urls.py | GET con stato backend, indice, doc_count, lag stimato |

### 5.6 Configurazione (`settings.py`, `.env.example`)

| # | Modifica | Dettaglio |
|---|---------|----------|
| 30 | Nuove env vars | SEARCH_BACKEND_STRICT, ELASTICSEARCH_RETRIES, ELASTICSEARCH_BACKOFF_MS, ELASTICSEARCH_SHARDS, ELASTICSEARCH_REPLICAS, ELASTICSEARCH_REFRESH_INTERVAL, ELASTICSEARCH_BULK_BATCH_SIZE, ELASTICSEARCH_USER, ELASTICSEARCH_PASSWORD |
| 31 | .env.example | Documentare tutte le nuove variabili con valori dev e prod consigliati |

### 5.7 Operativita (`docker-compose.elastic.yml`, `start.sh`, `core/views.py`)

| # | Modifica | Dettaglio |
|---|---------|----------|
| 32 | Compose ES | Healthcheck, supporto auth opzionale, limiti memoria configurabili |
| 33 | start.sh | Parametro --with-elastic o env ENABLE_ELASTIC=true |
| 34 | readyz | Check ES con modalita degraded (default) e strict (configurabile) |

### 5.8 Management commands (`backend/tenant_data/management/commands/`)

| # | Comando | Dettaglio |
|---|---------|----------|
| 35 | rebuild_search_index | --schema <tenant/all> --batch-size N --since <date>. Con lock e progress log |
| 36 | verify_search_index | --schema <tenant/all> --sample N. Confronto count + campi critici DB vs ES |
| 37 | rotate_search_index | --schema <tenant>. Crea indice v(n+1), rebuild, alias swap, drop v(n) dopo verifica |
| 38 | purge_search_index | --schema <tenant>. Cleanup controllato |

### 5.9 Frontend

| # | Modifica | File | Dettaglio |
|---|---------|------|----------|
| 39 | Tipo SearchResponse esteso | types/alerts.ts | fallback, fallback_reason, effective_backend, query_time_ms |
| 40 | Componente SearchBackendBadge | components/SearchBackendBadge.tsx | Badge + tooltip riusabile |
| 41 | Integrazione ActiveAlarmsPage | ActiveAlarmsPage.tsx | Import e uso SearchBackendBadge |
| 42 | Integrazione CustomerAlarmsPage | CustomerAlarmsPage.tsx | Idem |
| 43 | Integrazione TenantPage | TenantPage.tsx | Idem |
| 44 | alertsApi.ts | alertsApi.ts | Passare nuovi campi diagnostici |

### 5.10 CI/CD (`.github/workflows/ci.yml`)

| # | Modifica | Dettaglio |
|---|---------|----------|
| 45 | ES service in CI | Aggiungere elasticsearch:8.15.2 come service con xpack.security.enabled=false |
| 46 | Test ES dedicati | tests_search_elastic.py: filtri, mapping, sync, tenant isolation |
| 47 | Test fallback | tests_search_fallback.py: degradation, strict mode |
| 48 | Test commands | tests_search_commands.py: rebuild, verify, rotate, purge |
| 49 | Test export large | Test con >5000 alert, verifica completezza |
| 50 | Test concorrenza | Sync + rebuild parallelo, verifica consistenza |

### 5.11 Documentazione

| # | Documento | Contenuto |
|---|----------|----------|
| 51 | docs/ops.md aggiornato | Runbook deploy/health/rebuild/rollback completo |
| 52 | docs/elasticsearch-architecture.md | Mapping, alias, versioning, multi-tenant, sizing |
| 53 | docs/elasticsearch-runbook.md | Incident response, recovery playbook |
| 54 | docs/elasticsearch-security.md | Hardening, credenziali, TLS, rete |

---

## 6. Stime effort

| Fase | Descrizione | Giorni | Note |
|------|------------|--------|------|
| 0 | Decisioni architetturali + contratto | 1.5 | Bloccante per tutto il resto |
| 1 | Infra + sicurezza + (migrazione client) | 1.5 | +1.5gg se migrazione elasticsearch-py |
| 2 | Mapping + filtri + paginazione | 4 | Split: 2a filtri (2gg) + 2b paginazione (2gg) |
| 3 | Sync pipeline + consistenza | 4 | 5 signal handlers + bulk + lock |
| 4 | API diagnostica + observability | 1.5 | Additive, basso rischio |
| 5 | Tooling gestione indice | 2 | 4 management commands |
| 6 | Frontend | 1 | Componente condiviso + 3 integrazioni |
| 7 | CI + test | 4 | Suite completa con ES in CI |
| 8 | Documentazione | 1 | 4 documenti |
| 9 | Rollout staging | 1.5 | Validazione end-to-end |
| 10 | Rollout produzione | 1.5 | Go-live controllato |
| 11 | Hardening | 1 | Post-go-live |
| **Totale** | | **24.5** | **Range: 22-28 giorni** |

---

## 7. Rischi e mitigazioni

| # | Rischio | Probabilita | Impatto | Mitigazione |
|---|---------|-------------|---------|------------|
| R1 | Race condition rebuild/sync concorrente | Alta | Data loss | Lock distribuito Redis per tenant (T-34). Rebuild disabilita sync o usa alias swap |
| R2 | Incoerenza indice su mutate indirette | Alta | Risultati search errati | Signal dedicati AlertTag/Assignment/state_change (T-28-30) + verify command (T-40) |
| R3 | Fallback invisibile in produzione | Media | Degrado non rilevato | Metadata fallback in response (T-23) + metriche + alerting su fallback rate |
| R4 | Regressione export large | Media | Export incompleto | search_after (T-17) + test con dataset >5000 (T-55) |
| R5 | Mapping evolution breaking | Bassa | Downtime search | Alias versionati + rotate command (T-41) + SearchIndexVersion model (T-43) |
| R6 | Memory pressure ES in produzione | Media | Cluster instabile | Sizing model in Fase 0 (T-02), monitoring JVM heap, circuit breaker |
| R7 | Signal burst su operazioni bulk | Media | Redis/Celery overload | Dedupe key con TTL (T-27) + batch task (T-32) |
| R8 | Connection pooling assente (se HTTP raw) | Alta se Opzione B | Latenza sotto carico | Migrazione elasticsearch-py (Opzione A) o connection pool custom |
| R9 | Split-brain su rotate index | Bassa | Risultati inconsistenti | Alias swap atomico, verifica post-swap, drop vecchio indice solo dopo conferma |
| R10 | Sicurezza cluster ES in produzione | Alta | Data breach | Auth + TLS + network policy + credenziali separate (T-07) |

---

## 8. Piano rollback

**Prerequisiti**: Nessuna modifica allo schema DB applicativo. ES e un indice secondario derivato.

| Step | Azione | Tempo | Impatto |
|------|--------|-------|---------|
| 1 | `SEARCH_BACKEND=postgres` | Deploy config (secondi) | Search torna a Postgres immediatamente |
| 2 | `SEARCH_INDEX_SYNC_ENABLED=false` | Deploy config (secondi) | Stop sync verso ES (utile se cluster instabile) |
| 3 | Mantenere container ES up | — | Per analisi post-mortem e confronto dati |
| 4 | Conservare indici | — | Per forensic, verify command, analisi discrepanze |
| 5 | Ripristinare `auto` | Solo dopo: root cause fix + verify_search_index positivo + test green | Search torna a ES |

**Nota**: Il rollback non richiede migrazione dati, downtime applicativo o modifica schema. La fonte di verita resta PostgreSQL.

---

## 9. Criteri di accettazione

| # | Criterio | Metodo di verifica |
|---|----------|-------------------|
| AC-1 | Tutti i filtri Search Contract funzionano su ES senza fallback forzato funzionale | Test suite ES (T-51) green, fallback_reason mai "unsupported_filter" |
| AC-2 | Export configurable restituisce dataset completi su cardinalita > 5000 | Test export large (T-55), verify count DB vs export rows |
| AC-3 | Rebuild tenant/all tenant con progress e lock | Management command (T-39) eseguibile, progress visibile, no race condition |
| AC-4 | Sync near-real-time su tag/assignment/state_change | Test integrazione: modifica tag -> ES aggiornato entro 5s |
| AC-5 | Frontend mostra backend effettivo e fallback reason | Verifica manuale + test E2E su 3 pagine |
| AC-6 | readyz riporta stato ES | Test (T-38): ES up -> ready, ES down -> degraded, STRICT + ES down -> not_ready |
| AC-7 | CI include test ES e fallback | CI green con ES service (T-50) |
| AC-8 | Rollback a Postgres immediato via config | Test: cambiare SEARCH_BACKEND=postgres, verificare search funzionante |
| AC-9 | Tenant isolation verificata | Test (T-54): 2 tenant, zero leakage cross-tenant |
| AC-10 | Latenza p99 search ES <= 2x Postgres su staging | Benchmark su staging con dati reali |

---

## G) Open questions

Ordinate per impatto decrescente.

| # | Domanda | Impatto | Bloccante per |
|---|---------|---------|---------------|
| OQ-1 | **Client HTTP raw vs elasticsearch-py?** Decidere prima di iniziare Fase 1. Impatta effort e complessita di bulk, retry, search_after, connection pooling. | Alto — differenza di 2-3gg effort e complessita manutenzione | Fase 1, 2, 3 |
| OQ-2 | **Volume alert atteso per tenant in produzione?** Necessario per sizing shards/replicas e per stimare tempo rebuild. Con 1M alert/tenant e 50 tenant = 50M documenti, il modello cambia. | Alto — sizing model e sharding strategy | Fase 0 |
| OQ-3 | **Latenza target p99 per search?** Il report non specifica SLA. Postgres attuale potrebbe gia soddisfare i requisiti. ES ha senso solo se serve latenza <100ms su query complesse o full-text migliore. | Alto — giustificazione stessa del progetto | Fase 0 |
| OQ-4 | **Il modello AuditLog ha un campo action standardizzato?** Il signal per state_change (T-30) filtra su `action="alert.state_changed"` — ASSUNZIONE non verificata. Se AuditLog usa formato diverso, il signal va adattato. | Medio | Fase 3 |
| OQ-5 | **Esiste un ambiente di staging?** Il piano prevede Fase 9 su staging, ma non e verificato se l'ambiente esiste e se ha dati rappresentativi. | Medio | Fase 9 |
| OQ-6 | **Assignment e OneToOneField — puo essere NULL?** `models.py:251-273` mostra `assigned_to=ForeignKey(null=True)`. Se l'assignment non esiste, `alert.assignment` raises `RelatedObjectDoesNotExist`. _build_doc deve gestire questo caso. | Medio | Fase 2 (T-11) |
| OQ-7 | **Politica retention alert?** Se esiste ILM o retention policy pianificata, impatta la strategia indice ES (time-based vs append-only). | Basso | Fase 11 |

---

*Fine del documento di review.*
