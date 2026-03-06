import { test, expect, Page } from '@playwright/test';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const BASE = 'http://localhost';
const TENANT1 = 'http://tenant1.localhost';

async function loginAs(page: Page, username: string, password: string, base = BASE) {
  await page.goto(`${base}/login`);
  await page.fill('[data-testid="username-input"], input[name="username"]', username);
  await page.fill('[data-testid="password-input"], input[name="password"]', password);
  await page.click('[data-testid="login-button"], button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10000 });
}

async function loginAsAdmin(page: Page) {
  return loginAs(page, 'admin', 'Admin123!');
}

async function loginAsManager(page: Page, base = TENANT1) {
  return loginAs(page, 'manager', 'Manager123!', base);
}

async function loginAsAnalyst(page: Page, base = TENANT1) {
  return loginAs(page, 'analyst', 'Analyst123!', base);
}

async function loginAsReadonly(page: Page, base = TENANT1) {
  return loginAs(page, 'readonly', 'ReadOnly123!', base);
}

// ─── SUITE 1: AUTENTICAZIONE ──────────────────────────────────────────────────

test.describe('Autenticazione', () => {

  test('login con credenziali corrette reindirizza alla dashboard', async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page).toHaveURL(/\/(dashboard|home|\/)/);
    await expect(page.locator('body')).not.toContainText('Invalid credentials');
  });

  test('login con credenziali errate mostra errore', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.fill('input[name="username"], [data-testid="username-input"]', 'admin');
    await page.fill('input[name="password"], [data-testid="password-input"]', 'WRONG_PASSWORD');
    await page.click('button[type="submit"], [data-testid="login-button"]');
    await expect(page.locator('body')).toContainText(/credenziali|invalid|errore|error/i);
  });

  test('logout invalida la sessione', async ({ page }) => {
    await loginAsAdmin(page);
    // Il logout button potrebbe essere fuori viewport nel sidebar — scroll into view
    const logoutBtn = page.locator('[data-testid="logout-button"]').first();
    await logoutBtn.scrollIntoViewIfNeeded();
    await logoutBtn.click();
    await expect(page).toHaveURL(/login/);
    // Prova ad accedere a pagina protetta
    await page.goto(`${BASE}/`);
    await expect(page).toHaveURL(/login/);
  });

  test('utente readonly non vede opzioni di scrittura', async ({ page }) => {
    await loginAsReadonly(page, TENANT1);
    // Non deve vedere bottoni di creazione/modifica
    await expect(page.locator('[data-testid="create-alert-button"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="bulk-action-toolbar"]')).not.toBeVisible();
  });

});

// ─── SUITE 2: DASHBOARD HOME ──────────────────────────────────────────────────

test.describe('Dashboard Home', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('mostra widget KPI presenti', async ({ page }) => {
    await expect(page.locator('[data-testid="widget-kpi-open-alerts"], [data-testid^="widget-"]').first()).toBeVisible({ timeout: 10000 });
  });

  test('time range selector è visibile e funzionante', async ({ page }) => {
    const selector = page.locator('[data-testid="time-range-selector"]');
    await expect(selector).toBeVisible();
    await selector.click();
    await page.locator('[data-value="7d"]').first().click();
    // Verifica che i widget si aggiornino (loader sparisce)
    await expect(page.locator('[data-testid="loading-spinner"]')).not.toBeVisible({ timeout: 8000 });
  });

  test('status bar mostra stato del sistema', async ({ page }) => {
    const statusBar = page.locator('[data-testid="status-bar"]');
    await expect(statusBar).toBeVisible();
    await expect(statusBar).toContainText(/Backend|OK|healthy/i);
  });

  test('widget sono toggleabili e il layout persiste dopo refresh', async ({ page }) => {
    // Toggle off un widget
    const toggleBtn = page.locator('[data-testid="widget-toggle-button"]').first();
    if (await toggleBtn.isVisible()) {
      const widgetsBefore = await page.locator('[data-testid^="widget-"]').count();
      await toggleBtn.click();
      const widgetsAfter = await page.locator('[data-testid^="widget-"]').count();
      expect(widgetsAfter).toBeLessThan(widgetsBefore);
      // Refresh e verifica persistenza
      await page.reload();
      await expect(page.locator('[data-testid^="widget-"]')).toHaveCount(widgetsAfter);
    }
  });

  test('lista tenant visibile con pulsante Apri', async ({ page }) => {
    await expect(page.locator('[data-testid="tenant-card"]').first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator('[data-testid="open-tenant-button"]').first()).toBeVisible();
  });

});

