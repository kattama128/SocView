import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const scripts = [
  "session-e2e.mjs",
  "dashboard-e2e.mjs",
  "active-alarms-e2e.mjs",
  "customers-e2e.mjs",
  "customer-settings-e2e.mjs",
  "sources-e2e.mjs",
  "management-e2e.mjs",
];

const failed = [];

for (const script of scripts) {
  console.log(`\n=== RUN ${script} ===`);
  try {
    execFileSync(process.execPath, [path.join(__dirname, script)], {
      stdio: "inherit",
      env: process.env,
    });
  } catch {
    failed.push(script);
  }
}

if (failed.length) {
  console.error(
    JSON.stringify(
      {
        failed,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

console.log(JSON.stringify({ failed: [] }, null, 2));
