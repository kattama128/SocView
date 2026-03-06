import { chromium } from "playwright";

export const baseUrl = process.env.BASE_URL || "http://localhost";
export const hostHeader = process.env.QA_HOST_HEADER || "";

export const credentials = {
  admin: {
    username: process.env.QA_USERNAME_ADMIN || process.env.QA_USERNAME || "admin",
    password: process.env.QA_PASSWORD_ADMIN || process.env.QA_PASSWORD || "admin",
  },
  manager: {
    username: process.env.QA_USERNAME_MANAGER || "analyst1",
    password: process.env.QA_PASSWORD_MANAGER || "analyst1",
  },
  analyst: {
    username: process.env.QA_USERNAME_ANALYST || "analyst1",
    password: process.env.QA_PASSWORD_ANALYST || "analyst1",
  },
};

export function createIssueTracker() {
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
  return { issues, record, step };
}

export async function openBrowserPage() {
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
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(25000);
  return { browser, context, page };
}

export async function login(page, role = "admin") {
  const creds = credentials[role];
  if (!creds) {
    throw new Error(`Ruolo login non supportato: ${role}`);
  }
  if (!creds.username || !creds.password) {
    throw new Error(`Credenziali mancanti per ruolo ${role}. Imposta le variabili QA_USERNAME*/QA_PASSWORD*.`);
  }
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-testid="username-input"], input[name="username"]').first().fill(creds.username);
  await page.locator('[data-testid="password-input"], input[name="password"]').first().fill(creds.password);
  await page.locator('[data-testid="login-button"], button[type="submit"]').first().click();
}

export async function logout(page) {
  const logoutButton = page.getByRole("button", { name: "logout" });
  if (await logoutButton.isVisible()) {
    await logoutButton.click();
  }
}

export async function closeBrowser(context, browser) {
  await context.close();
  await browser.close();
}

export async function waitForAnyText(page, patterns, timeout = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    for (const pattern of patterns) {
      const locator = page.getByText(pattern).first();
      if (await locator.isVisible().catch(() => false)) {
        return pattern;
      }
    }
    await page.waitForTimeout(200);
  }
  throw new Error(`Nessun testo atteso trovato: ${patterns.map((p) => p.toString()).join(", ")}`);
}