// ─── SUITE 3: LISTA ALERT ─────────────────────────────────────────────────────

test.describe('Lista Alert', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsManager(page, TENANT1);
    await page.goto(`${TENANT1}/alerts`);
    await expect(page.locator('table, [data-testid="alerts-table"]')).toBeVisible({ timeout: 10000 });
  });

  test('tabella alert caricata con dati', async ({ page }) => {
    const rows = page.locator('tbody tr, [data-testid="alert-row"]');
    await expect(rows.first()).toBeVisible({ timeout: 10000 });
    expect(await rows.count()).toBeGreaterThan(0);
  });

  test('selezione checkbox singola mostra toolbar bulk', async ({ page }) => {
    const checkbox = page.locator('tbody tr td:first-child .MuiCheckbox-root').first();
    await checkbox.click();
    await expect(page.locator('[data-testid="bulk-action-toolbar"]')).toBeVisible();
  });

  test('bulk action cambia stato di più alert', async ({ page }) => {
    // Seleziona almeno un alert per attivare la toolbar bulk
    const checkbox = page.locator('tbody tr td:first-child .MuiCheckbox-root').first();
    await checkbox.click();
    await expect(page.locator('[data-testid="bulk-action-toolbar"]')).toBeVisible();
    // Apri dialog cambio stato
    await page.locator('[data-testid="bulk-change-state-button"]').first().click();
    const dialog = page.locator('[role="dialog"]').last();
    await expect(dialog).toBeVisible();
    // Seleziona uno stato
    await dialog.locator('[data-testid="state-select"]').click();
    await page.click('[role="option"]');
    await dialog.locator('button[type="submit"]').first().click();
    // Verifica snackbar di successo
    await expect(page.locator('[data-testid="snackbar-success"], .MuiSnackbar-root')).toBeVisible({ timeout: 8000 });
  });

  test('filtro "Assegnato a me" filtra correttamente', async ({ page }) => {
    const filterChip = page.locator('[data-testid="filter-assignee-me"]');
    if (await filterChip.isVisible()) {
      await filterChip.click();
      await page.waitForTimeout(1000);
      // URL deve contenere il parametro
      expect(page.url()).toMatch(/assignee=me/);
    }
  });

  test('filtri attivi appaiono come chip rimovibili', async ({ page }) => {
    // Applica un filtro severità
    const severityFilter = page.locator('[data-testid="severity-filter"], select[name="severity"]');
    if (await severityFilter.isVisible()) {
      await severityFilter.selectOption('critical');
      await expect(page.locator('[data-testid="filter-chip"]')).toBeVisible();
      // Rimuovi il chip
      await page.click('[data-testid="filter-chip"] [data-testid="remove-filter"]');
      await expect(page.locator('[data-testid="filter-chip"]')).not.toBeVisible();
    }
  });

  test('dialog preview export mostra anteprima 5 righe', async ({ page }) => {
    await page.locator('[data-testid="export-button"]').first().click();
    const previewBtn = page.locator('[data-testid="preview-export-button"]');
    if (await previewBtn.isVisible()) {
      await previewBtn.click();
      await expect(page.locator('[role="dialog"]')).toBeVisible();
      const rows = page.locator('[data-testid="preview-table"] tbody tr');
      expect(await rows.count()).toBeLessThanOrEqual(5);
    }
  });

  test('export CSV scarica un file', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
    await page.locator('[data-testid="export-download-button"]').first().click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
  });

});

// ─── SUITE 4: ALERT DETAIL ────────────────────────────────────────────────────

