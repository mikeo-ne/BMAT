import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import {
  createActor,
  deliverApi,
  fits,
  localTestOrigin,
  privateCacheKeys,
  QA_PASSWORD,
  stageMaster,
} from "./helpers";
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  errors.set(page, []);
  page.on("pageerror", (e) => errors.get(page)!.push(e.message));
});
test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([]);
});
const navigation = (page: Page) =>
  page.getByRole("navigation", { name: "Dashboard", exact: true });

test("a public guest has only charts/statistics, and browser role forgery never grants private API or page access", async ({
  page,
  context,
}) => {
  const writes: string[] = [];
  page.on("request", (r) => {
    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(r.method()) &&
      new URL(r.url()).pathname.startsWith("/api/")
    )
      writes.push(r.url());
  });
  await page.goto("/dashboard/charts");
  await page.evaluate(() => {
    localStorage.setItem("east-sound:workspace:v1", "cmo");
    localStorage.setItem(
      "east-sound:session-display:v1",
      JSON.stringify({
        id: "forged",
        role: "cmo",
        name: "Not an authenticated auditor",
      }),
    );
  });
  await page.reload();
  await expect(
    page.getByLabel("Authenticated role: Public Guest", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Switch workspace", { exact: true }),
  ).toHaveCount(0);
  expect(await navigation(page).getByRole("link").allTextContents()).toEqual([
    "National Top 100 charts",
    "Public airplay statistics",
  ]);
  await navigation(page)
    .getByRole("link", { name: "Public airplay statistics", exact: true })
    .click();
  await expect(page).toHaveURL(/\/dashboard\/stats$/);
  for (const region of ["Central", "Eastern", "Western", "Northern"]) {
    const target = page.getByRole("button", {
      name: new RegExp(`^Filter to ${region} region`),
    });
    await target.focus();
    await target.press("Enter");
    await expect(target).toHaveAttribute("aria-pressed", "true");
  }
  for (const api of [
    "tracks",
    "catalogue",
    "playout",
    "stations",
    "royalties",
    "audit",
    "agreements",
    "preferences",
    "notifications/outbox",
    "rights-reviews",
  ])
    expect(
      (
        await context.request.get(`/api/${api}?role=cmo&userId=forged`)
      ).status(),
    ).toBe(401);
  await page.goto("/dashboard/artist/delivery");
  await expect(page).toHaveURL(/\/login\?next=/);
  expect(new URL(page.url()).searchParams.get("next")).toBe(
    "/dashboard/artist/delivery",
  );
  await expect(
    page.getByRole("heading", { name: "Welcome back", exact: true }),
  ).toBeVisible();
  await fits(page);
  expect(writes).toEqual([]);
});

