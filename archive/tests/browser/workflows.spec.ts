import { open, readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import {
  approveOwnAllocation,
  createActor,
  deliverApi,
  fits,
  ingest,
  mutationHeaders,
  privateCacheKeys,
  QA_PASSWORD,
  sample,
  sha,
  stageMaster,
} from "./helpers";
const browserErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  browserErrors.set(page, []);
  page.on("pageerror", (e) => browserErrors.get(page)!.push(e.message));
});
test.afterEach(({ page }) => {
  expect(browserErrors.get(page)).toEqual([]);
});

test("Web Audio fingerprint, independent co-writer sign-off, private delivery/playback and authenticated withdrawal", async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  const owner = await createActor(context, baseURL, { name: "QA Browser" }),
    peerContext = await browser.newContext({ baseURL }),
    writer = await createActor(peerContext, baseURL, { name: "Co Writer" });
  await stageMaster(page, "Independent approval master", "QA Browser");
  await page
    .getByRole("button", { name: "Add co-writer", exact: true })
    .click();
  await page
    .getByLabel("Collaborator 2 name", { exact: true })
    .fill("Co Writer");
  await page
    .getByLabel("Collaborator 2 email", { exact: true })
    .fill(writer.user.email);
  for (const pool of [
    "Master ownership",
    "Performance rights",
    "Mechanical splits",
  ]) {
    await page.getByRole("button", { name: new RegExp(`^${pool}`) }).click();
    await page
      .getByLabel(`QA Browser ${pool} percentage`, { exact: true })
      .fill("60");
    await page
      .getByLabel(`Co Writer ${pool} percentage`, { exact: true })
      .fill("40");
  }
  const createdResponse = page.waitForResponse(
    (r) =>
      r.url().includes("/api/agreements") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", {
      name: "Create agreement & invite collaborators",
      exact: true,
    })
    .click();
  const created = await createdResponse;
  expect(created.status()).toBe(201);
  const contract = await created.json();
  await approveOwnAllocation(page, "QA Browser");
  await expect(
    page.getByRole("button", { name: "Deliver to catalogue", exact: true }),
  ).toBeDisabled();
  const token = contract.invitations[0].token,
    forged = await context.request.post("/api/agreements", {
      headers: mutationHeaders(owner, baseURL),
      data: {
        action: "approve",
        invite: token,
        typedName: "Co Writer",
        acknowledgement: true,
      },
    });
  expect(forged.status()).toBe(404);
  await peerContext.clearCookies();
  const peer = await peerContext.newPage(),
    invitePath = `/dashboard/splits?invite=${token}`;
  await peer.goto(invitePath);
  await expect(peer).toHaveURL(/\/login\?next=/);
  expect(new URL(peer.url()).searchParams.get("next")).toBe(invitePath);
  await peer
    .getByLabel("Email address", { exact: true })
    .fill(writer.user.email);
  await peer.getByLabel("Password", { exact: true }).fill(QA_PASSWORD);
  await peer.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(peer).toHaveURL(
    new RegExp(`/dashboard/splits\\?invite=${token}$`),
  );
  await approveOwnAllocation(peer, "Co Writer");
  await expect(
    peer.getByText(
      "Your approval has been recorded against this exact version.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Refresh sign-offs", exact: true })
    .click();
  await expect(
    page.getByText("All accounts approved. Delivery unlocked.", {
      exact: true,
    }),
  ).toBeVisible();
  const posted = page.waitForResponse(
    (r) => r.url().endsWith("/api/tracks") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Deliver to catalogue", exact: true })
    .click();
  const delivered = await posted;
  expect(delivered.status()).toBe(201);
  const { track } = await delivered.json();
  expect(track.fingerprint).toMatchObject({
    algorithm: "pcm-rms-fft-v1",
    sourceSha256: sha(sample()),
    sampleRate: 11025,
  });
  expect(track.fingerprint.waveform).toHaveLength(128);
  expect(track.fingerprint.bands).toHaveLength(1024);
  expect(new Set(track.fingerprint.bands).size).toBeGreaterThan(3);
  expect(
    track.ownership.parties
      .map((p: { signature: { userId: string } }) => p.signature.userId)
      .sort(),
  ).toEqual([owner.user.id, writer.user.id].sort());
  const player = page.getByLabel(
    "Play your master Independent approval master",
    { exact: true },
  );
  await player.evaluate(async (el: HTMLAudioElement) => {
    await el.play();
  });
  await expect
    .poll(() => player.evaluate((el: HTMLAudioElement) => el.currentTime))
    .toBeGreaterThan(0.1);
  expect(
    (await peerContext.request.get(`/api/tracks/${track.id}`)).status(),
  ).toBe(404);
  const range = await context.request.get(`/api/tracks/${track.id}`, {
    headers: { range: "bytes=0-43" },
  });
  expect(range.status()).toBe(206);
  expect(await range.body()).toEqual(sample().subarray(0, 44));
  const deleteResponse = await context.request.delete(
    `/api/tracks/${track.id}`,
    { headers: mutationHeaders(owner, baseURL) },
  );
  expect(deleteResponse.status()).toBe(200);
  expect((await context.request.get(`/api/tracks/${track.id}`)).status()).toBe(
    404,
  );
  await peerContext.close();
});

