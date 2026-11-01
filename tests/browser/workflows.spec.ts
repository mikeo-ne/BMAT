import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const browserErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(browserErrors.get(page)).toEqual([]);
});

const notificationKey = "east-sound:notifications:v1";
function kpi(page: Page, label: string) {
  return page
    .getByText(label, { exact: true })
    .locator("..")
    .locator("..")
    .locator("dd");
}
function wav(seconds = 10) {
  const rate = 16000;
  const bytes = Buffer.alloc(44 + rate * seconds * 2);
  bytes.write("RIFF");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVE", 8);
  bytes.write("fmt ", 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(bytes.length - 44, 40);
  for (let index = 0; index < rate * seconds; index++)
    bytes.writeInt16LE(
      Math.round(Math.sin((index / rate) * 440 * Math.PI * 2) * 4000),
      44 + index * 2,
    );
  return bytes;
}
async function fits(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  if (await page.getByRole("dialog").count())
    expect(
      await page
        .getByRole("dialog")
        .evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth + 1),
    ).toBe(true);
}

test("real reference catalogue, empty captures and source-linked artists", async ({
  page,
  request,
}) => {
  const { tracks } = await (await request.get("/api/tracks")).json();
  const references = tracks.filter(
    (track: { origin: string }) => track.origin === "public-reference",
  );
  expect(references).toHaveLength(12);
  expect(
    references.every(
      (track: {
        isrc: string;
        audio: { storedName: string | null; format: string | null };
        ownership?: unknown;
      }) =>
        track.isrc === "" &&
        track.audio.storedName === null &&
        track.audio.format === null &&
        !track.ownership,
    ),
  ).toBe(true);
  await page.goto("/dashboard/artist");
  await expect(page.getByRole("tab", { name: /Your catalogue/ })).toBeVisible();
  await page.getByRole("tab", { name: /Your catalogue/ }).click();
  await expect(page.getByText("SALO", { exact: true })).toBeVisible();
  expect(await page.locator("body").innerText()).not.toMatch(
    /Mukisa Collective|Ray Bwete|Nyege Nyege Tapes|Original seeded artists and ISRCs retained/,
  );
  await page.goto("/dashboard/artists");
  for (const artist of ["BARANGA", "MR FALLBACK", "SOUNDLYKBB", "TAI DAI"])
    await expect(
      page.getByRole("button", { name: new RegExp(artist) }).first(),
    ).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
  await fits(page);
});

