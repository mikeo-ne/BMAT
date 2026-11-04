import { expect, test } from "@playwright/test";
// Non-mutating public/reference deployment verification. No identity, fake captures,
// reservations, masters, credentials, notifications or external provider calls.
test("reference health is honest and unauthenticated callers cannot inspect private APIs", async ({
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
  for (const route of [
    "tracks",
    "catalogue",
    "playout",
    "stations",
    "royalties",
    "royalties/export",
    "preferences",
    "agreements",
    "audit",
    "rights-reviews",
    "notifications/outbox",
  ])
    expect(
      (await request.get(`/api/${route}?role=cmo&userId=forged`)).status(),
    ).toBe(401);
  expect(
    (await (await request.get("/api/auth/session")).json()).user,
  ).toBeNull();
  // Authorization must reject these before parsing or claiming any mutation.
  for (const method of ["POST", "PUT"] as const)
    expect(
      (
        await request.fetch("/api/tracks", {
          method,
          data: "{}",
          headers: { "content-type": "application/json" },
        })
      ).status(),
    ).toBe(401);
  for (const route of [
    "notifications/dispatch",
    "notifications/rules",
    "playout",
  ])
    expect([401, 503]).toContain(
      (await request.post(`/api/${route}`, { data: {} })).status(),
    );
  const mock = await request.post("/api/auth/mock-oauth", {
    headers: { origin: new URL(process.env.EAST_SOUND_TEST_URL!).origin },
    data: { provider: "google" },
  });
  expect(mock.status()).toBe(404);
});
for (const route of ["charts", "stats"])
  test(`public ${route} renders without private controls, writes or browser errors`, async ({
    page,
  }) => {
    const errors: string[] = [],
      writes: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (r) => {
      if (
        ["POST", "PUT", "PATCH", "DELETE"].includes(r.method()) &&
        new URL(r.url()).pathname.startsWith("/api/")
      )
        writes.push(r.url());
    });
    expect((await page.goto(`/dashboard/${route}`))?.status()).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Read-only reference deployment" }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Authenticated role: Public Guest", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Configure Airplay Alerts & Webhooks",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByLabel("Switch workspace", { exact: true }),
    ).toHaveCount(0);
    expect(errors).toEqual([]);
    expect(writes).toEqual([]);
  });
for (const route of [
  "artist",
  "artist/catalogue",
  "artist/delivery",
  "artists",
  "alerts",
  "playout",
  "monitoring",
  "cmo",
  "cmo/master",
  "east-sound",
  "mix-parser",
  "analytics/regional",
  "royalties",
  "splits",
  "advertisers",
])
  test(`unauthenticated ${route} is a sign-in gate, never exported private data`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/dashboard/${route}`);
    await expect(page).toHaveURL(/\/login\?next=/);
    await expect(
      page.getByRole("heading", { name: "Welcome back", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeDisabled();
    await expect(page.getByRole("status")).toContainText(
      "no identity datastore",
    );
    await expect(
      page.getByRole("button", { name: /Mock google/i }),
    ).toHaveCount(0);
    expect(errors).toEqual([]);
  });
test("mobile public drawer and statistic filters remain usable without authentication", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/dashboard/stats");
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Workspace navigation", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});