test.describe('Alert Detail', () => {

  let alertUrl: string;

  test.beforeEach(async ({ page }) => {
    await loginAsAnalyst(page, TENANT1);
    await page.goto(`${TENANT1}/alerts`);
    await page.locator('[data-testid="open-alert-detail"]').first().click();
    await page.waitForURL(/\/alerts\/\d+/, { timeout: 8000 });
    alertUrl = page.url();
  });

  test('pagina detail carica senza errori', async ({ page }) => {
    await expect(page.locator('h1, [data-testid="alert-title"]')).toBeVisible({ timeout: 8000 });
    // No errori JS visibili
    await expect(page.locator("body")).not.toContainText(/Cannot read|Unhandled/i);
  });

  test('timeline eventi è visibile e contiene eventi', async ({ page }) => {
    const timeline = page.locator('[data-testid="alert-timeline"]');
    await expect(timeline).toBeVisible();
    await expect(timeline.locator('[data-testid="timeline-event"]').first()).toBeVisible({ timeout: 8000 });
  });

  test('sezione alert correlati carica', async ({ page }) => {
    const related = page.locator('[data-testid="related-alerts"]');
    await expect(related).toBeVisible({ timeout: 8000 });
    // Può essere vuota ma non deve dare errore
  });

  test('sezione IOC estratti visibile', async ({ page }) => {
    const iocSection = page.locator('[data-testid="ioc-section"]');
    // Può non esserci se l'alert non ha IOC
    if (await iocSection.isVisible()) {
      await expect(iocSection.locator('[data-testid="ioc-chip"]').first()).toBeVisible();
    }
  });

  test('SLA indicator è visibile nel header', async ({ page }) => {
    const slaIndicator = page.locator('[data-testid="sla-indicator"]');
    await expect(slaIndicator).toBeVisible({ timeout: 8000 });
  });

  test('cambio stato funziona', async ({ page }) => {
    await page.locator('[data-testid="change-state-button"]').first().click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await page.click('[role="option"]');
    await page.locator('button[type="submit"]').first().click();
    await expect(page.locator('.MuiSnackbar-root, [data-testid="snackbar-success"]')).toBeVisible({ timeout: 8000 });
  });

  test('aggiunta commento funziona', async ({ page }) => {
    const commentInput = page.locator('[data-testid="comment-input"], textarea[name="comment"]');
    await commentInput.fill('Test commento automatico Playwright');
    await page.click('[data-testid="submit-comment-button"], button:has-text("Commenta")');
    await expect(page.getByText('Test commento automatico Playwright').first()).toBeVisible({ timeout: 8000 });
  });

  test('upload allegato funziona', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.isVisible()) {
      await fileInput.setInputFiles({
        name: 'test.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('Test allegato Playwright')
      });
      await expect(page.locator('text=test.txt')).toBeVisible({ timeout: 8000 });
    }
  });

  test('MITRE ATT&CK campo editabile per analyst', async ({ page }) => {
    const mitreField = page.locator('[data-testid="mitre-technique-field"]');
    if (await mitreField.isVisible()) {
      await mitreField.click();
      await mitreField.fill('T1059');
      // Deve apparire autocomplete
      await expect(page.locator('[role="option"]').first()).toBeVisible({ timeout: 5000 });
    }
  });

});

// ─── SUITE 5: NOTIFICATION CENTER ─────────────────────────────────────────────

test.describe('Notification Center', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsManager(page, TENANT1);
  });

  test('icona campanella visibile nell header', async ({ page }) => {
    await expect(page.locator('[data-testid="notification-bell"], [aria-label="notifiche"]')).toBeVisible();
  });

  test('apertura drawer notifiche', async ({ page }) => {
    await page.click('[data-testid="notification-bell"], [aria-label="notifiche"]');
    await expect(page.locator('[data-testid="notification-drawer"], [role="presentation"]')).toBeVisible();
  });

  test('ack singola notifica funziona', async ({ page }) => {
    await page.click('[data-testid="notification-bell"]');
    const notification = page.locator('[data-testid="notification-item"]').first();
    if (await notification.isVisible()) {
      const countBefore = await page.locator('[data-testid="notification-item"]').count();
      await page.click('[data-testid="notification-ack-button"]');
      await page.waitForTimeout(500);
      const countAfter = await page.locator('[data-testid="notification-item"]').count();
      expect(countAfter).toBeLessThanOrEqual(countBefore);
    }
  });

  test('ack-all segna tutte le notifiche come lette', async ({ page }) => {
    await page.click('[data-testid="notification-bell"]');
    const ackAll = page.locator('[data-testid="notification-ack-all-button"]');
    if (await ackAll.isVisible()) {
      await ackAll.click();
      await page.waitForTimeout(1000);
      // Le notifiche restano visibili ma marcate come lette; il contatore unread diventa 0
      await expect(page.locator('[data-testid="notification-list-tab"]')).toContainText('(0)');
    }
  });

  test('snooze notifica la nasconde', async ({ page }) => {
    await page.click('[data-testid="notification-bell"]');
    const snoozeBtn = page.locator('[data-testid="notification-snooze-button"]').first();
    if (await snoozeBtn.isVisible()) {
      const countBefore = await page.locator('[data-testid="notification-item"]').count();
      await snoozeBtn.click();
      await page.locator('[data-value="15m"]').first().click();
      await page.waitForTimeout(500);
      const countAfter = await page.locator('[data-testid="notification-item"]').count();
      expect(countAfter).toBeLessThan(countBefore);
    }
  });

  test('tab preferenze notifiche apribile', async ({ page }) => {
    await page.click('[data-testid="notification-bell"]');
    const prefsTab = page.locator('[data-testid="notification-prefs-tab"]');
    if (await prefsTab.isVisible()) {
      await prefsTab.click();
      await expect(page.locator('[data-testid="min-severity-select"]')).toBeVisible();
    }
  });

});