test("notification binding, subscription CRUD, cross-tab KPI and safe phone simulation", async ({
  page,
  context,
}) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") writes.push(request.url());
  });
  await page.goto("/dashboard/alerts");
  await expect(kpi(page, "Active notification subscriptions")).toHaveText("0");
  await page
    .getByRole("button", { name: "Configure channels", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel(/WhatsApp phone number/).fill("+2560772123456");
  await dialog.getByRole("button", { name: "Save channel settings" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "international WhatsApp number",
  );
  await dialog.getByLabel(/WhatsApp phone number/).fill("+256 772 123456");
  await dialog.getByLabel(/recipient’s permission/).check();
  await dialog
    .getByRole("textbox", { name: "Message template", exact: true })
    .fill(
      "🔥 Airplay Alert! '{{title}}' on {{station}} ({{location}}) at {{time}}. Total spins today: {{spinsToday}}. {{trigger}}",
    );
  await dialog.getByRole("button", { name: "Save channel settings" }).click();
  await expect(dialog).toHaveCount(0);
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).whatsapp.phone,
      notificationKey,
    ),
  ).toBe("+256772123456");
  await page
    .getByRole("button", { name: "New subscription", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Subscription name").fill("Tai Dai release campaign");
  await dialog
    .getByRole("combobox", { name: "Recording", exact: true })
    .selectOption("ref_tai-dai-outside-shoes");
  await dialog.getByLabel(/Milestone thresholds/).fill("100, 1000, 10000");
  await dialog.getByRole("button", { name: "Save subscription" }).click();
  await expect(kpi(page, "Active notification subscriptions")).toHaveText("1");
  const second = await context.newPage();
  await second.goto("/dashboard/alerts");
  await expect(kpi(second, "Active notification subscriptions")).toHaveText(
    "1",
  );
  await page
    .getByRole("button", {
      name: "Pause Tai Dai release campaign",
      exact: true,
    })
    .click();
  await expect(kpi(page, "Active notification subscriptions")).toHaveText("0");
  await expect(kpi(second, "Active notification subscriptions")).toHaveText(
    "0",
  );
  await page
    .getByRole("button", {
      name: "Resume Tai Dai release campaign",
      exact: true,
    })
    .click();
  await expect(kpi(second, "Active notification subscriptions")).toHaveText(
    "1",
  );
  await second.close();
  await page
    .getByRole("button", { name: "Edit Tai Dai release campaign", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Subscription name").fill("Updated Tai Dai campaign");
  await dialog.getByRole("button", { name: "Save subscription" }).click();
  await page
    .getByLabel("Search notification subscriptions")
    .fill("not-in-the-catalogue");
  await expect(
    page.getByText("No subscriptions in this view.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reset subscription filters" })
    .click();
  const audited = await kpi(page, "Total audited spins").innerText();
  await page
    .getByRole("button", { name: "Test WhatsApp Notification", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  for (const trigger of [/^First/, /^Milestone/, /^Prime/]) {
    await dialog
      .getByRole("group", { name: "Test notification trigger" })
      .getByRole("button", { name: trigger })
      .click();
    await expect(
      dialog.getByLabel("Simulated WhatsApp notification"),
    ).toContainText("TEST — SIMULATED AIRPLAY");
  }
  await expect(
    dialog.getByLabel("Simulated WhatsApp notification"),
  ).toContainText("Outside Shoes");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(kpi(page, "Total audited spins")).toHaveText(audited);
  await page
    .getByRole("button", {
      name: "Delete Updated Tai Dai campaign",
      exact: true,
    })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete subscription", exact: true })
    .click();
  await expect(kpi(page, "Active notification subscriptions")).toHaveText("0");
  expect(writes).toEqual([]);
  await fits(page);
});

test("daily/weekly PDF downloads and safe webhook configuration previews", async ({
  page,
}) => {
  await page.goto("/dashboard/alerts");
  await page.getByRole("tab", { name: "Email digests", exact: true }).click();
  for (const kind of ["daily", "weekly"]) {
    if (kind === "weekly")
      await page
        .getByRole("button", { name: /^Weekly regional trends/ })
        .click();
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export digest PDF", exact: true })
      .click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain(kind);
    const bytes = await readFile((await download.path())!);
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  }
  await page
    .getByRole("button", { name: "Digest settings", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("tab", { name: "Email digests", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await page
    .getByRole("tab", { name: "Delivery & webhooks", exact: true })
    .click();
  await expect(page.getByLabel("Sample webhook JSON")).toContainText(
    '"mode": "simulator"',
  );
  await page
    .getByRole("button", { name: "Export worker configuration", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("recipient");
  await page.keyboard.press("Escape");
  await fits(page);
});

test("authorized station source connects only on explicit open and never produces a capture", async ({
  page,
  request,
}) => {
  const original = (await (await request.get("/api/playout")).json()).records;
  let sourceRequests = 0;
  await page.route("https://source.example.com/live.wav", async (route) => {
    sourceRequests++;
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "audio/wav",
        "access-control-allow-origin": "*",
      },
      body: wav(),
    });
  });
  await page.goto("/dashboard/monitoring");
  await page
    .getByRole("button", { name: "Configure Capital FM source", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Source HTTPS URL").fill("http://localhost/live");
  await dialog.getByRole("button", { name: /Save source/ }).click();
  await expect(dialog.getByRole("alert")).toContainText("public HTTPS");
  await dialog
    .getByLabel("Source HTTPS URL")
    .fill("https://source.example.com/live.wav");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: /Save source/ }).click();
  expect(sourceRequests).toBe(0);
  await page
    .getByRole("button", { name: "Open Capital FM feed", exact: true })
    .click();
  await page
    .getByLabel("FM source player")
    .evaluate((media: HTMLVideoElement) => media.play());
  await expect.poll(() => sourceRequests).toBeGreaterThan(0);
  await expect(
    page.getByText(
      /Capture, matching and evidence storage are separate integrations/,
    ),
  ).toBeVisible();
  expect((await (await request.get("/api/playout")).json()).records).toEqual(
    original,
  );
  await page
    .getByRole("button", { name: "Remove Capital FM source", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Open Capital FM feed", exact: true }),
  ).toHaveCount(0);
});

test("intercepted QA evidence plays ten seconds, verifies downloaded bytes and never persists", async ({
  page,
  request,
}) => {
  const before = (await (await request.get("/api/playout")).json()).records;
  const bytes = wav();
  const url = "https://evidence.example.com/qa-ten-second.wav";
  const now = new Date();
  const record = {
    id: "qa-browser-evidence-only",
    source: "captured",
    detectedAt: new Date(now.getTime() - 60000).toISOString(),
    stationId: "capital-kla",
    stationName: "Capital FM",
    region: "Central",
    medium: "FM",
    trackId: "ref_baranga-salo",
    title: "SALO",
    primaryArtist: "Baranga",
    isrc: null,
    durationSec: 154,
    confidence: 0.98,
    evidence: { url, sha256: createHash("sha256").update(bytes).digest("hex") },
  };
  await page.route("**/api/playout", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        records: [record],
        generatedAt: now.toISOString(),
      }),
    }),
  );
  await page.route(url, (route) =>
    route.fulfill({
      status: 200,
      headers: {
        "content-type": "audio/wav",
        "access-control-allow-origin": "*",
      },
      body: bytes,
    }),
  );
  await page.goto("/dashboard/playout");
  await expect(kpi(page, "Total audited spins")).toHaveText("1");
  const button = page.getByRole("button", {
    name: /^Audible evidence snippet for SALO/,
  });
  await button.click();
  const dialog = page.getByRole("dialog");
  const audio = dialog.locator("audio");
  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.duration))
    .toBe(10);
  await audio.evaluate((element: HTMLAudioElement) => element.play());
  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.paused))
    .toBe(false);
  await expect
    .poll(() =>
      audio.evaluate((element: HTMLAudioElement) => element.currentTime),
    )
    .toBeGreaterThan(0.1);
  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.paused), {
      timeout: 15000,
    })
    .toBe(true);
  expect(
    await audio.evaluate((element: HTMLAudioElement) => element.currentTime),
  ).toBeCloseTo(10, 1);
  await dialog
    .getByRole("button", { name: "Verify downloaded SHA-256", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", {
      name: "Downloaded bytes match SHA-256",
      exact: true,
    }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(button).toBeFocused();
  expect((await (await request.get("/api/playout")).json()).records).toEqual(
    before,
  );
});

