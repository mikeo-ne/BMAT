import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CAPTURE_NOW, capturedSpin } from "@/tests/fixtures/captured";
import { buildFixtureTracks } from "@/tests/fixtures/catalogue";
vi.mock("server-only", () => ({}));
let directory: string;
let route: typeof import("@/app/api/playout/route");
let store: typeof import("@/lib/broadcast-store");
let catalogue: typeof import("@/lib/store");
const TOKEN = "qa-ingestion-token-" + "x".repeat(32);
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "east-sound-capture-api-"));
  vi.stubEnv("EAST_SOUND_DATA_DIR", directory);
  vi.stubEnv("EAST_SOUND_INGEST_TOKEN", TOKEN);
  vi.resetModules();
  route = await import("@/app/api/playout/route");
  store = await import("@/lib/broadcast-store");
  catalogue = await import("@/lib/store");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
const request = (
  body: unknown,
  token = TOKEN,
  contentType = "application/json",
) =>
  new Request("https://app.example.com/api/playout", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("protected captured-event API and immutable local storage", () => {
  it("returns an empty captured-only feed rather than fabricating a broadcast", async () => {
    const response = await route.GET();
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({ source: "captured-only", records: [] });
    expect(Number.isFinite(Date.parse(json.generatedAt))).toBe(true);
  });
  it("disables ingestion without a strong server token and rejects wrong credentials", async () => {
    vi.stubEnv("EAST_SOUND_INGEST_TOKEN", "short");
    expect(
      (await route.POST(request({ records: [capturedSpin()] }))).status,
    ).toBe(503);
    vi.stubEnv("EAST_SOUND_INGEST_TOKEN", TOKEN);
    expect(
      (await route.POST(request({ records: [capturedSpin()] }, "wrong")))
        .status,
    ).toBe(401);
    expect(await store.readCapturedSpins()).toEqual([]);
  });
  it("bounds content type, JSON validity and bytes before ingesting", async () => {
    expect((await route.POST(request("{}", TOKEN, "text/plain"))).status).toBe(
      415,
    );
    expect(
      (await route.POST(request("{}", TOKEN, "application/jsonp"))).status,
    ).toBe(415);
    expect((await route.POST(request("not-json"))).status).toBe(400);
    expect(
      (
        await route.POST(
          request({ records: [], padding: "a".repeat(256 * 1024) }),
        )
      ).status,
    ).toBe(413);
    expect(await store.readCapturedSpins()).toEqual([]);
  });
  it("idempotently persists captures while leaving real release identifiers and rights unknown", async () => {
    const before = await catalogue.readTracks();
    const first = await route.POST(request({ records: [capturedSpin()] }));
    expect(first.status).toBe(201);
    expect(await first.json()).toEqual({ inserted: 1, duplicates: 0 });
    const second = await route.POST(request({ records: [capturedSpin()] }));
    expect(await second.json()).toEqual({ inserted: 0, duplicates: 1 });
    expect(await store.readCapturedSpins()).toHaveLength(1);
    expect(await catalogue.readTracks()).toEqual(before);
    const workspace = await import("@/lib/workspace-data");
    const data = await workspace.readWorkspaceData(CAPTURE_NOW);
    expect(data.catalogue[0]).toMatchObject({
      totalSpins: 1,
      isrc: "",
      origin: "public-reference",
    });
  });
  it("serialises concurrent retries to a single event and never writes demo data", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        store.appendCapturedSpins([capturedSpin()]),
      ),
    );
    expect(results.reduce((sum, result) => sum + result.inserted, 0)).toBe(1);
    await expect(
      store.appendCapturedSpins([capturedSpin({ source: "demo" })]),
    ).rejects.toThrow(/validated captured/);
    expect(await store.readCapturedSpins()).toHaveLength(1);
  });
  it("rejects simulation submissions rather than upgrading their source label", async () => {
    const response = await route.POST(
      request({ records: [capturedSpin({ source: "demo" })] }),
    );
    expect(response.status).toBe(422);
    expect(await store.readCapturedSpins()).toEqual([]);
  });
  it("never wipes corrupt or superficially captured records", async () => {
    const file = path.join(directory, "broadcasts.json");
    const corrupt = JSON.stringify([
      { source: "captured", id: "looks-captured", detectedAt: "not-a-date" },
    ]);
    await writeFile(file, corrupt);
    expect((await route.GET()).status).toBe(503);
    expect(
      (await route.POST(request({ records: [capturedSpin()] }))).status,
    ).toBe(503);
    expect(await readFile(file, "utf8")).toBe(corrupt);
  });
  it("migrates the existing seven-row catalogue on read, preserves real masters and does not resurrect removed fixtures", async () => {
    const rows = buildFixtureTracks(CAPTURE_NOW).map((track, i) => ({
      ...track,
      id: `trk_0${i + 1}`,
    }));
    const genuine = {
      ...rows[0],
      id: "user-owned",
      audio: { ...rows[0].audio, storedName: "owned.wav" },
      origin: "delivered" as const,
    };
    await writeFile(
      path.join(directory, "tracks.json"),
      JSON.stringify([...rows, genuine]),
    );
    const migrated = await catalogue.readTracks();
    expect(migrated).toHaveLength(13);
    expect(migrated.find((track) => track.id === genuine.id)).toEqual(genuine);
    expect(
      migrated.filter((track) => track.origin === "public-reference"),
    ).toHaveLength(12);
    expect(await catalogue.readTracks()).toEqual(migrated);
  });
  it("refuses malformed catalogue rows without resetting the catalogue", async () => {
    const file = path.join(directory, "tracks.json");
    const raw = JSON.stringify([{ id: "broken-row" }]);
    await writeFile(file, raw);
    await expect(catalogue.readTracks()).rejects.toThrow(/Malformed/);
    expect(await readFile(file, "utf8")).toBe(raw);
  });
});
