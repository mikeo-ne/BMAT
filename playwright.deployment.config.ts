import { defineConfig } from "@playwright/test";

const baseURL = process.env.EAST_SOUND_TEST_URL;
if (!baseURL)
  throw new Error(
    "Set EAST_SOUND_TEST_URL to the approved Vercel deployment URL.",
  );
const address = new URL(baseURL);
if (
  address.protocol !== "https:" ||
  address.username ||
  address.password ||
  address.port ||
  address.search ||
  address.hash ||
  !["", "/"].includes(address.pathname) ||
  !address.hostname.endsWith(".vercel.app")
)
  throw new Error(
    "Deployment verification requires an HTTPS Vercel URL without credentials.",
  );

export default defineConfig({
  testDir: "./tests/deployment",
  workers: 1,
  retries: 0,
  fullyParallel: false,
  timeout: 60000,
  expect: { timeout: 15000 },
  outputDir: ".data/qa/deployment-results",
  reporter: "list",
  use: {
    baseURL,
    viewport: { width: 1440, height: 1000 },
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
