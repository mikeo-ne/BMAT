import { defineConfig } from "@playwright/test";

const baseURL = process.env.EAST_SOUND_TEST_URL;
if (!baseURL)
  throw new Error(
    "Set EAST_SOUND_TEST_URL to the approved Vercel deployment URL.",
  );
const address = new URL(baseURL);
const localReference =
  process.env.EAST_SOUND_LOCAL_REFERENCE_SMOKE === "1" &&
  address.protocol === "http:" &&
  ["127.0.0.1", "localhost", "[::1]"].includes(address.hostname);
const approvedRemote =
  address.protocol === "https:" &&
  !address.port &&
  address.hostname.endsWith(".vercel.app");
if (
  (!localReference && !approvedRemote) ||
  address.username ||
  address.password ||
  address.search ||
  address.hash ||
  !["", "/"].includes(address.pathname)
)
  throw new Error(
    "Use an approved HTTPS Vercel URL, or explicitly opt into an isolated loopback reference smoke server.",
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
    actionTimeout: 15000,
    navigationTimeout: 30000,
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
