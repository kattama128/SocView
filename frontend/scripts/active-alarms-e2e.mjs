import { baseUrl, closeBrowser, createIssueTracker, login, openBrowserPage } from "./_e2e-utils.mjs";

const getAlarmCounts = async (page) => {
  const text = (await page.locator("text=/Allarmi:\\s*\\d+\\/\\d+/").first().textContent()) || "";
  const match = text.match(/Allarmi:\s*(\d+)\/(\d+)/i);
  if (!match) {
    return null;
  }
  return {
    shown: Number(match[1]),
    total: Number(match[2]),
  };
};

const run = async () => {
  const { issues, step } = createIssueTracker();
  const { browser, context, page } = await openBrowserPage();

  let searchEndpointHit = false;
  page.on("response", (response) => {
    if (response.url().includes("/api/alerts/search/") && response.status() < 400) {
      searchEndpointHit = true;
    }
  });

  await step("Login admin", async () => {
    await login(page, "admin");
    await page.getByRole("button", { name: "Configura" }).waitFor();
  });

  await step("Apertura Active Alarms e caricamento dati", async () => {
    await page.goto(`${baseUrl}/active-alarms`, { waitUntil: "domcontentloaded" });
    await page.getByText("Active Alarms").first().waitFor();
    await page.waitForTimeout(1200);
    if (!searchEndpointHit) {
      throw new Error("Endpoint /api/alerts/search/ non chiamato o in errore.");
    }
  });

  await step("Filtri severity da popover", async () => {
    const before = await getAlarmCounts(page);
    await page.getByRole("button", { name: "Filtri" }).click();
    await page.getByText("Filtri Active Alarms").waitFor();
    await page.getByRole("button", { name: /critical|high|medium|low/i }).first().click();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    const after = await getAlarmCounts(page);
    if (!before || !after) {
      throw new Error("Conteggio allarmi non rilevabile prima/dopo filtro.");
    }
    if (after.shown > before.shown) {
      throw new Error(`Filtro severity incoerente: ${before.shown} -> ${after.shown}`);
    }
  });

  await step("Sorting per Timestamp", async () => {
    const timestampHeader = page.getByRole("columnheader", { name: /Timestamp/i });
    await timestampHeader.click();
    await page.waitForTimeout(200);
    await timestampHeader.click();
  });

  await step("Espansione riga allarme con dettaglio", async () => {
    if (await page.getByText("Nessun allarme disponibile.").isVisible().catch(() => false)) {
      throw new Error("Nessun allarme disponibile: espansione non verificabile.");
    }
    const expandButton = page.locator("table tbody tr button").first();
    await expandButton.click();
    await page.getByText("Dettaglio allarme").waitFor();
    await page.getByText("Campi base (fissi)").waitFor();
  });

  await closeBrowser(context, browser);
  console.log(JSON.stringify({ issues }, null, 2));
  process.exit(issues.length ? 1 : 0);
};

run().catch((error) => {
  console.error(
    JSON.stringify(
      {
        fatal: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