test("actual MP3 decoding computes nonzero spectral features, while oversize and non-audio files fail before delivery", async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  await createActor(context, baseURL);
  await page.goto("/dashboard/artist/delivery");
  const tooLarge = testInfo.outputPath("too-large.wav"),
    handle = await open(tooLarge, "w");
  await handle.truncate(80 * 1024 * 1024 + 1);
  await handle.close();
  await page.locator('input[type="file"]').setInputFiles(tooLarge);
  await expect(page.locator("body")).toContainText(/80 MB|80 MiB/);
  await expect(
    page.getByLabel("Computed audio signature", { exact: true }),
  ).toHaveCount(0);
  await page.locator('input[type="file"]').setInputFiles({
    name: "cover.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from([0, 1]),
  });
  await expect(page.locator("body")).toContainText("not an audio file");
  const mp3 = await readFile("public/demo/east-sound-sample.mp3");
  await page.locator('input[type="file"]').setInputFiles({
    name: "QA MP3 - Decoded source.mp3",
    mimeType: "audio/mpeg",
    buffer: mp3,
  });
  await expect(
    page.getByLabel("Computed audio signature", { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await expect(
    page.getByRole("img", {
      name: "Waveform energy of the uploaded master",
      exact: true,
    }),
  ).toBeVisible();
  const heights = await page
    .getByRole("img", {
      name: "Waveform energy of the uploaded master",
      exact: true,
    })
    .locator("rect")
    .evaluateAll((rects) => rects.map((r) => Number(r.getAttribute("height"))));
  expect(Math.max(...heights)).toBeGreaterThan(3);
  await expect(
    page.getByRole("button", { name: "Deliver to catalogue", exact: true }),
  ).toBeDisabled();
  await fits(page);
});

test("account-persisted phone/webhook settings automatically enqueue owned captures and keep the WhatsApp simulator/PDF local", async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  const actor = await createActor(context, baseURL),
    track = await deliverApi(
      context,
      baseURL,
      actor,
      "Notification binding master",
    ),
    otherContext = await browser.newContext({ baseURL });
  await createActor(otherContext, baseURL);
  await page.goto("/dashboard/alerts");
  await page
    .getByRole("button", { name: "Configure channels", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel(/WhatsApp phone number/).fill("+256 772 123456");
  await dialog.getByLabel(/recipient’s permission/).check();
  await dialog
    .getByRole("button", { name: "Save channel settings", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("button", { name: "Configure channels", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Webhooks", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Add webhook destination", exact: true })
    .click();
  const secret = "qa-write-only-webhook-signing-secret-not-a-provider-token";
  await dialog
    .getByLabel("Label or destination name", { exact: true })
    .fill("QA Label");
  await dialog.getByLabel(/Webhook signing secret/).fill(secret);
  await dialog
    .getByLabel("Webhook HTTPS URL", { exact: true })
    .fill("https://hooks.east-sound-qa.example.com/airplay");
  await dialog
    .getByRole("button", { name: "Save channel settings", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("button", { name: "New subscription", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Subscription name", { exact: true })
    .fill("QA owned first spin");
  await dialog
    .getByRole("combobox", { name: "Recording", exact: true })
    .selectOption(track.id);
  await dialog
    .getByRole("group", { name: "Instant triggers", exact: true })
    .getByRole("checkbox")
    .nth(0)
    .check();
  await dialog
    .getByRole("group", { name: "Instant triggers", exact: true })
    .getByRole("checkbox")
    .nth(1)
    .uncheck();
  await dialog
    .getByRole("group", { name: "Instant triggers", exact: true })
    .getByRole("checkbox")
    .nth(2)
    .uncheck();
  await dialog.getByLabel("WhatsApp", { exact: true }).check();
  await dialog.getByLabel("Webhook", { exact: true }).check();
  await dialog
    .getByRole("button", { name: "Save subscription", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const prefs = await (await context.request.get("/api/preferences")).text();
  expect(prefs).not.toContain(secret);
  expect(prefs).toContain('"secretConfigured":true');
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    secret,
  );
  await ingest(context, track);
  const jobs = (
    await (await context.request.get("/api/notifications/outbox")).json()
  ).jobs;
  expect(jobs.map((j: { channel: string }) => j.channel).sort()).toEqual([
    "webhook",
    "whatsapp",
  ]);
  expect(
    jobs.every(
      (j: { status: string; attempts: number }) =>
        j.status === "queued" && j.attempts === 0,
    ),
  ).toBe(true);
  expect(
    (await (await otherContext.request.get("/api/notifications/outbox")).json())
      .jobs,
  ).toEqual([]);
  const outbox = page.getByLabel("Private automatic notification outbox", {
    exact: true,
  });
  await outbox.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(outbox).toContainText(track.title);
  const writes: string[] = [];
  page.on("request", (r) => {
    if (["POST", "PUT", "DELETE"].includes(r.method())) writes.push(r.url());
  });
  await page
    .getByRole("button", {
      name: "Log demo spin & preview WhatsApp",
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel("WhatsApp phone simulator", { exact: true }),
  ).toContainText(
    "🔥 Airplay Alert! 'Mulongo' just played on Capital FM (Kampala)",
  );
  expect(writes).toEqual([]);
  expect(
    (await (await context.request.get("/api/notifications/outbox")).json())
      .jobs,
  ).toHaveLength(2);
  await page.getByRole("tab", { name: "Email digests", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: /PDF/ }).first().click();
  const file = await downloaded;
  expect((await readFile((await file.path())!)).subarray(0, 5).toString()).toBe(
    "%PDF-",
  );
  await otherContext.close();
});

test("station-manager assignments govern logs, source settings and ad options; source/evidence audio genuinely plays", async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  const ownerContext = await browser.newContext({ baseURL }),
    owner = await createActor(ownerContext, baseURL),
    track = await deliverApi(
      ownerContext,
      baseURL,
      owner,
      "Scoped station evidence " + crypto.randomUUID().slice(0, 8),
    );
  const manager = await createActor(context, baseURL, {
    role: "broadcaster",
    stations: ["cbs-kla"],
  });
  await ingest(ownerContext, track, "cbs-kla", true);
  await ingest(ownerContext, track, "capital-kla");
  const clips: string[] = [];
  await page.route(
    "https://clips.east-sound-qa.example.com/**",
    async (route) => {
      clips.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: "audio/wav",
        headers: { "access-control-allow-origin": "*" },
        body: sample(),
      });
    },
  );
  await page.goto("/dashboard/playout");
  await expect(
    page.getByLabel("Authenticated role: Broadcaster / Station Manager", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Configure Airplay Alerts & Webhooks",
      exact: true,
    }),
  ).toHaveCount(0);
  const records = (await (await context.request.get("/api/playout")).json())
    .records;
  expect(
    records.every((r: { stationId: string }) => r.stationId === "cbs-kla"),
  ).toBe(true);
  expect(
    (await context.request.get("/api/playout?stationId=capital-kla")).status(),
  ).toBe(403);
  await page
    .getByRole("button", {
      name: new RegExp(
        `^Audible evidence snippet for ${track.title} on CBS FM`,
      ),
    })
    .click();
  let dialog = page.getByRole("dialog", {
    name: "Audible Evidence Snippet",
    exact: true,
  });
  const evidence = dialog.getByLabel(
    "10-second broadcast evidence from CBS FM",
    { exact: true },
  );
  await expect
    .poll(() =>
      evidence.evaluate((el: HTMLAudioElement) =>
        Number.isFinite(el.duration) ? el.duration : 0,
      ),
    )
    .toBe(10);
  await evidence.evaluate(async (el: HTMLAudioElement) => {
    await el.play();
  });
  await expect
    .poll(() => evidence.evaluate((el: HTMLAudioElement) => el.currentTime))
    .toBeGreaterThan(0.1);
  await dialog.getByRole("button", { name: /Verify/ }).click();
  await expect(dialog).toContainText(
    /bytes match|SHA-256 verified|Digest verified/i,
  );
  await page.keyboard.press("Escape");
  await page.goto("/dashboard/monitoring");
  await expect(
    page.getByRole("button", {
      name: "Configure Capital FM source",
      exact: true,
    }),
  ).toHaveCount(0);
  const beforeSources = clips.length;
  await page
    .getByRole("button", { name: "Connect a station source", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  expect(
    await dialog
      .getByRole("combobox", { name: "Station", exact: true })
      .locator("option")
      .allTextContents(),
  ).toEqual(["CBS FM · FM"]);
  await dialog
    .getByLabel("Source HTTPS URL", { exact: true })
    .fill("https://clips.east-sound-qa.example.com/station.wav");
  await dialog.getByLabel(/I am authorised/).check();
  await dialog
    .getByRole("button", { name: "Save source", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(clips).toHaveLength(beforeSources);
  await page
    .getByRole("button", { name: "Open CBS FM feed", exact: true })
    .click();
  const stream = page.getByLabel("FM source player", { exact: true });
  await stream.evaluate(async (el: HTMLVideoElement) => {
    await el.play();
  });
  await expect
    .poll(() => stream.evaluate((el: HTMLVideoElement) => el.currentTime))
    .toBeGreaterThan(0.1);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Open CBS FM feed", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      (await privateCacheKeys(page)).includes(manager.user.id + ":stations"),
    )
    .toBe(true);
  await page.goto("/dashboard/advertisers");
  await page.locator("#campaign-create").evaluate((el) => {
    if (el instanceof HTMLDetailsElement) el.open = true;
  });
  const station = page.getByRole("combobox", { name: "Station", exact: true });
  expect(
    await station
      .locator("option")
      .evaluateAll((options) =>
        options.map((option) => (option as HTMLOptionElement).value),
      ),
  ).toEqual(["cbs-kla"]);
  await expect(station.locator("option")).toContainText("CBS FM");
  await fits(page);
  await ownerContext.close();
});

test("CMO ledgers and immutable split-resolution decisions persist, while ordinary artists cannot invoke them", async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  const ownerContext = await browser.newContext({ baseURL }),
    owner = await createActor(ownerContext, baseURL),
    track = await deliverApi(
      ownerContext,
      baseURL,
      owner,
      "CMO signed review master",
    );
  await ingest(ownerContext, track);
  await createActor(context, baseURL, { role: "cmo", name: "QA CMO Auditor" });
  await page.goto("/dashboard/cmo");
  await expect(
    page.getByLabel("Authenticated role: CMO Auditor", { exact: true }),
  ).toBeVisible();
  expect((await context.request.get("/api/audit")).status()).toBe(200);
  expect(
    (await context.request.get("/api/royalties/export")).headers()[
      "content-type"
    ],
  ).toContain("csv");
  expect((await ownerContext.request.get("/api/rights-reviews")).status()).toBe(
    403,
  );
  await page.goto("/dashboard/splits");
  const review = page.getByLabel("CMO split resolution ledger", {
    exact: true,
  });
  await review
    .getByRole("combobox", { name: "Review recording", exact: true })
    .selectOption(track.id);
  await review
    .getByRole("combobox", { name: "Resolution decision", exact: true })
    .selectOption("reviewed");
  await review
    .getByLabel("Review rationale", { exact: true })
    .fill(
      "All three contributor allocations were reviewed against the immutable audio-bound agreement.",
    );
  await review
    .getByRole("button", { name: "Record signed review decision", exact: true })
    .click();
  await expect(review.getByRole("status")).toContainText(
    "Review and audit entry saved",
  );
  await page.reload();
  await expect(
    page.getByLabel("CMO split resolution ledger", { exact: true }),
  ).toContainText(
    "All three contributor allocations were reviewed against the immutable audio-bound agreement.",
  );
  expect(
    (
      await (await context.request.get("/api/rights-reviews")).json()
    ).reviews.some((r: { trackId: string }) => r.trackId === track.id),
  ).toBe(true);
  await ownerContext.close();
});

test("blocked localStorage does not break HttpOnly login or account-persisted licensed source settings", async ({
  page,
  context,
  baseURL,
}) => {
  await createActor(context, baseURL, {
    role: "broadcaster",
    stations: ["cbs-kla"],
  });
  await page.addInitScript(() => {
    Object.defineProperty(Storage.prototype, "setItem", {
      configurable: true,
      value() {
        throw new DOMException("Storage blocked", "SecurityError");
      },
    });
    Object.defineProperty(Storage.prototype, "getItem", {
      configurable: true,
      value() {
        throw new DOMException("Storage blocked", "SecurityError");
      },
    });
  });
  await page.goto("/dashboard/monitoring");
  await page
    .getByRole("button", { name: "Connect a station source", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Source HTTPS URL", { exact: true })
    .fill("https://clips.east-sound-qa.example.com/blocked-storage.wav");
  await dialog.getByLabel(/I am authorised/).check();
  await dialog
    .getByRole("button", { name: "Save source", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Open CBS FM feed", exact: true }),
  ).toBeVisible();
  expect(
    (await (await context.request.get("/api/station-sources")).json()).sources,
  ).toHaveLength(1);
});

test("mock OAuth is explicitly development-only and cannot deliver real masters or allocate live tags", async ({
  page,
  context,
  baseURL,
}) => {
  await page.goto("/login");
  const mock = page.getByRole("button", { name: "Mock google", exact: true });
  if (await mock.count()) {
    await mock.click();
    await expect(page).toHaveURL(/\/dashboard\/artist$/);
    const session = await (
      await context.request.get("/api/auth/session")
    ).json();
    expect(session.user.mock).toBe(true);
    expect(
      (
        await context.request.put("/api/tracks?releaseDate=2026-11-01", {
          headers: mutationHeaders(session, baseURL),
        })
      ).status(),
    ).toBe(403);
    await expect(
      page.getByRole("button", {
        name: "Log demo spin & preview WhatsApp",
        exact: true,
      }),
    ).toBeVisible();
  } else {
    const response = await context.request.post("/api/auth/mock-oauth", {
      headers: { origin: new URL(baseURL!).origin },
      data: { provider: "google" },
    });
    expect(response.status()).toBe(404);
  }
});
