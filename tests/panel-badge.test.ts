import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/core", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/core")>("@/lib/db/core");
  return { ...actual, db: () => fake.current };
});

const fake = vi.hoisted(() => ({ current: null as null | { rpc: (n: string) => Promise<{ data: unknown; error: unknown }> } }));

import { badgeLine, loadPublicStats } from "@/lib/db/shared";

const stats = (o: Partial<{ streams: number; venues: number; panel: number; ready: number }>) => ({
  streams: 0,
  venues: 0,
  panel: 0,
  ready: 0,
  ...o,
});

/**
 * The header used to read "0 Stations Monitored Live" whenever the ingest
 * worker was between runs. True, and a terrible first impression. We now say
 * "monitored live" only when heartbeats are recent, and fall back to the panel
 * size — a fact that holds whether or not a worker is up.
 */
describe("header badge", () => {
  it("claims live monitoring only with a recent heartbeat", () => {
    expect(badgeLine(stats({ streams: 25, panel: 26, ready: 26 }), true)).toMatchObject({
      key: "liveStationsTpl",
      values: { s: "25" },
    });
  });

  it("falls back to the panel size when no worker is running", () => {
    expect(badgeLine(stats({ panel: 26, ready: 26 }), true)).toMatchObject({
      key: "livePanelTpl",
      values: { s: "26", r: "26" },
    });
  });

  it("leads with venues when there are any", () => {
    expect(badgeLine(stats({ streams: 25, venues: 4 }), true)).toMatchObject({
      key: "liveTpl",
      values: { s: "25", v: "4" },
    });
  });

  it("shows nothing rather than a zero", () => {
    expect(badgeLine(stats({}), true)).toBeNull();
    expect(badgeLine(null, true)).toBeNull();
  });

  it("keeps the demo copy when Supabase is not configured", () => {
    expect(badgeLine(null, false)).toMatchObject({ key: "live" });
  });
});

describe("loadPublicStats", () => {
  it("reads the panel columns alongside the live ones", async () => {
    fake.current = {
      rpc: async () => ({
        data: [{ streams_online: 0, venues: 0, detections_24h: 0, panel_stations: 26, stream_ready: 25 }],
        error: null,
      }),
    };
    await expect(loadPublicStats()).resolves.toEqual({ streams: 0, venues: 0, panel: 26, ready: 25 });
  });

  it("survives the old function shape (code deployed before the migration)", async () => {
    fake.current = { rpc: async () => ({ data: [{ streams_online: 3, venues: 0, detections_24h: 9 }], error: null }) };
    await expect(loadPublicStats()).resolves.toMatchObject({ streams: 3, panel: 0, ready: 0 });
  });

  it("returns null when the call fails", async () => {
    fake.current = { rpc: async () => ({ data: null, error: { message: "boom" } }) };
    await expect(loadPublicStats()).resolves.toBeNull();
  });
});
