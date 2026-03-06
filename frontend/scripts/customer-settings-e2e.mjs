import { baseUrl, closeBrowser, createIssueTracker, login, openBrowserPage } from "./_e2e-utils.mjs";

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const findTogglableSwitchIndex = async (page) => {
  const switches = page.locator("table tbody tr td:last-child input[type=checkbox]");
  const count = await switches.count();
  for (let index = 0; index < count; index += 1) {
    const current = switches.nth(index);
    if (!(await current.isDisabled())) {
      return index;
    }
  }
  return -1;
};

const run = async () => {
  const { issues, step } = createIssueTracker();
  const { browser, context, page } = await openBrowserPage();

  await step("Login admin", async () => {
    await login(page, "admin");
    await page.getByRole("button", { name: "Configura" }).waitFor();
  });

  await step("Apertura Customer Settings", async () => {
    await page.goto(`${baseUrl}/customers`, { waitUntil: "domcontentloaded" });
    await page.getByText("Customers").first().waitFor();
    await page.locator("text=/Tot:\\s*\\d+/").first().click();
    await page.getByRole("button", { name: "Impostazioni" }).click();
    await page.waitForURL(/\/customers\/\d+\/settings$/, { timeout: 12000 });
    await page.getByText("Impostazioni Cliente").first().waitFor();
  });

  await step("Salvataggio impostazioni profilo", async () => {
    const primaryContact = page.getByLabel("Primary contact");
    const emailField = page.getByLabel("Email");
    const originalValue = await primaryContact.inputValue();
    const originalEmail = await emailField.inputValue();
    const nextValue = `${originalValue || "QA Contact"} QA`;
    const normalizedEmail = isValidEmail(originalEmail) ? originalEmail : `qa.customer.${Date.now()}@example.com`;

    await emailField.fill(normalizedEmail);
    await primaryContact.fill(nextValue);
    await page.getByRole("button", { name: "Salva" }).click();
    const success = page.getByText("Impostazioni cliente salvate con successo.").first();
    const error = page.getByText("Salvataggio impostazioni cliente non riuscito.").first();
    const validationError = page.getByText("Correggi i campi evidenziati prima di salvare.").first();
    await Promise.race([
      success.waitFor({ timeout: 15000 }),
      error.waitFor({ timeout: 15000 }),
      validationError.waitFor({ timeout: 15000 }),
    ]);

    if (await error.isVisible().catch(() => false)) {
      throw new Error("Save customer settings fallito (errore backend).");
    }
    if (await validationError.isVisible().catch(() => false)) {
      throw new Error("Save customer settings fallito (errore validazione).");
    }

    if (isValidEmail(originalEmail)) {
      await page.getByLabel("Primary contact").fill(originalValue);
      await page.getByLabel("Email").fill(originalEmail);
      await page.getByRole("button", { name: "Salva" }).click();
      await page.getByText("Impostazioni cliente salvate con successo.").waitFor();
    }
  });

  await step("Toggle fonte cliente con ripristino", async () => {
    await page.getByRole("tab", { name: "Fonti abilitate" }).click();
    await page.getByText("Abilitazioni Fonti per Cliente").waitFor();

    const switchIndex = await findTogglableSwitchIndex(page);
    if (switchIndex < 0) {
      const emptySourcesMessageVisible = await page.getByText("Nessuna fonte globale disponibile.").isVisible().catch(() => false);
      if (emptySourcesMessageVisible) {
        return;
      }
      return;
    }

    const switches = page.locator("table tbody tr td:last-child input[type=checkbox]");
    const targetSwitch = switches.nth(switchIndex);
    const initial = await targetSwitch.isChecked();

    await targetSwitch.click();
    await page.getByText("Abilitazione fonte aggiornata.").waitFor();

    const toggled = await targetSwitch.isChecked();
    if (toggled === initial) {
      throw new Error("Il toggle fonte non ha cambiato stato.");
    }

    await targetSwitch.click();
    await page.getByText("Abilitazione fonte aggiornata.").waitFor();
    const restored = await targetSwitch.isChecked();
    if (restored !== initial) {
      throw new Error("Impossibile ripristinare stato iniziale del toggle fonte.");
    }
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
