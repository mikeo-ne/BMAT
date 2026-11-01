import path from "node:path";
import { defineConfig } from "@playwright/test";
const baseURL = process.env.EAST_SOUND_TEST_URL ?? "http://127.0.0.1:3010";
const dataDir =
  process.env.EAST_SOUND_E2E_DATA_DIR ??
  path.join(process.cwd(), ".data/qa/browser-isolated");
process.env.EAST_SOUND_E2E_DATA_DIR = dataDir;
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60000,
  expect: { timeout: 10000 },
  outputDir: ".data/qa/browser-results",
  reporter: "list",
  ...(!process.env.EAST_SOUND_TEST_URL
    ? {
        webServer: {
          command: "npm run dev -- --hostname 0.0.0.0 --port 3010",
          url: baseURL,
          reuseExistingServer: false,
          timeout: 120000,
          env: {
            EAST_SOUND_STORAGE_BACKEND: "file",
            EAST_SOUND_DATA_DIR: dataDir,
            EAST_SOUND_APP_ORIGIN: baseURL,
            EAST_SOUND_MOCK_OAUTH: "1",
            EAST_SOUND_LIVE_NOTIFICATIONS: "false",
            EAST_SOUND_STATIC_EXPORT: "0",
            VERCEL: "0",
            EAST_SOUND_INGEST_TOKEN:
              process.env.EAST_SOUND_E2E_INGEST_TOKEN ??
              "qa-isolated-browser-capture-token-not-production-2026",
          },
        },
      }
    : {}),
  use: {
    baseURL,
    actionTimeout: 15000,
    navigationTimeout: 30000,
    viewport: { width: 1536, height: 1040 },
    acceptDownloads: true,
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
