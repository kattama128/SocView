# SocView — Test Report

**Data:** 2026-03-04 22:54:30 CET
**Commit:** bfcb1cb

## Risultati

| Suite | Totale | Passati | Falliti | Skippati |
|---|---:|---:|---:|---:|
| Backend Django | 78 | 78 | 0 | 0 |
| Frontend Lint | 0 errori | - | 0 | - |
| TypeScript | 0 errori | - | 0 | - |
| Playwright E2E (`socview_full.spec.ts`) | 60 | 60 | 0 | 0 |

## Test Skippati (con motivazione)

Nessuno.

## Fix Applicati

- Alzato il rate-limit auth in ambiente `DEBUG` su backend e su Nginx per eliminare i falsi negativi da login massivo E2E.
- Reso il caricamento di `AlertDetail` resiliente a fallimenti parziali degli endpoint secondari.
- Risolti `data-testid` ambigui e strict locator issues (`comment-input`, drawer notifiche, analytics/source selectors).
- Migliorata stabilità UI nei flussi Sources/Parser (placeholder loading, feedback immediato su test-connection, input preview parser testabile).
- Corretto il nesting MUI nel Notification Drawer per eliminare warning console React (`validateDOMNesting`).
- Resa robusta la suite sicurezza per richieste API cross-tenant senza dipendenza DNS di `page.request`.
- Aggiornata configurazione Vitest per escludere i test Playwright dalla suite unit.

## Note Residue

- `readyz` espone check booleani (`true`) invece di stringhe `"ok"`; stato complessivo comunque `"ready"`.
- Suite E2E custom aggiuntive esistenti (`qa:session`, `qa:dashboard`) eseguite con esito senza issue.
