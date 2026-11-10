// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildMonthlyPack } from "@/lib/cmo-report";

/**
 * The CMO pack section has one job that matters: never present a sample as a
 * filing, and never claim a month has numbers when it has none.
 */
const load = vi.hoisted(() => ({ pack: null as unknown, calls: [] as string[] }));

vi.mock("@/lib/db/cmo", () => ({
  loadMonthlyPack: (month: string) => {
    load.calls.push(month);
    return Promise.resolve(load.pack);
  },
}));

vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: false }));

const { MonthlyPack } = await import("@/components/dashboards/cmo/MonthlyPack");

const livePack = () =>
  buildMonthlyPack(
    [
      { station_id: "s1", station: "Capital FM", region: "Central", spins: 2841, works: 412, artists: 148, with_evidence: 2756 },
      { station_id: "s2", station: "Pearl FM", region: "Eastern", spins: 1188, works: 274, artists: 101, with_evidence: 1150 },
    ],
    [{ rank: 1, title: "Kampala Nights", artist: "Nalu Akello", owner: "East Sound", spins: 412, stations: 9 }],
    "2026-11",
    true,
  );

beforeEach(() => {
  load.pack = livePack();
  load.calls = [];
});

afterEach(cleanup);

describe("MonthlyPack", () => {
  it("shows the month's totals, per-station rows and the feed URL", async () => {
    render(<MonthlyPack />);
    await waitFor(() => expect(screen.getByText("4,029")).toBeTruthy()); // total plays
    expect(screen.getByText("Capital FM")).toBeTruthy();
    expect(screen.getByText("Pearl FM")).toBeTruthy();
    expect(screen.getByText("Kampala Nights")).toBeTruthy();
    expect(screen.getByText(/\/api\/feed\/airplay\?month=2026-11/)).toBeTruthy();
    expect(screen.getByText(/Live numbers from the detections/)).toBeTruthy();
    expect(load.calls).toContain("2026-11");
  });

  it("says a live month has no plays instead of showing an empty table", async () => {
    load.pack = buildMonthlyPack([], [], "2026-10", true);
    render(<MonthlyPack />);
    await waitFor(() => expect(screen.getByText(/No plays recorded in October 2026/)).toBeTruthy());
    expect(screen.queryByText(/Sample data/)).toBeNull();
  });

  it("labels sample data so it can never be mistaken for a filing", async () => {
    load.pack = buildMonthlyPack([{ station: "Capital FM", region: "Central", spins: 10, works: 2, artists: 2, with_evidence: 10 }], [], "2026-11", false);
    render(<MonthlyPack />);
    await waitFor(() => expect(screen.getByText(/^Sample data/)).toBeTruthy());
  });
});
