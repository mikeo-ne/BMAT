import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testActor } from "@/tests/fixtures/auth";
import { capturedSpin } from "@/tests/fixtures/captured";
vi.mock("server-only", () => ({}));
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "east-sound-scopes-"));
  vi.stubEnv("EAST_SOUND_DATA_DIR", directory);
  vi.resetModules();
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
async function setup() {
  const a = await testActor("artist", "a@example.com"),
    b = await testActor("artist", "b@example.com"),
    capital = await testActor("broadcaster", "capital@example.com", [
      "capital-kla",
    ]),
    cmo = await testActor("cmo", "audit@example.com");
  const store = await import("@/lib/store");
  const base = {
    primaryArtist: "Private artist",
    featuredArtists: [],
    releaseDate: "2026-11-01",
    fileName: "private.wav",
    format: "WAV" as const,
    mimeType: "audio/wav",
    sizeBytes: 44,
    durationSec: 10,
    storedName: null,
  };
  const trackA = await store.addTrack({
      ...base,
      title: "Private master A",
      isrc: "UG-ESD-26-00001",
      ownerId: a.user.id,
    }),
    trackB = await store.addTrack({
      ...base,
      title: "Private master B",
      isrc: "UG-ESD-26-00002",
      ownerId: b.user.id,
    });
  const captures = await import("@/lib/broadcast-store");
  await captures.appendCapturedSpins([
    capturedSpin({
      id: "scope-a",
      trackId: trackA.id,
      title: trackA.title,
      stationId: "capital-kla",
      stationName: "Capital FM",
      detectedAt: new Date(Date.now() - 1000).toISOString(),
    }),
    capturedSpin({
      id: "scope-b",
      trackId: trackB.id,
      title: trackB.title,
      stationId: "cbs-kla",
      stationName: "CBS FM",
      detectedAt: new Date(Date.now() - 2000).toISOString(),
    }),
  ]);
  return { a, b, capital, cmo, trackA, trackB };
}
describe("server-side role and account isolation", () => {
  it("isolates artist masters and captures before serialization, ignoring claimed users and roles", async () => {
    const { a, b, trackA, trackB } = await setup(),
      tracks = await import("@/app/api/tracks/route"),
      playout = await import("@/app/api/playout/route");
    const response = await tracks.GET(
      a.request(`/api/tracks?userId=${b.user.id}&role=cmo&tenantId=anything`),
    );
    expect(response.status).toBe(200);
    const raw = await response.text();
    expect(raw).toContain(trackA.title);
    expect(raw).not.toContain(trackB.title);
    expect(raw).not.toContain(b.user.id);
    const events = await (await playout.GET(a.request("/api/playout"))).json();
    expect(events.records.map((e: { id: string }) => e.id)).toEqual([
      "scope-a",
    ]);
    const defaults = await (
      await import("@/lib/workspace-data")
    ).readWorkspaceData();
    expect(
      defaults.catalogue.every((t) => t.origin === "public-reference"),
    ).toBe(true);
    expect(defaults.history).toEqual([]);
  });
  it("limits broadcaster records and station metadata to immutable operator assignments", async () => {
    const { capital, trackA, trackB } = await setup(),
      playout = await import("@/app/api/playout/route"),
      stations = await import("@/app/api/stations/route");
    const events = await (
      await playout.GET(capital.request("/api/playout"))
    ).json();
    expect(events.records.map((e: { id: string }) => e.id)).toEqual([
      "scope-a",
    ]);
    expect(
      (await playout.GET(capital.request("/api/playout?stationId=cbs-kla")))
        .status,
    ).toBe(403);
    const directory = await (
      await stations.GET(capital.request("/api/stations?userId=forged"))
    ).json();
    expect(directory.stations.map((s: { id: string }) => s.id)).toEqual([
      "capital-kla",
    ]);
    const data = await (
      await import("@/lib/workspace-data")
    ).readWorkspaceData(new Date(), capital.user);
    expect(data.catalogue.map((t) => t.id)).toEqual([trackA.id]);
    expect(JSON.stringify(data)).not.toContain(trackB.title);
    expect(data.catalogue[0]).not.toHaveProperty("ownership");
    expect(data.catalogue[0]).not.toHaveProperty("ownerId");
  });
  it("allows only CMO accounts to inspect global audit, royalty ledgers and exports", async () => {
    const { a, capital, cmo } = await setup(),
      royalties = await import("@/app/api/royalties/route"),
      audit = await import("@/app/api/audit/route"),
      csv = await import("@/app/api/royalties/export/route");
    expect(cmo.user.role).toBe("cmo");
    expect(capital.user.role).toBe("broadcaster");
    expect((await royalties.GET(a.request("/api/royalties"))).status).toBe(403);
    expect((await audit.GET(capital.request("/api/audit"))).status).toBe(403);
    expect((await csv.GET(a.request("/api/royalties/export"))).status).toBe(
      403,
    );
    expect((await royalties.GET(cmo.request("/api/royalties"))).status).toBe(
      200,
    );
    expect((await audit.GET(cmo.request("/api/audit"))).status).toBe(200);
    const exported = await csv.GET(cmo.request("/api/royalties/export"));
    expect(exported.status).toBe(200);
    expect(exported.headers.get("content-type")).toContain("csv");
  });
  it("never lets an artist read/delete another account's master or a guest bypass authorization", async () => {
    const { a, b, trackA } = await setup(),
      item = await import("@/app/api/tracks/[id]/route"),
      context = { params: Promise.resolve({ id: trackA.id }) };
    expect(
      (await item.GET(b.request(`/api/tracks/${trackA.id}`), context)).status,
    ).toBe(404);
    expect(
      (
        await item.DELETE(
          b.request(`/api/tracks/${trackA.id}`, { method: "DELETE" }),
          context,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await item.DELETE(
          new Request(`https://app.example.com/api/tracks/${trackA.id}`, {
            method: "DELETE",
          }),
          context,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await item.DELETE(
          a.request(`/api/tracks/${trackA.id}`, { method: "DELETE" }),
          context,
        )
      ).status,
    ).toBe(200);
  });
  it("rejects station-source configuration and private preferences outside the caller's role/scope", async () => {
    const { a, capital } = await setup(),
      sources = await import("@/app/api/station-sources/route"),
      prefs = await import("@/app/api/preferences/route");
    expect((await prefs.GET(capital.request("/api/preferences"))).status).toBe(
      403,
    );
    expect((await sources.GET(a.request("/api/station-sources"))).status).toBe(
      403,
    );
    expect(
      (
        await sources.PUT(
          capital.request("/api/station-sources", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              userId: a.user.id,
              sources: [
                {
                  stationId: "cbs-kla",
                  url: "https://audio.example.com/live.mp3",
                  format: "native",
                },
              ],
            }),
          }),
        )
      ).status,
    ).toBe(403);
    const saved = await sources.PUT(
      capital.request("/api/station-sources", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sources: [
            {
              stationId: "capital-kla",
              url: "https://audio.example.com/live.mp3",
              format: "native",
            },
          ],
        }),
      }),
    );
    expect(saved.status).toBe(200);
  });
});