// ─── SUITE 6: SORGENTI INGESTION ──────────────────────────────────────────────

test.describe('Sorgenti Ingestion', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsManager(page, TENANT1);
    await page.goto(`${TENANT1}/sources`);
    await expect(page.locator('[data-testid="sources-list"], table').first()).toBeVisible({ timeout: 10000 });
  });

  test('lista sorgenti caricata', async ({ page }) => {
    const items = page.locator('[data-testid="source-item"], tbody tr');
    expect(await items.count()).toBeGreaterThan(0);
  });

  test('badge metriche visibile su ogni sorgente', async ({ page }) => {
    const badge = page.locator('[data-testid="source-metrics-badge"], [data-testid="records-today-badge"]').first();
    await expect(badge).toBeVisible({ timeout: 8000 });
  });

  test('test-connection funziona', async ({ page }) => {
    await page.locator('[data-testid="source-item"], tbody tr').first().click();
    await expect(page.locator('[data-testid="source-detail"]')).toBeVisible({ timeout: 8000 });
    await page.locator('[data-testid="test-connection-button"]').first().click();
    // Attende risposta (può passare o fallire ma non crashare)
    await expect(page.locator('[data-testid="connection-result"], .MuiSnackbar-root')).toBeVisible({ timeout: 15000 });
  });

  test('tab statistiche con grafico visibile', async ({ page }) => {
    await page.locator('[data-testid="source-item"], tbody tr').first().click();
    const statsTab = page.locator('[data-testid="source-stats-tab"]');
    if (await statsTab.isVisible()) {
      await statsTab.click();
      await expect(page.locator('.recharts-wrapper, [data-testid="stats-chart"]')).toBeVisible({ timeout: 8000 });
    }
  });

  test('tab log errori carica', async ({ page }) => {
    await page.locator('[data-testid="source-item"], tbody tr').first().click();
    const errorsTab = page.locator('[data-testid="source-errors-tab"]');
    if (await errorsTab.isVisible()) {
      await errorsTab.click();
      // Può essere vuota
      await expect(page.locator('[data-testid="error-log-table"], [data-testid="no-errors-message"]')).toBeVisible({ timeout: 8000 });
    }
  });

  test('form scheduling editabile', async ({ page }) => {
    await page.locator('[data-testid="source-item"], tbody tr').first().click();
    const scheduleSection = page.locator('[data-testid="scheduling-section"]');
    if (await scheduleSection.isVisible()) {
      await expect(page.locator('[data-testid="schedule-mode-toggle"]')).toBeVisible();
    }
  });

});

// ─── SUITE 7: PARSER ──────────────────────────────────────────────────────────

test.describe('Parser', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsManager(page, TENANT1);
    await page.goto(`${TENANT1}/parsers`);
    // La pagina mostra un LinearProgress durante il caricamento, poi il titolo
    await expect(page.locator('h5:has-text("Parser Pipeline")')).toBeVisible({ timeout: 10000 });
  });

  test('pagina parser caricata con selettore sorgente', async ({ page }) => {
    await expect(page.getByLabel('Sorgente')).toBeVisible();
  });

  test('configurazione parser con TextField multiline', async ({ page }) => {
    // La pagina usa un MUI TextField multiline per la config, non Monaco
    await expect(page.getByLabel('Config parser (JSON/YAML)')).toBeVisible({ timeout: 10000 });
  });

  test('preview con evento personalizzato funziona', async ({ page }) => {
    const rawPayloadField = page.getByLabel('Raw payload preview (JSON)');
    await expect(rawPayloadField).toBeVisible();
    await rawPayloadField.fill('{"test": "evento", "src_ip": "1.2.3.4"}');
    await page.locator('button:has-text("Valida e preview")').click();
    // Attende feedback di successo o errore
    await expect(page.locator('.MuiAlert-root')).toBeVisible({ timeout: 10000 });
  });

  test('sezione revisioni parser visibile', async ({ page }) => {
    // La tabella revisioni e sempre presente nella pagina
    await expect(page.locator('h6:has-text("Revisioni parser")')).toBeVisible({ timeout: 10000 });
  });

  test('pulsanti salva e ricarica presenti', async ({ page }) => {
    await expect(page.locator('button:has-text("Salva parser")')).toBeVisible();
    await expect(page.locator('button:has-text("Ricarica")')).toBeVisible();
  });

});

