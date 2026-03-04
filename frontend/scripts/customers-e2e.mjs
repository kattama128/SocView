import { baseUrl, closeBrowser, createIssueTracker, login, openBrowserPage } from "./_e2e-utils.mjs";

const run = async () => {
  const { issues, step } = createIssueTracker();
  const { browser, context, page } = await openBrowserPage();

  await step("Login admin", async () => {
    await login(page, "admin");
    await page.getByRole("button", { name: "Configura" }).waitFor();
  });

  await step("Apertura pagina Customers e lista", async () => {
    await page.goto(`${baseUrl}/customers`, { waitUntil: "domcontentloaded" });
    await page.getByText("Customers").first().waitFor();
    await page.locator("text=/Tot:\\s*\\d+/").first().waitFor();
  });

  await step("Apertura dettaglio cliente", async () => {
    await page.locator("text=/Tot:\\s*\\d+/").first().click();
    await page.waitForURL(/\/customers\/\d+$/, { timeout: 12000 });
    await page.getByRole("button", { name: "Impostazioni" }).waitFor();
  });

  await step("Apertura Customer Settings dal dettaglio", async () => {
    await page.getByRole("button", { name: "Impostazioni" }).click();
    await page.waitForURL(/\/customers\/\d+\/settings$/, { timeout: 12000 });
    await page.getByText("Impostazioni Cliente").first().waitFor();
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
