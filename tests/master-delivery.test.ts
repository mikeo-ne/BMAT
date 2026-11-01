import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testActor } from "@/tests/fixtures/auth";
import { deliveryFixture } from "@/tests/fixtures/master";
import {
  MAX_UPLOAD_BYTES,
  validateAudioFile,
  hasAudioSignature,
} from "@/lib/upload";
vi.mock("server-only", () => ({}));
let directory: string,
  store: typeof import("@/lib/store"),
  routes: typeof import("@/app/api/tracks/route");
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "east-sound-delivery-"));
  vi.stubEnv("EAST_SOUND_DATA_DIR", directory);
  vi.resetModules();
  store = await import("@/lib/store");
  routes = await import("@/app/api/tracks/route");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
describe("authenticated master delivery and immutable agreements", () => {
  it("seeds once and allocates unique persistent tags for simultaneous staged masters", async () => {
    const original = await store.readTracks(),
      tags = await Promise.all(
        Array.from({ length: 12 }, () => store.reserveIsrc("2026-11-01")),
      );
    expect(new Set(tags).size).toBe(12);
    expect(tags.every((tag) => /^UG-ESD-26-\d{5}$/.test(tag))).toBe(true);
    expect(await store.readTracks()).toEqual(original);
    expect(
      JSON.parse(
        await readFile(path.join(directory, "isrc-reservations.json"), "utf8"),
      ).sort(),
    ).toEqual(tags.sort());
  });
  it("never reuses the exhausted final designation or resets corrupt catalogue data", async () => {
    await store.readTracks();
    await writeFile(
      path.join(directory, "isrc-reservations.json"),
      JSON.stringify(["UG-ESD-26-99999"]),
    );
    await expect(store.reserveIsrc("2026-11-01")).rejects.toThrow(/exhausted/);
    await writeFile(path.join(directory, "tracks.json"), "not-json");
    await expect(store.readTracks()).rejects.toThrow();
    expect(await readFile(path.join(directory, "tracks.json"), "utf8")).toBe(
      "not-json",
    );
  });
  it("requires a session, a source signature and actual account approvals, not forged typed names", async () => {
    const actor = await testActor(),
      draft = await deliveryFixture(actor, "UG-ESD-26-00100", false),
      form = draft.form();
    form.set(
      "ownership",
      JSON.stringify({
        version: 1,
        approvalMethod: "local-acknowledgement",
        parties: [{ signature: { typedName: "Somebody else" } }],
      }),
    );
    expect(
      (
        await routes.POST(
          actor.request("/api/tracks", { method: "POST", body: form }),
        )
      ).status,
    ).toBe(422);
    const unsigned = draft.form();
    unsigned.delete("fingerprint");
    expect(
      (
        await routes.POST(
          actor.request("/api/tracks", { method: "POST", body: unsigned }),
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await routes.POST(
          new Request("https://app.example.com/api/tracks", {
            method: "POST",
            body: draft.form(),
          }),
        )
      ).status,
    ).toBe(401);
  });
  it("rejects spoofed containers, tampered features/source bytes and metadata changes after sign-off", async () => {
    const actor = await testActor(),
      draft = await deliveryFixture(actor);
    const bad = draft.form();
    bad.set(
      "audio",
      new File(["%PDF-not-a-wave"], "master.wav", { type: "audio/wav" }),
    );
    expect(
      (
        await routes.POST(
          actor.request("/api/tracks", { method: "POST", body: bad }),
        )
      ).status,
    ).toBe(422);
    const features = draft.form();
    features.set(
      "fingerprint",
      JSON.stringify({ ...draft.signature, waveform: Array(128).fill(42) }),
    );
    expect(
      (
        await routes.POST(
          actor.request("/api/tracks", { method: "POST", body: features }),
        )
      ).status,
    ).toBe(422);
    const metadata = draft.form();
    metadata.set("title", "Changed after approval");
    expect(
      (
        await routes.POST(
          actor.request("/api/tracks", { method: "POST", body: metadata }),
        )
      ).status,
    ).toBe(409);
  });
  it("persists approved source bytes and immutable ownership, ignores claimed owner IDs and redacts filesystem names", async () => {
    const actor = await testActor(),
      draft = await deliveryFixture(actor),
      original = await store.readTracks(),
      form = draft.form();
    form.set("ownerId", "attacker-selected-owner");
    const response = await routes.POST(
      actor.request("/api/tracks", { method: "POST", body: form }),
    );
    expect(response.status).toBe(201);
    const { track } = await response.json();
    expect(track.ownerId).toBe(actor.user.id);
    expect(track.audio.storedName).toBeNull();
    expect(track.ownership).toMatchObject({
      approvalMethod: "authenticated-account",
      agreementId: draft.agreement.id,
    });
    expect(track.ownership.parties[0].signature.userId).toBe(actor.user.id);
    const saved = await store.readTracks();
    expect(saved.slice(1)).toEqual(original);
    expect(saved[0].audio.storedName).toBeTruthy();
    expect(
      await readFile(path.join(store.UPLOAD_DIR, saved[0].audio.storedName!)),
    ).toEqual(draft.bytes);
    if (process.platform !== "win32") {
      expect((await stat(store.UPLOAD_DIR)).mode & 0o777).toBe(0o700);
      expect(
        (await stat(path.join(store.UPLOAD_DIR, saved[0].audio.storedName!)))
          .mode & 0o777,
      ).toBe(0o600);
      expect(
        (await stat(path.join(directory, "tracks.json"))).mode & 0o777,
      ).toBe(0o600);
    }
  });
  it("handles concurrent duplicate codes with 409, cleans up orphan bytes and safely replays the same agreement", async () => {
    const actor = await testActor(),
      a = await deliveryFixture(actor),
      b = await deliveryFixture(actor);
    const results = await Promise.all([
      routes.POST(
        actor.request("/api/tracks", { method: "POST", body: a.form() }),
      ),
      routes.POST(
        actor.request("/api/tracks", { method: "POST", body: b.form() }),
      ),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await readdir(store.UPLOAD_DIR)).length).toBe(1);
    const winner = results[0].status === 201 ? a : b;
    const retry = await routes.POST(
      actor.request("/api/tracks", { method: "POST", body: winner.form() }),
    );
    expect(retry.status).toBe(200);
    expect((await retry.json()).replayed).toBe(true);
    expect(
      (await store.readTracks()).filter((t) => t.agreementId),
    ).toHaveLength(1);
  });
  it("serves range-capable private audio only to its owner and supports authenticated withdrawal", async () => {
    const actor = await testActor(),
      other = await testActor(),
      draft = await deliveryFixture(actor),
      item = await import("@/app/api/tracks/[id]/route");
    const delivered = await routes.POST(
        actor.request("/api/tracks", { method: "POST", body: draft.form() }),
      ),
      { track } = await delivered.json(),
      ctx = { params: Promise.resolve({ id: track.id }) };
    const partial = await item.GET(
      actor.request(`/api/tracks/${track.id}`, {
        headers: { range: "bytes=0-43" },
      }),
      ctx,
    );
    expect(partial.status).toBe(206);
    expect(partial.headers.get("content-range")).toBe(
      `bytes 0-43/${draft.bytes.length}`,
    );
    expect(new Uint8Array(await partial.arrayBuffer())).toEqual(
      new Uint8Array(draft.bytes.subarray(0, 44)),
    );
    expect(
      (await item.GET(other.request(`/api/tracks/${track.id}`), ctx)).status,
    ).toBe(404);
    expect(
      (
        await item.GET(
          actor.request(`/api/tracks/${track.id}`, {
            headers: { range: "bytes=999999-" },
          }),
          ctx,
        )
      ).status,
    ).toBe(416);
    expect(
      (
        await item.DELETE(
          actor.request(`/api/tracks/${track.id}`, { method: "DELETE" }),
          ctx,
        )
      ).status,
    ).toBe(200);
    expect(await readdir(store.UPLOAD_DIR)).toEqual([]);
  });
  it("rejects invalid reservation dates and labels the tag as internal format allocation, not official registration", async () => {
    const actor = await testActor();
    expect(
      (
        await routes.PUT(
          actor.request("/api/tracks?releaseDate=2026-02-30", {
            method: "PUT",
          }),
        )
      ).status,
    ).toBe(400);
    const result = await routes.PUT(
      actor.request("/api/tracks?releaseDate=2026-11-01", { method: "PUT" }),
    );
    expect(await result.json()).toMatchObject({
      registration: "internal-format-only",
      isrc: expect.stringMatching(/^UG-ESD-26-/),
    });
  });
});

describe("audio validation boundary", () => {
  it("accepts exactly 80 MB, rejects oversized, empty and mismatched-MIME audio", () => {
    expect(
      validateAudioFile({
        name: "master.wav",
        type: "audio/x-wav",
        size: MAX_UPLOAD_BYTES,
      }),
    ).toBeNull();
    expect(
      validateAudioFile({
        name: "master.wav",
        type: "audio/wav",
        size: MAX_UPLOAD_BYTES + 1,
      }),
    ).toMatch(/ceiling/);
    expect(
      validateAudioFile({
        name: "master.mp3",
        type: "application/pdf",
        size: 100,
      }),
    ).toMatch(/MIME/);
    expect(
      validateAudioFile({ name: "master.mp3", type: "audio/mpeg", size: 0 }),
    ).toMatch(/empty/);
  });
  it("checks WAV, ID3 and MPEG frame headers rather than trusting extensions", () => {
    expect(
      hasAudioSignature(new TextEncoder().encode("RIFF0000WAVE"), "WAV"),
    ).toBe(true);
    expect(hasAudioSignature(new TextEncoder().encode("ID3"), "MP3")).toBe(
      true,
    );
    expect(hasAudioSignature(new Uint8Array([0xff, 0xfb, 0x90]), "MP3")).toBe(
      true,
    );
    expect(
      hasAudioSignature(new TextEncoder().encode("%PDF0000WAVE"), "WAV"),
    ).toBe(false);
    expect(hasAudioSignature(new Uint8Array(), "MP3")).toBe(false);
  });
});
