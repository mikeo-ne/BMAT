import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45000,
  expect: { timeout: 10000 },
  outputDir: ".data/qa/browser-results",
  reporter: "list",
  use: {
    baseURL: process.env.EAST_SOUND_TEST_URL ?? "http://127.0.0.1:3000",
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
