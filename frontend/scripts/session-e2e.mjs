import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://localhost";
const username = process.env.QA_USERNAME || "";
const password = process.env.QA_PASSWORD || "";
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
  if (!username || !password) {
    throw new Error("Imposta QA_USERNAME e QA_PASSWORD prima di eseguire session-e2e.");
  }
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
    await page.locator('[data-testid="username-input"], input[name="username"]').first().fill(username);
    await page.locator('[data-testid="password-input"], input[name="password"]').first().fill(password);
    await page.locator('[data-testid="login-button"], button[type="submit"]').first().click();
    await page.getByRole("button", { name: "Configura" }).waitFor();
  });

  await step("Sessione persistente con cookie httpOnly e storage legacy vuoto", async () => {
    const legacyTokens = await page.evaluate(() => ({
      access: localStorage.getItem("socview_access_token"),
      refresh: localStorage.getItem("socview_refresh_token"),
    }));
    if (legacyTokens.access || legacyTokens.refresh) {
      throw new Error("Token legacy presenti in localStorage.");
    }

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Configura" }).waitFor();
    if (page.url().includes("/login")) {
      throw new Error("Redirect a login inatteso con cookie auth valido");
    }
  });

  await step("Cookie auth rimossi -> redirect login", async () => {
    await context.clearCookies();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/login/, { timeout: 15000 });
    const tokensLeft = await page
      .evaluate(() => ({
        access: localStorage.getItem("socview_access_token"),
        refresh: localStorage.getItem("socview_refresh_token"),
      }))
      .catch(() => ({ access: null, refresh: null }));
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