test("email/password signup, HttpOnly persistence, same-role account swaps and cross-tab logout keep caches isolated", async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  const peer = await browser.newContext({ baseURL }),
    beta = await createActor(peer, baseURL, {
      name: "Separate Browser Artist",
    });
  await page.goto("/login?next=%2Fdashboard%2Fartist%2Fdelivery");
  await page
    .getByRole("button", {
      name: "New artist or label? Create an account",
      exact: true,
    })
    .click();
  const email = `signup-${randomUUID()}@example.com`;
  await page
    .getByLabel("Your name", { exact: true })
    .fill("Browser Signup Artist");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(QA_PASSWORD);
  await page
    .getByRole("button", { name: "Create artist account", exact: true })
    .click();
  await expect(page).toHaveURL(/\/dashboard\/artist\/delivery$/);
  const alpha = await (await context.request.get("/api/auth/session")).json();
  const cookie = (await context.cookies()).find(
    (c) => c.name === "east_sound_session",
  )!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.sameSite).toBe("Lax");
  expect(cookie.expires * 1000).toBeGreaterThan(Date.now() + 6 * 86400000);
  const master = await deliverApi(
    context,
    baseURL,
    { ...alpha, password: QA_PASSWORD },
    "Alpha private catalogue title",
  );
  await page.goto("/dashboard/artist/catalogue");
  await expect(
    page.getByText(master.title, { exact: true }).first(),
  ).toBeVisible();
  await expect
    .poll(async () =>
      (await privateCacheKeys(page)).some((k) =>
        k.startsWith(alpha.user.id + ":catalogue"),
      ),
    )
    .toBe(true);
  const local = await page.evaluate(() => ({
    data: JSON.stringify(localStorage),
    cookies: document.cookie,
  }));
  expect(local.data).not.toContain(QA_PASSWORD);
  expect(local.data).not.toContain(cookie.value);
  expect(local.cookies).not.toContain("east_sound_session");
  await page.evaluate(() =>
    localStorage.setItem(
      "east-sound:session-display:v1",
      JSON.stringify({ id: "forged", role: "cmo" }),
    ),
  );
  await page.reload();
  await expect(
    page.getByLabel("Authenticated role: Artist / Label Manager", {
      exact: true,
    }),
  ).toBeVisible();
  expect((await context.request.get("/api/royalties")).status()).toBe(403);
  const otherTab = await context.newPage();
  await otherTab.goto("/dashboard/artist/catalogue");
  // Exercise session invalidation even when the second tab cannot rely on a storage event.
  await page.evaluate(
    async ({ email, password, origin }) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", origin },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) throw new Error("QA login failed");
      window.dispatchEvent(new Event("east-sound:auth-changed"));
    },
    {
      email: beta.user.email,
      password: QA_PASSWORD,
      origin: localTestOrigin(baseURL),
    },
  );
  await expect(page).toHaveURL(/\/dashboard\/artist$/);
  await expect(otherTab).toHaveURL(/\/dashboard\/artist$/);
  for (const tab of [page, otherTab]) {
    await expect(tab.locator("body")).not.toContainText(master.title);
    await expect
      .poll(async () =>
        (await privateCacheKeys(tab)).some((k) =>
          k.startsWith(alpha.user.id + ":"),
        ),
      )
      .toBe(false);
  }
  const current = await (await context.request.get("/api/auth/session")).json();
  expect(current.user.id).toBe(beta.user.id);
  const betaCatalogue = await (await context.request.get("/api/tracks")).text();
  expect(betaCatalogue).not.toContain(master.title);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/charts$/);
  await expect(otherTab).toHaveURL(/\/dashboard\/charts$/);
  expect((await context.request.get("/api/tracks")).status()).toBe(401);
  await expect
    .poll(async () =>
      (await privateCacheKeys(page)).some((k) =>
        k.startsWith(beta.user.id + ":"),
      ),
    )
    .toBe(false);
  await otherTab.close();
  await peer.close();
});

test("real artist/library/delivery navigation preserves a decoded draft without role switching", async ({
  page,
  context,
  baseURL,
}) => {
  await createActor(context, baseURL);
  await stageMaster(page, "Preserved navigation draft", "QA Navigation");
  const isrc = await page.getByLabel(/^ISRC/).inputValue();
  await navigation(page)
    .getByRole("link", { name: "My catalogue & ISRC", exact: true })
    .click();
  await expect(page).toHaveURL(/\/dashboard\/artist\/catalogue$/);
  await navigation(page)
    .getByRole("link", { name: "Artists & music", exact: true })
    .click();
  await expect(page).toHaveURL(/\/dashboard\/artists$/);
  for (const artist of ["BARANGA", "MR FALLBACK", "SOUNDLYKBB", "TAI DAI"])
    await expect(
      page.getByRole("button", { name: new RegExp(artist) }).first(),
    ).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
  await navigation(page)
    .getByRole("link", { name: "Deliver a master", exact: true })
    .click();
  await expect(page.getByLabel(/^Song title/)).toHaveValue(
    "Preserved navigation draft",
  );
  await expect(page.getByLabel(/^ISRC/)).toHaveValue(isrc);
  await expect(
    page.getByLabel("Computed audio signature", { exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard\/artists$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/dashboard\/artist\/delivery$/);
  await fits(page);
});

for (const width of [320, 768])
  test(`the public drawer traps focus and the authenticated delivery form fits ${width}px`, async ({
    page,
    context,
    baseURL,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dashboard/charts");
    const opener = page.getByRole("button", {
      name: "Open navigation",
      exact: true,
    });
    await opener.click();
    const dialog = page.getByRole("dialog", {
      name: "Workspace navigation",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    const home = dialog.getByRole("link", {
      name: "East Sound home",
      exact: true,
    });
    await expect(home).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(
      dialog.getByRole("link", {
        name: "Public airplay statistics",
        exact: true,
      }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(home).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    await fits(page);
    await createActor(context, baseURL);
    await stageMaster(page);
    await fits(page);
    await page
      .getByRole("button", {
        name: "Configure Airplay Alerts & Webhooks",
        exact: true,
      })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await fits(page);
    await page.keyboard.press("Escape");
  });
