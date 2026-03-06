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
    console.error(`FAIL: ${title}`);
    record(title, error instanceof Error ? error.message : String(error));
  }
};

const getAlarmChipCounts = async (page) => {
  const chip = page.locator("text=Allarmi:").first();
  const text = (await chip.textContent()) || "";
  const match = text.match(/Allarmi:\s*(\d+)\/(\d+)/i);
  if (!match) return null;
  return { filtered: Number(match[1]), total: Number(match[2]) };
};

const run = async () => {
  if (!username || !password) {
    throw new Error("Imposta QA_USERNAME e QA_PASSWORD prima di eseguire qa-e2e.");
  }
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.setDefaultTimeout(7000);
  page.setDefaultNavigationTimeout(10000);

  await step("Login", async () => {
    await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
    await page.locator('[data-testid="username-input"], input[name="username"]').first().fill(username);
    await page.locator('[data-testid="password-input"], input[name="password"]').first().fill(password);
    await page.locator('[data-testid="login-button"], button[type="submit"]').first().click();
    await page.getByRole("button", { name: "Configura" }).waitFor();
  });

  await step("Dashboard - Configura popover e row limit", async () => {
    await page.getByRole("button", { name: "Configura" }).click();
    await page.getByText("Configura Dashboard").waitFor();
    const rowInput = page.getByLabel("Numero allarmi in tabella");
    await rowInput.fill("5");
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () => document.querySelectorAll("table tbody tr").length <= 10,
      null,
      { timeout: 7000 },
    );
    await page.getByRole("button", { name: "Configura" }).click();
    await page.getByText("Configura Dashboard").waitFor();
    await rowInput.fill("20");
    await page.keyboard.press("Escape");
  });

  await step("Dashboard - drag & drop widget", async () => {
    await page.getByRole("button", { name: "Configura" }).click();
    await page.getByText("Configura Dashboard").waitFor();
    const widgetItems = page.locator("div[draggable=true]");
    const before = await widgetItems.allTextContents();
    if (before.length >= 2) {
      await widgetItems.nth(0).dragTo(widgetItems.nth(1), { timeout: 5000 });
      const after = await widgetItems.allTextContents();
      if (before[0] === after[0]) {
        throw new Error("Ordine widget non cambiato dopo drag&drop");
      }
      await widgetItems.nth(0).dragTo(widgetItems.nth(1), { timeout: 5000 });
    }
    await page.keyboard.press("Escape");
  });

  await step("Dashboard - colonne tabella configurabili", async () => {
    await page.getByRole("button", { name: "Configura" }).click();
    await page.getByText("Configura Dashboard").waitFor();
    const configSection = page.getByText("Colonne tabella ultimi allarmi").locator("..");
    const checkboxes = configSection.locator("input[type=checkbox]");
    await checkboxes.nth(2).click();
    await page.keyboard.press("Escape");
    const headerVisible = await page.getByRole("columnheader", { name: "Description" }).isVisible();
    if (headerVisible) {
      throw new Error("Colonna disabilitata ancora visibile in tabella");
    }
    await page.getByRole("button", { name: "Configura" }).click();
    await page.getByText("Configura Dashboard").waitFor();
    await checkboxes.nth(2).click();
    await page.keyboard.press("Escape");
  });

  await step("Dashboard - filtri tabella", async () => {
    await page.getByRole("button", { name: "Filtri" }).first().click();
    await page.getByText("Filtri tabella").waitFor();
    const chip = page.getByRole("button", { name: /Critical/i }).first();
    const before = await page.locator("table tbody tr").count();
    await chip.click();
    const after = await page.locator("table tbody tr").count();
    if (after > before) {
      throw new Error("Filtro severity non riduce il numero di righe");
    }
    await page.getByRole("button", { name: "Reset" }).click();
    await page.keyboard.press("Escape");
  });

  await step("Selettore cliente", async () => {
    await page.locator("text=Tutti i clienti").first().click();
    await page.getByRole("option").nth(1).click();
    const chip = page.locator("text=Cliente:");
    const text = (await chip.textContent()) || "";
    if (!text.includes("Cliente:")) {
      throw new Error("Selettore cliente non aggiorna il chip");
    }
  });

  await step("Active Alarms - filtri e espansione", async () => {
    await page.locator("text=Active Alarms").first().click();
    await page.locator("text=Active Alarms").nth(1).waitFor();
    const before = await getAlarmChipCounts(page);
    await page.getByRole("button", { name: "Filtri" }).click();
    await page.getByText("Filtri Active Alarms").waitFor();
    const sevChip = page.getByRole("button", { name: /critical/i }).first();
    await sevChip.click();
    const after = await getAlarmChipCounts(page);
    if (!after || !before || after.filtered > before.filtered) {
      throw new Error("Filtro severity non riduce il numero di allarmi");
    }
    await page.getByRole("button", { name: "Reset" }).click();
    await page.keyboard.press("Escape");

    const expand = page.locator('svg[data-testid="KeyboardArrowDownIcon"]').first();
    await expand.click();
    await page.getByText("Campi parsati").waitFor();
  });

  await step("Costumers - lista e dettaglio", async () => {
    await page.locator("text=Costumers").first().click();
    await page.locator("text=Costumers").nth(1).waitFor();
    const firstCard = page.locator("div[draggable=true]").first();
    await firstCard.click();
    await page.getByRole("button", { name: "Impostazioni" }).waitFor();
  });

  await step("Sources - presenza Canary/Sentinel", async () => {
    await page.locator("text=Sources").first().click();
    await page.locator("text=Sources").nth(1).waitFor();
    await page.getByText("Canary Tools Incident Feed").waitFor();
    await page.getByText("SentinelOne Threat & Activities API").waitFor();
  });

  await step("Notifications drawer", async () => {
    await page.getByRole("button", { name: "notifications" }).click();
    await page.getByText("Notification Center").waitFor();
    await page.keyboard.press("Escape");
  });

  await browser.close();

  console.log(JSON.stringify({ issues }, null, 2));
  process.exit(issues.length ? 1 : 0);
};

run().catch((error) => {
  console.error(JSON.stringify({ issues, fatal: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exit(1);
});