test("80 MB delivery staging, local tags, rights approvals and genuine master cleanup", async ({
  page,
  request,
}) => {
  const actor = `QA Delivery ${randomUUID().slice(0, 8)}`;
  const before = (await (await request.get("/api/tracks")).json()).tracks;
  try {
    await page.goto("/dashboard/artist");
    await page.getByRole("tab", { name: /Master delivery/ }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: `${actor} - Browser QA.wav`,
      mimeType: "audio/wav",
      buffer: wav(1),
    });
    await expect(page.getByLabel(/^ISRC/)).toHaveValue(/^UG-ESD-\d{2}-\d{5}$/);
    await expect(
      page.getByRole("button", { name: "Deliver to catalogue", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", {
        name: `Record approval for ${actor}`,
        exact: true,
      })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Type the collaborator’s full name").fill(actor);
    await dialog.getByRole("checkbox").check();
    await dialog
      .getByRole("button", { name: "Record local approval", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Deliver to catalogue", exact: true }),
    ).toBeEnabled();
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/tracks") &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Deliver to catalogue", exact: true })
      .click();
    const response = await responsePromise;
    expect(response.status()).toBe(201);
    const result = await response.json();
    expect(result.track).toMatchObject({
      primaryArtist: actor,
      status: "processing",
      totalSpins: 0,
      origin: "delivered",
    });
  } finally {
    const current = (await (await request.get("/api/tracks")).json()).tracks;
    for (const track of current.filter(
      (track: { primaryArtist: string }) => track.primaryArtist === actor,
    ))
      await request.delete(`/api/tracks/${encodeURIComponent(track.id)}`);
    expect((await (await request.get("/api/tracks")).json()).tracks).toEqual(
      before,
    );
  }
});

for (const width of [320, 390]) {
  test(`responsive workspaces and notification dialogs at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    for (const route of [
      "/dashboard/artist",
      "/dashboard/alerts",
      "/dashboard/playout",
      "/dashboard/cmo",
      "/dashboard/monitoring",
      "/dashboard/artists",
      "/dashboard/analytics/regional",
      "/dashboard/advertisers",
    ]) {
      await page.goto(route);
      await fits(page);
    }
    await page.goto("/dashboard/alerts");
    await page
      .getByRole("button", { name: "Configure channels", exact: true })
      .click();
    await fits(page);
    await page
      .getByRole("dialog")
      .getByRole("tab", { name: "Webhooks", exact: true })
      .click();
    await fits(page);
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "New subscription", exact: true })
      .click();
    await fits(page);
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Test WhatsApp Notification", exact: true })
      .click();
    await fits(page);
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    const role = page.getByLabel("Switch workspace");
    expect(await role.locator("option").allTextContents()).toEqual([
      "Artist & Label Portal",
      "Broadcaster Playout Log",
      "CMO & UPRS Regulatory Auditor",
      "Advertiser Spot Tracker",
    ]);
    await role.selectOption("cmo");
    await expect(page).toHaveURL(/\/dashboard\/cmo$/);
    await fits(page);
  });
}
