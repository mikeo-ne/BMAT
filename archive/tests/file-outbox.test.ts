import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testActor } from "@/tests/fixtures/auth";
import { capturedSpin } from "@/tests/fixtures/captured";
import { defaultNotificationPreferences } from "@/lib/notifications";
vi.mock("server-only", () => ({}));
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "east-sound-outbox-"));
  vi.stubEnv("EAST_SOUND_DATA_DIR", directory);
  vi.resetModules();
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
async function setup() {
  const actor = await testActor(),
    store = await import("@/lib/store");
  const track = await store.addTrack({
    title: "Private airplay",
    primaryArtist: "Owner",
    ownerId: actor.user.id,
    featuredArtists: [],
    releaseDate: "2026-11-01",
    isrc: "UG-ESD-26-00401",
    fileName: "master.wav",
    format: "WAV",
    mimeType: "audio/wav",
    durationSec: 10,
    sizeBytes: 44,
    storedName: null,
  });
  const config = defaultNotificationPreferences();
  config.whatsapp = {
    ...config.whatsapp,
    phone: "+256772000000",
    consent: true,
  };
  config.subscriptions = [
    {
      id: "own-first",
      name: "Own first spin",
      trackId: "all",
      stationId: "all",
      region: "All",
      channels: ["whatsapp"],
      triggers: ["first"],
      milestones: [],
      enabled: true,
      createdAt: "2000-01-01T00:00:00.000Z",
    },
  ];
  return { actor, track, config };
}
function ready() {
  vi.stubEnv("EAST_SOUND_LIVE_NOTIFICATIONS", "true");
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-only-provider-token");
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "123456");
  vi.stubEnv("WHATSAPP_GRAPH_VERSION", "v21.0");
  vi.stubEnv("WHATSAPP_TEMPLATE_NAME", "test_alert");
}
describe("account-scoped automatic outbox and encrypted routing", () => {
  it("automatically enqueues once on a new capture, survives reconciliation and remains queued without a provider", async () => {
    const { actor, track, config } = await setup(),
      preferences = await import("@/lib/account-notifications"),
      capture = await import("@/lib/broadcast-store"),
      queue = await import("@/lib/file-notification-queue");
    await preferences.saveAccountPreferences(actor.user, config);
    const event = capturedSpin({
      id: "first-real",
      trackId: track.id,
      title: track.title,
      primaryArtist: track.primaryArtist,
      detectedAt: new Date().toISOString(),
    });
    await capture.appendCapturedSpins([event]);
    await capture.appendCapturedSpins([event]);
    await queue.reconcileFileOutbox();
    const jobs = await queue.fileOutbox(actor.user.id);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      status: "queued",
      attempts: 0,
      event: { source: "captured", spinId: event.id },
    });
    await expect(queue.processFileOutbox()).rejects.toThrow(/disabled/);
  });
  it("prevents all-track subscriptions from receiving any other artist's recordings", async () => {
    const { actor, track, config } = await setup(),
      other = await testActor(),
      preferences = await import("@/lib/account-notifications"),
      capture = await import("@/lib/broadcast-store"),
      queue = await import("@/lib/file-notification-queue");
    await preferences.saveAccountPreferences(other.user, config);
    await capture.appendCapturedSpins([
      capturedSpin({
        id: "foreign-spin",
        trackId: track.id,
        detectedAt: new Date().toISOString(),
      }),
    ]);
    expect(await queue.fileOutbox(other.user.id)).toEqual([]);
    expect(await queue.fileOutbox(actor.user.id)).toEqual([]);
    config.subscriptions[0].trackId = track.id;
    await expect(
      preferences.saveAccountPreferences(other.user, config),
    ).rejects.toMatchObject({ status: 422 });
  });
  it("encrypts per-endpoint HMAC secrets and never returns plaintext or accepts client owner IDs", async () => {
    const { actor, config } = await setup(),
      prefs = await import("@/app/api/preferences/route"),
      service = await import("@/lib/account-notifications");
    const secret = "test-write-only-signing-secret-1234";
    config.webhooks = [
      {
        id: "label-hook",
        label: "Label backend",
        kind: "json",
        url: "https://hooks.example.com/airplay",
        enabled: true,
        secret,
      },
    ];
    const response = await prefs.PUT(
      actor.request("/api/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...config, ownerId: "forged-owner" }),
      }),
    );
    expect(response.status).toBe(200);
    const raw = await response.text();
    expect(raw).not.toContain(secret);
    expect(raw).toContain('"secretConfigured":true');
    const file = await readFile(
      path.join(directory, "security/accounts.json"),
      "utf8",
    );
    expect(file).not.toContain(secret);
    expect(file).toContain("v1.");
    expect(
      (await service.deliveryPreferences(actor.user.id))?.webhooks[0].secret,
    ).toBe(secret);
    expect(
      (await service.accountPreferences(actor.user.id)).webhooks[0],
    ).not.toHaveProperty("secret", secret);
  });
  it("records provider acceptance only from a worker result and never resends accepted jobs", async () => {
    const { actor, track, config } = await setup(),
      preferences = await import("@/lib/account-notifications"),
      capture = await import("@/lib/broadcast-store"),
      queue = await import("@/lib/file-notification-queue");
    await preferences.saveAccountPreferences(actor.user, config);
    await capture.appendCapturedSpins([
      capturedSpin({
        id: "worker-spin",
        trackId: track.id,
        detectedAt: new Date().toISOString(),
      }),
    ]);
    vi.stubEnv("EAST_SOUND_LIVE_NOTIFICATIONS", "true");
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-only-provider-token");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "123456");
    vi.stubEnv("WHATSAPP_GRAPH_VERSION", "v21.0");
    vi.stubEnv("WHATSAPP_TEMPLATE_NAME", "test_alert");
    const deliver = vi.fn(async () => ({
      accepted: true,
      retryable: false,
      code: "provider_accepted",
    }));
    expect((await queue.processFileOutbox(deliver)).accepted).toBe(1);
    expect(deliver).toHaveBeenCalledTimes(1);
    expect((await queue.fileOutbox(actor.user.id))[0].status).toBe("accepted");
    expect((await queue.processFileOutbox(deliver)).attempted).toBe(0);
  });
  it("does not trust browser activation timestamps or permit prototype keys for destinations", async () => {
    const { actor, config } = await setup(),
      preferences = await import("@/lib/account-notifications");
    const saved = await preferences.saveAccountPreferences(actor.user, config);
    expect(Date.parse(saved.subscriptions[0].activatedAt!)).toBeGreaterThan(
      Date.now() - 5000,
    );
    config.webhooks = [
      {
        id: "__proto__",
        url: "https://hooks.example.com/a",
        label: "Invalid ID",
        kind: "json",
        enabled: false,
      },
    ];
    await expect(
      preferences.saveAccountPreferences(actor.user, config),
    ).rejects.toMatchObject({ status: 422 });
  });
  it("withdraws queued work before provider I/O when consent/subscription is revoked", async () => {
    const { actor, track, config } = await setup(),
      preferences = await import("@/lib/account-notifications"),
      capture = await import("@/lib/broadcast-store"),
      queue = await import("@/lib/file-notification-queue");
    await preferences.saveAccountPreferences(actor.user, config);
    await capture.appendCapturedSpins([
      capturedSpin({
        id: "withdrawal-spin",
        trackId: track.id,
        detectedAt: new Date().toISOString(),
      }),
    ]);
    config.subscriptions = [];
    config.whatsapp.consent = false;
    await preferences.saveAccountPreferences(actor.user, config);
    ready();
    const deliver = vi.fn(async () => ({
      accepted: true,
      retryable: false,
      code: "provider_accepted",
    }));
    expect((await queue.processFileOutbox(deliver)).failed).toBe(1);
    expect(deliver).not.toHaveBeenCalled();
    expect((await queue.fileOutbox(actor.user.id))[0]).toMatchObject({
      status: "failed",
      code: "subscription_withdrawn",
    });
  });
  it("honors persistent retry backoff and terminalizes the third retryable failure", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { actor, track, config } = await setup(),
      preferences = await import("@/lib/account-notifications"),
      capture = await import("@/lib/broadcast-store"),
      queue = await import("@/lib/file-notification-queue");
    await preferences.saveAccountPreferences(actor.user, config);
    await capture.appendCapturedSpins([
      capturedSpin({
        id: "retry-spin",
        trackId: track.id,
        detectedAt: new Date().toISOString(),
      }),
    ]);
    ready();
    const deliver = vi.fn(async () => ({
      accepted: false,
      retryable: true,
      code: "provider_http_429",
    }));
    expect((await queue.processFileOutbox(deliver)).retry).toBe(1);
    expect((await queue.processFileOutbox(deliver)).attempted).toBe(0);
    vi.setSystemTime(Date.now() + 60001);
    expect((await queue.processFileOutbox(deliver)).retry).toBe(1);
    vi.setSystemTime(Date.now() + 120001);
    expect((await queue.processFileOutbox(deliver)).failed).toBe(1);
    expect((await queue.fileOutbox(actor.user.id))[0]).toMatchObject({
      status: "failed",
      attempts: 3,
    });
    expect((await queue.processFileOutbox(deliver)).attempted).toBe(0);
    expect(deliver).toHaveBeenCalledTimes(3);
  });
  it("claims work exclusively, recovers a crashed lease and fences a late first-worker completion", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { actor, track, config } = await setup(),
      preferences = await import("@/lib/account-notifications"),
      capture = await import("@/lib/broadcast-store"),
      queue = await import("@/lib/file-notification-queue");
    await preferences.saveAccountPreferences(actor.user, config);
    await capture.appendCapturedSpins([
      capturedSpin({
        id: "lease-spin",
        trackId: track.id,
        detectedAt: new Date().toISOString(),
      }),
    ]);
    ready();
    let release!: (value: {
      accepted: boolean;
      retryable: boolean;
      code: string;
    }) => void;
    const first = vi.fn(
        () =>
          new Promise<{ accepted: boolean; retryable: boolean; code: string }>(
            (resolve) => {
              release = resolve;
            },
          ),
      ),
      second = vi.fn(async () => ({
        accepted: true,
        retryable: false,
        code: "provider_accepted",
      }));
    const pending = queue.processFileOutbox(first);
    await vi.waitFor(() => expect(first).toHaveBeenCalledTimes(1));
    expect((await queue.processFileOutbox(second)).attempted).toBe(0);
    vi.setSystemTime(Date.now() + 120001);
    expect((await queue.processFileOutbox(second)).accepted).toBe(1);
    release({ accepted: true, retryable: false, code: "provider_accepted" });
    expect((await pending).leaseLost).toBe(1);
    expect((await queue.fileOutbox(actor.user.id))[0]).toMatchObject({
      status: "accepted",
      attempts: 2,
    });
  });
  it("never enqueues live work for a development mock identity, including legacy internal test masters", async () => {
    vi.stubEnv("EAST_SOUND_MOCK_OAUTH", "1");
    const auth = await import("@/lib/auth-core"),
      store = await import("@/lib/store"),
      preferences = await import("@/lib/account-notifications"),
      capture = await import("@/lib/broadcast-store"),
      queue = await import("@/lib/file-notification-queue");
    const actor = await auth.createAccount({
      name: "Mock only",
      email: "mock@demo.invalid",
      password: "A development-only mock password!",
      mock: true,
    });
    expect(actor.mock).toBe(true);
    const track = await store.addTrack({
      title: "Mock owned",
      primaryArtist: "Mock only",
      ownerId: actor.id,
      featuredArtists: [],
      releaseDate: "2026-11-01",
      isrc: "UG-ESD-26-00402",
      fileName: "master.wav",
      format: "WAV",
      mimeType: "audio/wav",
      durationSec: 10,
      sizeBytes: 44,
      storedName: null,
    });
    const config = defaultNotificationPreferences();
    config.whatsapp = {
      ...config.whatsapp,
      phone: "+256772000000",
      consent: true,
    };
    config.subscriptions = [
      {
        id: "mock-first",
        name: "Mock",
        trackId: "all",
        stationId: "all",
        region: "All",
        channels: ["whatsapp"],
        triggers: ["first"],
        milestones: [],
        enabled: true,
        createdAt: new Date().toISOString(),
      },
    ];
    await preferences.saveAccountPreferences(actor, config);
    await capture.appendCapturedSpins([
      capturedSpin({
        id: "mock-spin",
        trackId: track.id,
        detectedAt: new Date().toISOString(),
      }),
    ]);
    expect(await queue.fileOutbox(actor.id)).toEqual([]);
  });
});
