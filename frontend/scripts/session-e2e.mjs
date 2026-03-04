import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://tenant1.localhost";
const username = process.env.QA_USERNAME || "admin";
const password = process.env.QA_PASSWORD || "Admin123!";
const hostHeader = process.env.QA_HOST_HEADER || "";

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

const run = async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext(
    hostHeader
      ? {
          extraHTTPHeaders: {
            Host: hostHeader,
          },
        }
      : undefined,
  );
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.setDefaultNavigationTimeout(20000);

  await step("Login iniziale", async () => {
    await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Accedi" }).click();
    await page.getByRole("button", { name: "Configura" }).waitFor();
  });

  await step("Access token invalido con refresh valido -> sessione resta attiva", async () => {
    const refreshToken = await page.evaluate(() => localStorage.getItem("socview_refresh_token"));
    if (!refreshToken) {
      throw new Error("Refresh token assente dopo login");
    }

    await page.evaluate(() => {
      localStorage.setItem("socview_access_token", "invalid.access.token");
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Configura" }).waitFor();
    if (page.url().includes("/login")) {
      throw new Error("Redirect a login inatteso con refresh valido");
    }
  });

  await step("Refresh invalido -> logout forzato pulito e redirect login", async () => {
    await page.evaluate(() => {
      localStorage.setItem("socview_access_token", "invalid.access.token");
      localStorage.setItem("socview_refresh_token", "invalid.refresh.token");
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/login/, { timeout: 15000 });
    const warning = page.getByText(/Sessione .* login/i).first();
    await warning.waitFor();

    const tokensLeft = await page.evaluate(() => ({
      access: localStorage.getItem("socview_access_token"),
      refresh: localStorage.getItem("socview_refresh_token"),
    }));
    if (tokensLeft.access || tokensLeft.refresh) {
      throw new Error("Token non rimossi dopo logout forzato");
    }
  });

  await context.close();
  await browser.close();
  console.log(JSON.stringify({ issues }, null, 2));
  process.exit(issues.length ? 1 : 0);
};

run().catch((error) => {
  console.error(
    JSON.stringify(
      {
        issues,
        fatal: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
