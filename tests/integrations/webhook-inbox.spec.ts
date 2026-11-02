import { createHmac, randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createActor, fits, localTestOrigin } from "../browser/helpers";
function signed(secret: string, body: unknown) {
  const raw = JSON.stringify(body),
    timestamp = String(Math.floor(Date.now() / 1000));
  return {
    raw,
    headers: {
      "content-type": "application/json",
      "x-east-sound-timestamp": timestamp,
      "x-east-sound-signature":
        "v1=" +
        createHmac("sha256", secret)
          .update(timestamp + "." + raw)
          .digest("hex"),
    },
  };
}
function envelope() {
  return {
    id: "http_" + randomUUID(),
    type: "airplay.first",
    source: "east-sound",
    mode: "captured",
    occurred_at: new Date().toISOString(),
    recording: {
      id: "not-a-catalogue-master",
      title: "Unverified external test",
      artist: "Isolated QA",
    },
    station: { id: "capital-kla", name: "Capital FM", region: "Central" },
    message:
      "External signed QA claim, not real airplay or a notification-provider delivery.",
  };
}

test("an owner creates a masked one-time key, receives a real local HTTP event, deduplicates it and rotates without fake airplay", async ({
  page,
  context,
  baseURL,
}) => {
  const origin = localTestOrigin(baseURL);
  await createActor(context, baseURL);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/dashboard/alerts/setup");
  await expect(
    page.getByRole("heading", { name: "Your notification setup", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create private receiver" }),
  ).toBeEnabled();
  await page.getByLabel("Receiver label").fill("Browser private inbox");
  await page.getByRole("button", { name: "Create private receiver" }).click();
  await expect(page.getByText("Save this signing key now")).toBeVisible();
  expect(await page.getByLabel("Signing key value").textContent()).not.toMatch(
    /^[a-f0-9]{64}$/,
  );
  await page.getByRole("button", { name: "Reveal key", exact: true }).click();
  const secret = (await page.getByLabel("Signing key value").textContent())!;
  expect(secret).toMatch(/^[a-f0-9]{64}$/);
  const listing = await (
    await context.request.get("/api/integrations/webhooks")
  ).json();
  expect(JSON.stringify(listing)).not.toContain(secret);
  const receiver = listing.receivers[0];
  const body = envelope(),
    message = signed(secret, body);
  expect(new URL(receiver.endpointUrl).origin).toBe(origin);
  const first = await context.request.post(receiver.endpointUrl, {
    headers: { ...message.headers, "idempotency-key": "first" },
    data: message.raw,
  });
  expect(first.status(), await first.text()).toBe(202);
  const replay = await context.request.post(receiver.endpointUrl, {
    headers: { ...message.headers, "idempotency-key": "changed" },
    data: message.raw,
  });
  expect(replay.status()).toBe(200);
  expect((await replay.json()).duplicate).toBe(true);
  await page
    .getByRole("button", { name: "Refresh status", exact: true })
    .click();
  await page
    .getByText("1 most recent private receipts", { exact: true })
    .click();
  await expect(page.getByText(body.message, { exact: true })).toBeVisible();
  await expect(
    page.getByText("Signed external claim · unverified airplay", {
      exact: true,
    }),
  ).toBeVisible();
  const localStorage = await page.evaluate(() =>
    JSON.stringify(window.localStorage),
  );
  expect(localStorage).not.toContain(secret);
  await page.reload();
  await expect(page.getByText("Save this signing key now")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Run local verifier test", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Local verifier/storage test passed" }),
  ).toBeVisible();
  expect(
    (await (await context.request.get("/api/playout")).json()).records,
  ).toEqual([]);
  expect(
    (await (await context.request.get("/api/notifications/outbox")).json())
      .jobs,
  ).toEqual([]);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Rotate key", exact: true }).click();
  await page.getByRole("button", { name: "Reveal key", exact: true }).click();
  const rotated = (await page.getByLabel("Signing key value").textContent())!;
  expect(rotated).not.toBe(secret);
  const next = envelope(),
    old = signed(secret, next),
    fresh = signed(rotated, next);
  expect(
    (
      await context.request.post(receiver.endpointUrl, {
        headers: old.headers,
        data: old.raw,
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await context.request.post(receiver.endpointUrl, {
        headers: fresh.headers,
        data: fresh.raw,
      })
    ).status(),
  ).toBe(202);
  await fits(page);
  expect(errors).toEqual([]);
});

test("a separate browser account cannot read, rotate or test another owner's inbox", async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  const owner = await createActor(context, baseURL);
  const created = await context.request.post("/api/integrations/webhooks", {
    headers: {
      origin: localTestOrigin(baseURL),
      "x-east-sound-csrf": owner.csrfToken!,
    },
    data: { action: "create", label: "Owner A private receiver" },
  });
  expect(created.status()).toBe(201);
  const target = (await created.json()).receiver;
  const peer = await browser.newContext({ baseURL });
  try {
    const other = await createActor(peer, baseURL);
    const response = await peer.request.get("/api/integrations/webhooks");
    expect((await response.json()).receivers).toEqual([]);
    for (const action of ["rotate", "test", "disable"])
      expect(
        (
          await peer.request.post("/api/integrations/webhooks", {
            headers: {
              origin: localTestOrigin(baseURL),
              "x-east-sound-csrf": other.csrfToken!,
            },
            data: { action, id: target.id },
          })
        ).status(),
      ).toBe(404);
    const otherPage = await peer.newPage();
    await otherPage.goto("/dashboard/alerts/setup");
    await expect(
      otherPage.getByText("Owner A private receiver", { exact: true }),
    ).toHaveCount(0);
  } finally {
    await peer.close();
  }
  await page.goto("/dashboard/alerts/setup");
  await expect(
    page.getByText("Owner A private receiver", { exact: true }),
  ).toBeVisible();
});
for (const width of [320, 768]) {
  test(`integration setup, long labels and one-time keys fit ${width}px without revealing them by default`, async ({
    page,
    context,
    baseURL,
  }) => {
    await createActor(context, baseURL);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dashboard/alerts/setup");
    await page.getByLabel("Receiver label").fill("L".repeat(80));
    await page.getByRole("button", { name: "Create private receiver" }).click();
    await expect(page.getByText("Save this signing key now")).toBeVisible();
    await page.getByRole("button", { name: "Reveal key", exact: true }).click();
    for (const summary of await page
      .getByText("Operator environment variable names", { exact: true })
      .all())
      await summary.click();
    await fits(page);
    await page.reload();
    await expect(page.getByText("Save this signing key now")).toHaveCount(0);
  });
}
