import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "east-sound-cloud-readonly-"));
  vi.stubEnv(
    "EAST_SOUND_DATA_DIR",
    path.join(directory, "must-not-be-created"),
  );
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("EAST_SOUND_STATIC_EXPORT", "0");
  vi.stubEnv("EAST_SOUND_STORAGE_BACKEND", "file");
  vi.stubEnv("EAST_SOUND_INGEST_TOKEN", "qa-ingest-" + "i".repeat(40));
  vi.stubEnv("EAST_SOUND_NOTIFICATION_TOKEN", "qa-worker-" + "w".repeat(40));
  vi.resetModules();
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

describe("safe Vercel deployment without durable storage", () => {
  it("reports deployed commit and actual read-only capabilities without exposing secrets", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "a".repeat(40));
    const health = await import("@/app/api/health/route");
    const response = await health.GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      storage: "reference",
      status: "ok",
      masterDelivery: false,
      capturePolling: false,
      commit: "a".repeat(40),
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await readdir(directory)).toEqual([]);
  });
  it("serves only the 12 real public references without creating directories or reading private JSON", async () => {
    const store = await import("@/lib/store");
    const tracks = await store.readTracks();
    expect(tracks).toHaveLength(12);
    expect(
      tracks.every(
        (track) => !track.isrc && !track.audio.storedName && !track.ownership,
      ),
    ).toBe(true);
    expect(await readdir(directory)).toEqual([]);
  });
  it("never invents capture records, attempts or a live provider connection", async () => {
    const captures = await import("@/lib/broadcast-store"),
      attempts = await import("@/lib/notification-outbox");
    const transport = await import("@/lib/notification-transport");
    vi.stubEnv("EAST_SOUND_LIVE_NOTIFICATIONS", "true");
    expect(await captures.readCapturedSpins()).toEqual([]);
    expect(await attempts.readDeliveryAttempts()).toEqual([]);
    expect(transport.notificationProviderReadiness()).toEqual({
      whatsapp: false,
      email: false,
      webhook: false,
      worker: false,
      liveEnabled: false,
    });
    expect(await readdir(directory)).toEqual([]);
  });
  it("rejects direct file-store writes and local tag reservations rather than falling back to /tmp", async () => {
    const store = await import("@/lib/store");
    await expect(store.writeTracks([])).rejects.toThrow(/Persistent writes/);
    await expect(store.reserveIsrc("2026-11-01")).rejects.toThrow(
      /Persistent writes/,
    );
    await expect(store.deleteTrack("ref_baranga-salo")).rejects.toThrow(
      /Persistent writes/,
    );
    await expect(
      store.saveUpload(new Uint8Array([1]), "qa.wav"),
    ).rejects.toThrow(/disabled/);
    expect(await readdir(directory)).toEqual([]);
  });
  it("blocks master POST before multipart buffering and blocks PUT/DELETE before persistence is available", async () => {
    const api = await import("@/app/api/tracks/route"),
      item = await import("@/app/api/tracks/[id]/route");
    const body = new Request("https://app.example.com/api/tracks", {
      method: "POST",
      body: "not-multipart",
    });
    const parse = vi.spyOn(body, "formData");
    const response = await api.POST(body);
    expect(response.status).toBe(401);
    expect(parse).not.toHaveBeenCalled();
    expect((await response.json()).error).toContain("Sign in");
    expect(
      (
        await api.PUT(
          new Request("https://app.example.com/api/tracks", { method: "PUT" }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await item.DELETE(
          new Request("https://app.example.com/api/tracks/ref_baranga-salo", {
            method: "DELETE",
          }),
          { params: Promise.resolve({ id: "ref_baranga-salo" }) },
        )
      ).status,
    ).toBe(401);
    expect(await readdir(directory)).toEqual([]);
  });
  it("blocks authorized ingestion and dispatch before parsing payloads when persistence is unavailable", async () => {
    const capture = await import("@/app/api/playout/route"),
      dispatch = await import("@/app/api/notifications/dispatch/route");
    const request = (token: string) =>
      new Request("https://app.example.com/api/private", {
        method: "POST",
        headers: {
          authorization: "Bearer " + token,
          "content-type": "application/json",
        },
        body: "not-json",
      });
    expect(
      (await capture.POST(request(process.env.EAST_SOUND_INGEST_TOKEN!)))
        .status,
    ).toBe(503);
    expect(
      (await dispatch.POST(request(process.env.EAST_SOUND_NOTIFICATION_TOKEN!)))
        .status,
    ).toBe(503);
    expect(await readdir(directory)).toEqual([]);
  });
  it("does not poll an absent integration and exposes the deployment boundary for the shell", async () => {
    const runtime = await import("@/lib/runtime-storage");
    expect(runtime.capturePollingAvailable()).toBe(false);
    expect(runtime.masterUploadsAvailable()).toBe(false);
    expect(runtime.deploymentStorageNotice()).toContain(
      "Read-only reference deployment",
    );
  });
  it("permits configured PostgreSQL paths but never enables Vercel filesystem uploads", async () => {
    vi.stubEnv("EAST_SOUND_STORAGE_BACKEND", "postgres");
    const runtime = await import("@/lib/runtime-storage");
    expect(runtime.referenceStorageOnly()).toBe(false);
    expect(runtime.capturePollingAvailable()).toBe(true);
    expect(runtime.masterUploadsAvailable()).toBe(false);
    expect(runtime.deploymentStorageNotice()).toContain("PostgreSQL");
    vi.stubEnv("DATABASE_URL", undefined);
    vi.stubEnv("EAST_SOUND_TENANT_ID", "invalid");
    const store = await import("@/lib/store");
    await expect(store.readTracks()).rejects.toThrow();
  });
  it("keeps the existing durable Node workflow available and makes static exports explicitly read-only", async () => {
    vi.stubEnv("VERCEL", undefined);
    const runtime = await import("@/lib/runtime-storage");
    expect(runtime.referenceStorageOnly()).toBe(false);
    expect(runtime.masterUploadsAvailable()).toBe(true);
    expect(runtime.deploymentStorageNotice()).toBeNull();
    vi.stubEnv("EAST_SOUND_STATIC_EXPORT", "1");
    expect(runtime.referenceStorageOnly()).toBe(true);
    expect(runtime.masterUploadsAvailable()).toBe(false);
  });
});
