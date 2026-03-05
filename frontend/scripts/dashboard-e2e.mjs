import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://localhost";
const username = process.env.QA_USERNAME || "";
const password = process.env.QA_PASSWORD || "";

const issues = [];
const record = (title, detail) => {
  issues.push({ title, detail });
};

const step = async (title, fn) => {
  console.log(`STEP: ${title}`);
  try {
    await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL: ${title} -> ${message}`);
    record(title, message);
  }
};

const readRowsChip = async (page) => {
  const chip = page.locator("text=/\\d+\\/\\d+ righe/").first();
  const text = (await chip.textContent()) || "";
  const match = text.match(/(\d+)\/(\d+)/);
  if (!match) {
    return null;
  }
  return {
    shown: Number(match[1]),
    filtered: Number(match[2]),
  };
};

const run = async () => {
  if (!username || !password) {
    throw new Error("Imposta QA_USERNAME e QA_PASSWORD prima di eseguire dashboard-e2e.");
  }
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(15000);

  let widgetsHit = false;
  let searchHit = false;
  let widgetsPayload = null;
  let searchPayload = null;

  page.on("response", async (response) => {
    const url = response.url();
    if (url.includes("/api/core/dashboard/widgets/")) {
      widgetsHit = widgetsHit || response.status() < 400;
      if (response.status() < 400) {
        try {
          widgetsPayload = await response.json();
        } catch {
          widgetsPayload = null;
        }
      }
    }
    if (url.includes("/api/alerts/search/")) {
      searchHit = searchHit || response.status() < 400;
      if (response.status() < 400) {
        try {
          searchPayload = await response.json();
        } catch {
          searchPayload = null;
        }
      }
    }
  });

  await step("Login", async () => {
    await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Accedi" }).click();
    await page.getByRole("button", { name: "Configura" }).waitFor();
  });

  await step("Dashboard usa endpoint reali", async () => {
    await page.waitForTimeout(1500);
    if (!widgetsHit) {
      throw new Error("Endpoint /api/core/dashboard/widgets/ non chiamato o in errore");
    }
    if (!searchHit) {
      throw new Error("Endpoint /api/alerts/search/ non chiamato o in errore");
    }
  });

  await step("Grafici popolati se esistono alert", async () => {
    const alertCount = Number(searchPayload?.count ?? 0);
    if (alertCount <= 0) {
      return;
    }

    const widgets = Array.isArray(widgetsPayload?.widgets) ? widgetsPayload.widgets : [];
    const totalSignal = widgets.reduce((acc, widget) => {
      const data = widget?.data || {};
      const points = Array.isArray(data.points) ? data.points.reduce((sum, p) => sum + Number(p.count || 0), 0) : 0;
      const items = Array.isArray(data.items) ? data.items.reduce((sum, i) => sum + Number(i.count || 0), 0) : 0;
      return acc + points + items;
    }, 0);

    if (totalSignal <= 0) {
      throw new Error("Sono presenti alert ma i widget dashboard risultano senza dati");
    }
  });

  await step("Configura widget + drag&drop + persistenza layout", async () => {
    await page.getByRole("button", { name: "Configura" }).click();
    await page.getByText("Configura Dashboard").waitFor();

    const cards = page.locator("div[draggable=true]");
    const initial = await cards.allTextContents();
    if (initial.length >= 2) {
      await cards.nth(0).dragTo(cards.nth(1));
      const changed = await cards.allTextContents();
      if (changed[0] === initial[0]) {
        throw new Error("Il drag&drop widget non cambia l'ordine");
      }
    }

    await page.getByRole("button", { name: "Salva configurazione" }).click();
    await page.getByText("Configurazione dashboard salvata.").waitFor();

    const afterSave = await cards.allTextContents();
    await page.keyboard.press("Escape");

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Configura" }).click();
    await page.getByText("Configura Dashboard").waitFor();
    const afterReload = await page.locator("div[draggable=true]").allTextContents();
    await page.keyboard.press("Escape");

    if (afterSave.length >= 2 && afterReload.length >= 2 && afterSave[0] !== afterReload[0]) {
      throw new Error("Ordine widget non persistito dopo reload");
    }
  });

  await step("Tabella: numero righe configurabile", async () => {
    await page.getByRole("button", { name: "Configura" }).click();
    await page.getByLabel("Numero allarmi in tabella").fill("5");
    await page.getByRole("button", { name: "Salva configurazione" }).click();
    await page.getByText("Configurazione dashboard salvata.").waitFor();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    const chip = await readRowsChip(page);
    if (!chip) {
      throw new Error("Chip conteggio righe non trovato");
    }
    if (chip.shown > 5) {
      throw new Error(`Numero righe mostrato non coerente con limite: ${chip.shown}`);
    }
  });

  await step("Tabella: filtri e sorting", async () => {
    const before = await readRowsChip(page);
    await page.getByRole("button", { name: "Filtri" }).first().click();
    await page.getByText("Filtri tabella").waitFor();

    const severityChip = page.getByRole("button", { name: /Critical|Warning|Info/ }).first();
    if (await severityChip.isVisible()) {
      await severityChip.click();
      await page.waitForTimeout(300);
    }
    await page.keyboard.press("Escape");

    const after = await readRowsChip(page);
    if (before && after && after.filtered > before.filtered) {
      throw new Error("Filtro severity aumenta le righe invece di ridurle");
    }

    const header = page.getByRole("columnheader", { name: "Timestamp" });
    await header.click();
    await page.waitForTimeout(200);
    await header.click();
  });

  await step("Tabella: espansione riga con campi parsati", async () => {
    const firstExpand = page.locator("table tbody tr button").first();
    if (!(await firstExpand.isVisible())) {
      return;
    }
    await firstExpand.click();
    await page.getByText("Campi parsati").waitFor();
  });

  await browser.close();
  console.log(JSON.stringify({ issues }, null, 2));
  process.exit(issues.length ? 1 : 0);
};

run().catch((error) => {
  console.error(JSON.stringify({ issues, fatal: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exit(1);
});
