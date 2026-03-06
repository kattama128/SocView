## [SEVERITÀ: LOW] Bundle frontend oltre soglia raccomandata (chunk > 500 kB)
- Dove: build Vite frontend (`frontend`)
- Passi per riprodurre:
  1) Eseguire `cd frontend && npm run build`
  2) Leggere output build
- Risultato atteso:
  - Nessun warning dimensione chunk o bundle suddiviso in chunk più piccoli.
- Risultato attuale:
  - Warning Vite: chunk `dist/assets/index-*.js` oltre 500 kB minificati.
- Root cause:
  - Bundle principale contiene molte dipendenze UI/logica senza code-splitting sufficiente.
- Fix applicato:
  - Nessun fix in questa iterazione (necessario intervento di ottimizzazione non bloccante: lazy routes/manualChunks).
- Test di regressione:
  - `cd frontend && npm run build` (warning confermato).
- Stato: OPEN

## [SEVERITÀ: LOW] Copertura E2E incompleta sui moduli secondari
- Dove: suite QA UI (`frontend/scripts/*.mjs`)
- Passi per riprodurre:
  1) Eseguire `npm run qa:session`
  2) Eseguire `npm run qa:dashboard`
  3) Verificare assenza di smoke dedicati per flussi CRUD completi di Management/Customers Settings/Sources avanzati.
- Risultato atteso:
  - Smoke E2E automatici su tutti i flussi critici cross-modulo.
- Risultato attuale:
  - E2E automatici presenti e verdi per sessione e dashboard; copertura parziale sugli altri moduli.
- Root cause:
  - Suite E2E iniziale focalizzata sui regressioni principali (auth/session/dashboard), non ancora estesa a tutti i workflow.
- Fix applicato:
  - Infrastruttura CI predisposta con job e2e opzionale; estensione casi ancora da completare.
- Test di regressione:
  - `cd frontend && npm run qa:session && npm run qa:dashboard` (pass).
- Stato: OPEN
