import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDeliveryParties } from "@/lib/delivery-splits";
import { createDemoEvidenceWav } from "@/lib/evidence";
import {
  hasAudioSignature,
  MAX_UPLOAD_BYTES,
  validateAudioFile,
} from "@/lib/upload";
vi.mock("server-only", () => ({}));
let directory: string;
let store: typeof import("@/lib/store");
let routes: typeof import("@/app/api/tracks/route");
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

function makeForm(isrc: string) {
  const form = new FormData();
  form.set(
    "audio",
    new File(
      [new Uint8Array(createDemoEvidenceWav("upload"))],
      "QA Artist Alpha - Test master.wav",
      { type: "audio/wav" },
    ),
  );
  form.set("title", "Test master");
  form.set("primaryArtist", "QA Artist Alpha");
  form.set("releaseDate", "2026-11-01");
  form.set("isrc", isrc);
  form.set("durationSec", "10");
  form.set(
    "ownership",
    JSON.stringify({
      version: 1,
      approvalMethod: "local-acknowledgement",
      parties: createDeliveryParties("QA Artist Alpha").map((party) => ({
        ...party,
        signature: {
          typedName: "QA Artist Alpha",
          signedAt: new Date().toISOString(),
        },
      })),
    }),
  );
  return form;
}
const request = (body: FormData) =>
  new Request("http://example.test/api/tracks", { method: "POST", body });

describe("master delivery server validation and persistence", () => {
  it("seeds once and allocates unique local tags even for concurrently staged files", async () => {
    const original = await store.readTracks();
    const allocated = await Promise.all(
      Array.from({ length: 12 }, () => store.reserveIsrc("2026-11-01")),
    );
    expect(new Set(allocated).size).toBe(12);
    expect(allocated.every((isrc) => /^UG-ESD-26-\d{5}$/.test(isrc))).toBe(
      true,
    );
    expect(
      allocated.some((isrc) => original.some((track) => track.isrc === isrc)),
    ).toBe(false);
    expect(await store.readTracks()).toEqual(original);
    expect(
      JSON.parse(
        await readFile(path.join(directory, "isrc-reservations.json"), "utf8"),
      ).sort(),
    ).toEqual([...allocated].sort());
  });
  it("never reuses the last designation when the block is exhausted", async () => {
    await store.readTracks();
    await writeFile(
      path.join(directory, "isrc-reservations.json"),
      JSON.stringify(["UG-ESD-26-99999"]),
    );
    await expect(store.reserveIsrc("2026-11-01")).rejects.toThrow(/exhausted/);
  });
  it("refuses to overwrite corrupt catalogue data with fixtures", async () => {
    await writeFile(path.join(directory, "tracks.json"), "not-json");
    await expect(store.readTracks()).rejects.toThrow();
    expect(await readFile(path.join(directory, "tracks.json"), "utf8")).toBe(
      "not-json",
    );
  });
  it("rejects delivery without a fully approved split sheet", async () => {
    const form = makeForm("UG-ESD-26-00100");
    form.delete("ownership");
    const response = await routes.POST(request(form));
    expect(response.status).toBe(422);
    expect((await response.json()).errors.ownership).toMatch(/required/);
  });
  it("rejects a spoofed audio container and unapproved percentage changes", async () => {
    const badAudio = makeForm("UG-ESD-26-00100");
    badAudio.set(
      "audio",
      new File(["%PDF-not-a-wave"], "master.wav", { type: "audio/wav" }),
    );
    expect((await routes.POST(request(badAudio))).status).toBe(422);
    const badSplit = makeForm("UG-ESD-26-00101");
    const ownership = JSON.parse(String(badSplit.get("ownership")));
    ownership.parties[0].shares.performance = 99;
    badSplit.set("ownership", JSON.stringify(ownership));
    const response = await routes.POST(request(badSplit));
    expect(response.status).toBe(422);
    expect((await response.json()).errors.ownership).toMatch(/100%/);
  });
  it("persists a valid master and approved ownership without changing any seeded row", async () => {
    const original = await store.readTracks();
    const isrc = await store.reserveIsrc("2026-11-01");
    const response = await routes.POST(request(makeForm(isrc)));
    expect(response.status).toBe(201);
    const { track } = await response.json();
    expect(track.isrc).toBe(isrc);
    expect(track.ownership.parties[0].signature.typedName).toBe(
      "QA Artist Alpha",
    );
    const saved = await store.readTracks();
    expect(saved.slice(1)).toEqual(original);
    expect(saved[0].audio.storedName).toBeTruthy();
    expect((await readdir(store.UPLOAD_DIR)).length).toBe(1);
  });
  it("rejects duplicate ISRCs with 409 and removes orphan audio uploads", async () => {
    const isrc = await store.reserveIsrc("2026-11-01");
    const results = await Promise.all([
      routes.POST(request(makeForm(isrc))),
      routes.POST(request(makeForm(isrc))),
    ]);
    expect(results.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(
      (await store.readTracks()).filter((track) => track.isrc === isrc),
    ).toHaveLength(1);
    expect((await readdir(store.UPLOAD_DIR)).length).toBe(1);
  });
  it("the reservation endpoint rejects invalid dates and identifies its local-only scope", async () => {
    const bad = await routes.PUT(
      new Request("http://example.test/api/tracks?releaseDate=2026-02-30", {
        method: "PUT",
      }),
    );
    expect(bad.status).toBe(400);
    const good = await routes.PUT(
      new Request("http://example.test/api/tracks?releaseDate=2026-11-01", {
        method: "PUT",
      }),
    );
    expect(await good.json()).toMatchObject({
      registration: "local-demo-only",
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
