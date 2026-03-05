# Changelog

## 2026-03-04

- Fix build frontend su gestione header Axios:
  - corretto typing `AxiosRequestHeaders` in `frontend/src/services/api.ts`
  - consolidata impostazione header `Authorization` via `AxiosHeaders.from(...)`
- Introdotti quality gates frontend:
  - script `lint`, `test`, `test:watch` in `frontend/package.json`
  - configurazione ESLint flat (`frontend/eslint.config.js`)
  - configurazione Vitest (`frontend/vitest.config.ts`) + setup (`frontend/src/test/setup.ts`)
  - test unit iniziali su permessi e component base:
    - `frontend/src/services/__tests__/roleUtils.test.ts`
    - `frontend/src/components/__tests__/TabPanel.test.tsx`
- Aggiunta pipeline CI GitHub Actions:
  - `/.github/workflows/ci.yml`
  - job automatici frontend (lint/test/build) e backend (check/test)
  - job e2e smoke opzionale via `workflow_dispatch`
- Aggiornata documentazione operativa:
  - `README.md` con quality gates frontend, smoke Playwright e clean run.
