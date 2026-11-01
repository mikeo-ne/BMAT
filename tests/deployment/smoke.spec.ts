import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

// This suite is intentionally non-mutating: no masters, fake captures,
// reservations, live notifications, credentials or provider requests.
test("live build identity, honest reference catalogue and disabled persistent mutations", async ({
  request,
}) => {
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  const info = await health.json();
  expect(info).toMatchObject({
    status: "ok",
    storage: "reference",
    masterDelivery: false,
    capturePolling: false,
  });
  if (process.env.EAST_SOUND_EXPECT_COMMIT)
    expect(info.commit).toBe(process.env.EAST_SOUND_EXPECT_COMMIT);
  const catalogue = await request.get("/api/tracks");
  expect(catalogue.status()).toBe(200);
  const { tracks } = await catalogue.json();
  expect(tracks).toHaveLength(12);
  expect(
    tracks.every(
      (track: {
        origin: string;
        isrc: string;
        audio: { storedName: string | null };
        ownership?: unknown;
      }) =>
        track.origin === "public-reference" &&
        !track.isrc &&
        !track.audio.storedName &&
        !track.ownership,
    ),
  ).toBe(true);
  const captures = await request.get("/api/playout");
  expect(captures.status()).toBe(200);
  expect((await captures.json()).records).toEqual([]);
  // These requests must be rejected before parsing/claiming; they create no records.
  for (const method of ["POST", "PUT"] as const) {
    const result = await request.fetch("/api/tracks", {
      method,
      data: "{}",
      headers: { "content-type": "application/json" },
    });
    expect(result.status()).toBe(503);
    expect((await result.json()).error).toContain("disabled");
  }
  for (const route of [
    "/api/notifications/dispatch",
    "/api/notifications/rules",
    "/api/playout",
  ]) {
    const result = await request.post(route, { data: {} });
    expect([401, 503]).toContain(result.status());
  }
});
for (const route of [
  "artist",
  "artists",
  "alerts",
  "playout",
  "monitoring",
  "cmo",
  "charts",
  "analytics/regional",
  "royalties",
  "splits",
  "advertisers",
]) {
  test(`live ${route} route renders without server/browser errors`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const response = await page.goto("/dashboard/" + route);
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Read-only reference deployment" }),
    ).toBeVisible();
    expect(await page.locator("body").innerText()).not.toMatch(
      /Mukisa Collective|Ray Bwete|Nyege Nyege Tapes|Application error: a server-side exception/,
    );
    expect(errors).toEqual([]);
  });
}
test("live notification controls, local-only simulator and genuine PDF download", async ({
  page,
}) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname.startsWith("/api/")
    )
      writes.push(request.url());
  });
  await page.goto("/dashboard/alerts");
  await page
    .getByRole("button", { name: "Configure channels", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Test WhatsApp Notification", exact: true })
    .click();
  await expect(
    page.getByLabel("Simulated WhatsApp notification"),
  ).toContainText("TEST — SIMULATED AIRPLAY");
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Email digests", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /PDF/ }).first().click();
  const file = await download;
  expect((await readFile((await file.path())!)).subarray(0, 5).toString()).toBe(
    "%PDF-",
  );
  expect(writes).toEqual([]);
});
test("live mobile view and read-only delivery controls remain usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/artist");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await page.getByRole("tab", { name: "Master delivery", exact: true }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "No file will be uploaded or reported saved" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Generate ISRC", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Attach audio to deliver", exact: true }),
  ).toBeDisabled();
});