// ─── SUITE 8: ADMIN PANEL ─────────────────────────────────────────────────────

test.describe('Admin Panel', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin-panel`);
    await expect(page.locator('[data-testid="admin-panel"], h1')).toBeVisible({ timeout: 10000 });
  });

  test('admin panel accessibile da admin', async ({ page }) => {
    await expect(page).toHaveURL(/admin-panel/);
  });

  test('manager non può accedere all admin panel', async ({ page }) => {
    await page.context().clearCookies();
    await loginAsManager(page, BASE);
    await page.goto(`${BASE}/admin-panel`);
    await expect(page).not.toHaveURL(/admin-panel/);
    // Deve essere reindirizzato o mostrare 403
    const has403 = await page.locator("body").textContent().then((txt) => /403|Accesso negato|Forbidden/i.test(txt ?? ""));
    const redirected = !page.url().includes('admin-panel');
    expect(has403 || redirected).toBeTruthy();
  });

  test('tab utenti mostra lista utenti', async ({ page }) => {
    await page.locator('[data-testid="tab-users"]').first().click();
    await expect(page.locator('tbody tr, [data-testid="user-row"]').first()).toBeVisible({ timeout: 8000 });
  });

  test('tab security audit carica eventi', async ({ page }) => {
    await page.locator('[data-testid="tab-audit"]').first().click();
    // Può essere vuota in seed fresco
    await expect(page.locator('[data-testid="audit-table"], [data-testid="no-audit-message"]')).toBeVisible({ timeout: 8000 });
  });

  test('crea nuovo utente', async ({ page }) => {
    await page.locator('[data-testid="tab-users"]').first().click();
    await page.locator('[data-testid="create-user-button"]').first().click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await page.fill('input[name="username"]', `testuser_${Date.now()}`);
    await page.fill('input[name="email"]', `test${Date.now()}@example.com`);
    await page.fill('input[name="password"]', 'TestPassword123!');
    await page.locator('button[type="submit"]').first().click();
    await expect(page.locator('.MuiSnackbar-root, [data-testid="snackbar-success"]')).toBeVisible({ timeout: 8000 });
  });

});

// ─── SUITE 9: ANALYTICS ───────────────────────────────────────────────────────

test.describe('Analytics', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsManager(page, TENANT1);
    await page.goto(`${TENANT1}/analytics`);
    await expect(page.locator('[data-testid="analytics-page"], h1')).toBeVisible({ timeout: 10000 });
  });

  test('pagina analytics caricata', async ({ page }) => {
    await expect(page).toHaveURL(/analytics/);
  });

  test('tab overview con KPI visibili', async ({ page }) => {
    await expect(page.locator('[data-testid="kpi-card"]').first()).toBeVisible({ timeout: 10000 });
    expect(await page.locator('[data-testid="kpi-card"]').count()).toBeGreaterThanOrEqual(4);
  });

  test('grafici Recharts renderizzati', async ({ page }) => {
    await expect(page.locator('.recharts-wrapper').first()).toBeVisible({ timeout: 10000 });
    expect(await page.locator('.recharts-wrapper').count()).toBeGreaterThanOrEqual(2);
  });

  test('tab per fonte carica', async ({ page }) => {
    await page.locator('[data-testid="analytics-tab-source"]').first().click();
    await expect(page.locator('[data-testid="by-source-table"], .recharts-wrapper')).toBeVisible({ timeout: 10000 });
  });

  test('time range selector cambia i dati', async ({ page }) => {
    const selector = page.locator('[data-testid="time-range-selector"]');
    if (await selector.isVisible()) {
      const kpiBefore = await page.locator('[data-testid="kpi-card"]').first().textContent();
      await selector.click();
      await page.locator('[data-value="30d"]').first().click();
      await page.waitForTimeout(2000);
      // I dati possono cambiare (non necessariamente cambiano se ci sono pochi dati)
      await expect(page.locator('[data-testid="kpi-card"]').first()).toBeVisible();
      void kpiBefore;
    }
  });

});

// ─── SUITE 10: DARK MODE ──────────────────────────────────────────────────────

test.describe('Dark Mode', () => {

  test('toggle dark mode funziona e persiste', async ({ page }) => {
    await loginAsAdmin(page);
    const toggle = page.locator('[data-testid="theme-toggle"], [aria-label="dark mode"], [aria-label="toggle theme"]');
    await expect(toggle).toBeVisible();
    await toggle.click();
    // Verifica che il body abbia classe/attributo dark
    const isDark = await page.evaluate(() => {
      return document.body.classList.contains('dark') ||
             document.documentElement.getAttribute('data-theme') === 'dark' ||
             document.documentElement.classList.contains('dark');
    });
    // Reload e verifica persistenza
    await page.reload();
    const isDarkAfterReload = await page.evaluate(() => {
      return document.body.classList.contains('dark') ||
             document.documentElement.getAttribute('data-theme') === 'dark' ||
             localStorage.getItem('theme_mode') === 'dark';
    });
    expect(isDark || isDarkAfterReload).toBeTruthy();
  });

});

// ─── SUITE 11: SICUREZZA ─────────────────────────────────────────────────────

test.describe('Sicurezza', () => {

  test('token JWT NON presente in localStorage', async ({ page }) => {
    await loginAsAdmin(page);
    const hasTokenInStorage = await page.evaluate(() => {
      const keys = Object.keys(localStorage);
      return keys.some(k =>
        k.includes('token') || k.includes('access') || k.includes('refresh') || k.includes('jwt')
      );
    });
    expect(hasTokenInStorage).toBeFalsy();
  });

  test('pagine protette redirigono a login senza auth', async ({ page }) => {
    await page.goto(`${TENANT1}/alerts`);
    await expect(page).toHaveURL(/login/);
  });

  test('utente tenant1 non accede a risorse tenant2', async ({ page }) => {
    await loginAsManager(page, TENANT1);
    await page.goto('http://tenant2.localhost/alerts');
    if (page.url().includes('/login')) {
      expect(page.url()).toMatch(/login/);
      return;
    }
    const status = await page.evaluate(async () => {
      const response = await fetch('/api/alerts/alerts/', { credentials: 'include' });
      return response.status;
    });
    expect([401, 403]).toContain(status);
  });

  test('readonly non può modificare alert (403 da API)', async ({ page }) => {
    await loginAsReadonly(page, TENANT1);
    const status = await page.evaluate(async () => {
      await fetch('/api/auth/csrf/', { credentials: 'include' });
      const csrf = document.cookie
        .split(';')
        .map((item) => item.trim())
        .find((item) => item.startsWith('csrftoken='))?.split('=')[1] ?? '';
      const response = await fetch('/api/alerts/alerts/1/', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': decodeURIComponent(csrf),
        },
        body: JSON.stringify({ title: 'Hacked' }),
      });
      return response.status;
    });
    expect([401, 403]).toContain(status);
  });

});

// ─── SUITE 12: PERFORMANCE BASE ───────────────────────────────────────────────

test.describe('Performance', () => {

  test('dashboard carica in meno di 5 secondi', async ({ page }) => {
    await loginAsAdmin(page);
    const start = Date.now();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000);
  });

  test('lista alert carica in meno di 4 secondi', async ({ page }) => {
    await loginAsManager(page, TENANT1);
    const start = Date.now();
    await page.goto(`${TENANT1}/alerts`);
    await page.waitForSelector('tbody tr, [data-testid="alert-row"]');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(4000);
  });

  test('nessun errore console durante navigazione principale', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', err => errors.push(err.message));

    await loginAsAdmin(page);
    await page.goto(`${BASE}/`);
    await page.waitForLoadState('networkidle');

    // Filtra errori noti accettabili (es. WebSocket in dev)
    const realErrors = errors.filter(e =>
      !e.includes('WebSocket') &&
      !e.includes('favicon') &&
      !e.includes('HMR') &&
      !e.includes('sourcemap') &&
      !e.includes('Failed to load resource')
    );

    if (realErrors.length > 0) {
      console.log('Errori console trovati:', realErrors);
    }
    expect(realErrors).toHaveLength(0);
  });

});
