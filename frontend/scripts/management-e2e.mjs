import { baseUrl, closeBrowser, createIssueTracker, login, openBrowserPage } from "./_e2e-utils.mjs";

const roleCases = [
  {
    role: "admin",
    expectedTabs: ["Panoramica", "Sicurezza", "Utenti", "Integrazioni"],
    forbiddenTabs: [],
    expectUsersSection: true,
  },
  {
    role: "manager",
    expectedTabs: ["Panoramica", "Sicurezza", "Utenti", "Integrazioni"],
    forbiddenTabs: [],
    expectUsersSection: true,
  },
  {
    role: "analyst",
    expectedTabs: ["Panoramica"],
    forbiddenTabs: ["Sicurezza", "Utenti", "Integrazioni"],
    expectUsersSection: false,
  },
];

const run = async () => {
  const { issues, step } = createIssueTracker();

  for (const testCase of roleCases) {
    const { browser, context, page } = await openBrowserPage();

    await step(`Management visibility (${testCase.role})`, async () => {
      await login(page, testCase.role);
      await page.getByRole("button", { name: "Configura" }).waitFor();
      await page.goto(`${baseUrl}/configurazione`, { waitUntil: "domcontentloaded" });
      await page.getByText("Management").first().waitFor();

      const tabs = await page.getByRole("tab").allTextContents();
      for (const expected of testCase.expectedTabs) {
        if (!tabs.some((value) => value.includes(expected))) {
          throw new Error(`Tab attesa non visibile per ${testCase.role}: ${expected}. Tabs presenti: ${tabs.join(", ")}`);
        }
      }
      for (const forbidden of testCase.forbiddenTabs) {
        if (tabs.some((value) => value.includes(forbidden))) {
          throw new Error(`Tab non autorizzata visibile per ${testCase.role}: ${forbidden}.`);
        }
      }

      if (testCase.expectUsersSection) {
        await page.getByRole("tab", { name: "Utenti" }).click();
        await page.getByText("Gestione utenti").waitFor();
        const newUserButton = page.getByRole("button", { name: "Nuovo utente" });
        if (!(await newUserButton.isVisible())) {
          throw new Error(`Pulsante "Nuovo utente" non visibile per ${testCase.role}.`);
        }
      } else {
        const usersTabVisible = await page.getByRole("tab", { name: "Utenti" }).isVisible().catch(() => false);
        if (usersTabVisible) {
          throw new Error(`Tab Utenti visibile per ruolo non autorizzato: ${testCase.role}.`);
        }
      }
    });

    await closeBrowser(context, browser);
  }

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
