import path from "node:path";
import { defineConfig } from "@playwright/test";
const baseURL = process.env.EAST_SOUND_INTEGRATION_TEST_URL;
const directory = process.env.EAST_SOUND_INTEGRATION_DATA_DIR;
const database = process.env.EAST_SOUND_INTEGRATION_DATABASE_URL;
let localDatabase = false;
try {
  const url = new URL(database ?? "");
  localDatabase =
    ["postgres:", "postgresql:"].includes(url.protocol) &&
    ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
} catch {}
if (
  !baseURL ||
  !["127.0.0.1", "localhost", "[::1]"].includes(new URL(baseURL).hostname) ||
  !localDatabase ||
  !directory ||
  !path
    .resolve(directory)
    .startsWith(path.join(process.cwd(), ".data", "qa") + path.sep)
) {
  throw new Error(
    "Integration browser tests require an explicitly isolated loopback PostgreSQL app and matching .data/qa data directory. Never point them at production.",
  );
}
export default defineConfig({
  testDir: "./tests/integrations",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60000,
  expect: { timeout: 10000 },
  outputDir: ".data/qa/integration-browser-results",
  reporter: "list",
  use: {
    baseURL,
    acceptDownloads: false,
    viewport: { width: 1536, height: 1040 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: {
      ...(process.env.EAST_SOUND_BROWSER_PATH
        ? { executablePath: process.env.EAST_SOUND_BROWSER_PATH }
        : {}),
      ...(process.env.EAST_SOUND_BROWSER_ARGS
        ? { args: JSON.parse(process.env.EAST_SOUND_BROWSER_ARGS) as string[] }
        : {}),
    },
  },
});
