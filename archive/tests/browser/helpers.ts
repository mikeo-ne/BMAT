import { randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, type BrowserContext, type Page } from "@playwright/test";
import type { BrowserSession, AccountRole } from "@/lib/auth-types";
import type { Track } from "@/lib/types";
import { toneMaster } from "@/tests/fixtures/master";
export const QA_PASSWORD =
  "Temporary QA browser password, not a production secret!";
export const QA_INGEST_TOKEN =
  "qa-isolated-browser-capture-token-not-production-2026";
export type BrowserActor = BrowserSession & {
  user: NonNullable<BrowserSession["user"]>;
  password: string;
};
export const sample = () =>
  readFileSync(path.join(process.cwd(), "public/demo/east-sound-sample.wav"));
export const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
export function localTestOrigin(baseURL: string | undefined): string {
  if (!baseURL) throw new Error("Set an isolated browser test URL.");
  const url = new URL(baseURL);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
    throw new Error(
      "Authenticated test fixtures may only provision an isolated local test server. Use test:deployment for public remote smoke checks.",
    );
  return url.origin;
}
export function mutationHeaders(
  actor: BrowserActor,
  baseURL: string | undefined,
) {
  return {
    origin: localTestOrigin(baseURL),
    "x-east-sound-csrf": actor.csrfToken!,
  };
}
export async function createActor(
  context: BrowserContext,
  baseURL: string | undefined,
  options: { role?: AccountRole; stations?: string[]; name?: string } = {},
): Promise<BrowserActor> {
  const origin = localTestOrigin(baseURL),
    role = options.role ?? "artist",
    email = `browser-${randomUUID()}@example.com`,
    name = options.name ?? "QA Browser Artist";
  if (role !== "artist") {
    const dataDir = process.env.EAST_SOUND_E2E_DATA_DIR;
    if (
      !dataDir ||
      !path
        .resolve(dataDir)
        .startsWith(path.join(process.cwd(), ".data", "qa") + path.sep)
    )
      throw new Error(
        "Privileged browser fixtures require EAST_SOUND_E2E_DATA_DIR under this checkout's ignored .data/qa directory, matching the isolated server.",
      );
    const args = [
      "--conditions=react-server",
      "--import",
      "tsx",
      "scripts/account.ts",
      "--role",
      role,
      "--email",
      email,
      "--name",
      name,
    ];
    if (role === "broadcaster")
      args.push("--stations", (options.stations ?? ["capital-kla"]).join(","));
    execFileSync(process.execPath, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        EAST_SOUND_DATA_DIR: path.resolve(dataDir),
        EAST_SOUND_STORAGE_BACKEND: "file",
        EAST_SOUND_ACCOUNT_PASSWORD: QA_PASSWORD,
        VERCEL: "0",
        EAST_SOUND_STATIC_EXPORT: "0",
        DOTENV_CONFIG_QUIET: "true",
      },
      timeout: 30000,
    });
  }
  const response = await context.request.post(
    `/api/auth/${role === "artist" ? "register" : "login"}`,
    {
      headers: { origin },
      data: { email, password: QA_PASSWORD, name, remember: true },
    },
  );
  expect(
    response.ok(),
    `QA ${role} authentication failed: ${await response.text()}`,
  ).toBe(true);
  const session = await response.json();
  expect(session.user.role).toBe(role);
  return { ...session, password: QA_PASSWORD };
}
export async function stageMaster(
  page: Page,
  title = "Browser Master",
  artist = "QA Browser",
) {
  await page.goto("/dashboard/artist/delivery");
  await page.locator('input[type="file"]').setInputFiles({
    name: `${artist} - ${title}.wav`,
    mimeType: "audio/wav",
    buffer: sample(),
  });
  await expect(
    page.getByLabel("Computed audio signature", { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await page.getByLabel(/^Song title/).fill(title);
  await page.getByLabel(/^Primary artist/).fill(artist);
  await expect(page.getByLabel(/^ISRC/)).toHaveValue(/^UG-ESD-26-\d{5}$/);
}
export async function approveOwnAllocation(page: Page, name: string) {
  await page
    .getByLabel(`Type your credited name: ${name}`, { exact: true })
    .fill(name);
  await page.getByLabel(/I reviewed the audio hash/).check();
  const response = page.waitForResponse(
    (r) =>
      r.url().includes("/api/agreements") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Approve my allocation", exact: true })
    .click();
  expect((await response).ok()).toBe(true);
}
/** API fixture still uses the real agreement and delivery endpoints; it never writes directly to the store. */
export async function deliverApi(
  context: BrowserContext,
  baseURL: string | undefined,
  actor: BrowserActor,
  title = "QA private master",
): Promise<Track> {
  const headers = mutationHeaders(actor, baseURL),
    audio = toneMaster(2),
    metadata = {
      title,
      primaryArtist: actor.user.name,
      featuredArtists: [],
      releaseDate: "2026-11-01",
      isrc: "",
    };
  const tag = await context.request.put("/api/tracks?releaseDate=2026-11-01", {
    headers,
  });
  expect(tag.ok()).toBe(true);
  metadata.isrc = (await tag.json()).isrc;
  const created = await context.request.post("/api/agreements", {
    headers,
    data: {
      action: "create",
      metadata,
      sourceSha256: audio.signature.sourceSha256,
      fingerprintDigest: audio.signature.digest,
      parties: [
        {
          id: "primary",
          name: metadata.primaryArtist,
          role: "Primary artist",
          shares: { master: 100, performance: 100, mechanical: 100 },
        },
      ],
    },
  });
  expect(created.status()).toBe(201);
  const { agreement } = await created.json();
  const signed = await context.request.post("/api/agreements", {
    headers,
    data: {
      action: "approve",
      id: agreement.id,
      partyId: "primary",
      typedName: metadata.primaryArtist,
      acknowledgement: true,
    },
  });
  expect(signed.ok()).toBe(true);
  const response = await context.request.post("/api/tracks", {
    headers,
    multipart: {
      ...metadata,
      featuredArtists: "",
      fingerprint: JSON.stringify(audio.signature),
      agreementId: agreement.id,
      audio: {
        name: `${title}.wav`,
        mimeType: "audio/wav",
        buffer: audio.bytes,
      },
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()).track;
}
export async function ingest(
  context: BrowserContext,
  track: Track,
  stationId = "capital-kla",
  evidence = false,
) {
  const response = await context.request.post("/api/playout", {
    headers: {
      authorization: `Bearer ${process.env.EAST_SOUND_E2E_INGEST_TOKEN ?? QA_INGEST_TOKEN}`,
    },
    data: {
      records: [
        {
          id: `qa-browser-${randomUUID()}`,
          source: "captured",
          stationId,
          trackId: track.id,
          detectedAt: new Date(Date.now() - 100).toISOString(),
          durationSec: 120,
          confidence: 0.99,
          isrc: track.isrc,
          ...(evidence
            ? {
                evidence: {
                  url: "https://clips.east-sound-qa.example.com/evidence.wav",
                  sha256: sha(sample()),
                  durationSec: 10,
                },
              }
            : {}),
        },
      ],
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
}
export async function fits(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
}
export async function privateCacheKeys(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const open = indexedDB.open("east-sound-private-cache-v1", 1);
        open.onupgradeneeded = () => open.result.createObjectStore("snapshots");
        open.onerror = () => resolve([]);
        open.onsuccess = () => {
          const db = open.result,
            request = db
              .transaction("snapshots")
              .objectStore("snapshots")
              .getAllKeys();
          request.onsuccess = () => {
            db.close();
            resolve(request.result.map(String));
          };
          request.onerror = () => {
            db.close();
            resolve([]);
          };
        };
      }),
  );
}
