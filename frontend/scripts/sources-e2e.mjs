import { baseUrl, closeBrowser, createIssueTracker, login, openBrowserPage } from "./_e2e-utils.mjs";

const isPublicHost = (host) => {
  const hostname = host.split(":")[0] ?? host;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
};

const run = async () => {
  const { issues, step, record } = createIssueTracker();
  const { browser, context, page } = await openBrowserPage();
  let createdSource = false;
  let createdSourceId = null;
  let createdSourceName = null;
  let accessToken = null;
  let tenantHost = (() => {
    try {
      const configuredHost = new URL(baseUrl).host;
      return isPublicHost(configuredHost) ? "tenant1.localhost" : configuredHost;
    } catch {
      return "tenant1.localhost";
    }
  })();

  const apiRequest = async (path, method = "GET", payload = null) => {
    if (!accessToken) {
      throw new Error("Token API assente per test Sources.");
    }
    const response = await context.request.fetch(`http://localhost/api${path}`, {
      method,
      headers: {
        Host: tenantHost,
        Authorization: `Bearer ${accessToken}`,
      },
      ...(payload ? { data: payload } : {}),
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    return { response, data };
  };

  await step("Login admin", async () => {
    await login(page, "admin");
    await page.getByRole("button", { name: "Configura" }).waitFor();
    const currentHost = new URL(page.url()).host;
    if (!isPublicHost(currentHost)) {
      tenantHost = currentHost;
    }
    accessToken = await page.evaluate(() => localStorage.getItem("socview_access_token"));
    if (!accessToken) {
      throw new Error("Access token non disponibile dopo login.");
    }
  });

  await step("Apertura Sources", async () => {
    await page.goto(`${baseUrl}/sources`, { waitUntil: "domcontentloaded" });
    await page.getByText("Sources").first().waitFor();
  });

  await step("CRUD base: create + update source", async () => {
    const { response: createResponse, data: createdPayload } = await apiRequest(
      "/ingestion/sources/create-from-preset/",
      "POST",
      { preset_key: "canary_tools_rest" },
    );
    if (createResponse.status() >= 400) {
      throw new Error(`Create source via API fallita con status ${createResponse.status()}.`);
    }
    createdSourceId = Number(createdPayload?.id ?? 0) || null;
    createdSourceName = typeof createdPayload?.name === "string" ? createdPayload.name : null;
    if (!createdSourceId || !createdSourceName) {
      throw new Error("Create source da preset senza payload id/name valido.");
    }

    await page.goto(`${baseUrl}/sources`, { waitUntil: "domcontentloaded" });
    await page.getByText(createdSourceName).first().click();
    const descriptionField = page.getByLabel(/Descrizione/i);
    await descriptionField.waitFor({ timeout: 15000 });
    await descriptionField.fill(`E2E updated ${Date.now()}`);

    const patchResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/ingestion/sources/${createdSourceId}/`) &&
        response.request().method() === "PATCH",
      { timeout: 20000 },
    );
    const sourceConfigCard = page
      .getByText("Source Configuration")
      .first()
      .locator("xpath=ancestor::div[contains(@class,'MuiPaper-root')][1]");
    const saveButton = sourceConfigCard.getByRole("button", { name: /^Salva$/ });
    await saveButton.click();
    const patchResponse = await patchResponsePromise;
    if (patchResponse.status() >= 400) {
      throw new Error(`Update source fallita con status ${patchResponse.status()}.`);
    }

    createdSource = true;
  });

  await step("Test connection reale", async () => {
    const button = page.getByRole("button", { name: "Test connessione" });
    if (!(await button.isEnabled())) {
      throw new Error("Pulsante Test connessione disabilitato per la fonte test.");
    }
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/ingestion/sources/") &&
        response.url().includes("/test-connection/") &&
        response.request().method() === "POST",
      { timeout: 20000 },
    );
    await button.click();
    const response = await responsePromise;
    if (response.status() >= 400) {
      throw new Error(`Test connection fallita con status ${response.status()}.`);
    }
    await page.waitForTimeout(400);
  });

  await step("Run now reale", async () => {
    const button = page.getByRole("button", { name: "Run now" });
    if (!(await button.isEnabled())) {
      throw new Error("Pulsante Run now disabilitato per la fonte test.");
    }
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/ingestion/sources/") &&
        response.url().includes("/run-now/") &&
        response.request().method() === "POST",
      { timeout: 20000 },
    );
    await button.click();
    const response = await responsePromise;
    if (response.status() >= 400) {
      throw new Error(`Run now fallita con status ${response.status()}.`);
    }
    await page.waitForTimeout(400);
  });

  await step("Parser preview reale", async () => {
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/ingestion/parsers/") &&
        response.url().includes("/preview") &&
        response.request().method() === "POST",
      { timeout: 20000 },
    );
    await page.getByRole("button", { name: "Preview" }).click();
    const response = await responsePromise;
    if (response.status() >= 400) {
      throw new Error(`Parser preview fallita con status ${response.status()}.`);
    }
    await page.getByText("Preview parser completata.").waitFor({ timeout: 15000 });
    await page.getByText("Preview output").waitFor();
  });

  await step("Cleanup: delete source creata dal test", async () => {
    if (!createdSource || !createdSourceId) {
      return;
    }
    const { response } = await apiRequest(`/ingestion/sources/${createdSourceId}/`, "DELETE");
    if (response.status() >= 400) {
      throw new Error(`Delete source via API fallita con status ${response.status()}.`);
    }
    await page.waitForTimeout(400);
  });

  if (createdSource && createdSourceId) {
    const { response, data } = await apiRequest("/ingestion/sources/");
    if (response.status() >= 400) {
      record("Cleanup source", `Impossibile verificare cleanup via API (status ${response.status()}).`);
    } else if (Array.isArray(data) && data.some((item) => Number(item?.id) === createdSourceId)) {
      record("Cleanup source", `La fonte temporanea con id ${createdSourceId} risulta ancora presente dopo eliminazione.`);
    }
  }

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
