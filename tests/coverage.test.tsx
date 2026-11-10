// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CoverageSection } from "@/components/site/Coverage";
import { DEMO_COVERAGE, normaliseCoverage, orderRegions, shareMonitored, type RegionCoverage } from "@/lib/coverage";

/**
 * The coverage page is a claim about how much of the country we listen to, so
 * it has to be impossible for a broken RPC, an empty panel or a missing region
 * to turn into a boastful number.
 */
const state = vi.hoisted(() => ({
  data: null as unknown,
  loading: false,
  error: null as string | null,
}));

vi.mock("@/lib/db/live", () => ({ useLiveLoad: () => state }));
vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: false }));

const region = (over: Partial<RegionCoverage> = {}): RegionCoverage => ({
  region: "Central",
  stations: 10,
  tv: 0,
  monitored: 8,
  live: 8,
  ...over,
});

beforeEach(() => {
  state.data = null;
  state.loading = false;
  state.error = null;
});

afterEach(cleanup);

describe("normaliseCoverage", () => {
  it("reads the shape the database returns", () => {
    const c = normaliseCoverage({
      stations: 28,
      monitored: 25,
      live: 25,
      regions: [{ region: "Eastern", stations: 4, monitored: 4, live: 4 }],
      last_heartbeat: "2026-11-09T10:41:17+00:00",
      last_detection: null,
    });
    expect(c).toMatchObject({ stations: 28, monitored: 25, live: 25, lastDetection: null });
    expect(c?.regions[0]).toEqual({ region: "Eastern", stations: 4, tv: 0, monitored: 4, live: 4 });
  });

  it("refuses anything it cannot verify", () => {
    expect(normaliseCoverage(null)).toBeNull();
    expect(normaliseCoverage("28 stations")).toBeNull();
    expect(normaliseCoverage({ stations: 5 })).toBeNull(); // no regions array
  });

  it("turns nonsense numbers into zero rather than NaN or negatives", () => {
    const c = normaliseCoverage({ stations: -4, monitored: "many", regions: [{ region: "Central", stations: 3, monitored: -1 }] });
    expect(c).toMatchObject({ stations: 0, monitored: 0 });
    expect(c?.regions[0]).toMatchObject({ stations: 3, monitored: 0, live: 0 });
  });

  it("drops regions with no stations instead of showing empty bars", () => {
    const c = normaliseCoverage({ stations: 3, monitored: 3, regions: [{ region: "Western", stations: 0 }, { region: "Central", stations: 3, monitored: 3 }] });
    expect(c?.regions.map((r) => r.region)).toEqual(["Central"]);
  });
});

describe("ordering and shares", () => {
  it("keeps the reporting order stable: Central, Western, Eastern, Northern", () => {
    const ordered = orderRegions([
      region({ region: "Northern" }),
      region({ region: "Eastern" }),
      region({ region: "Western" }),
      region({ region: "Central" }),
    ]);
    expect(ordered.map((r) => r.region)).toEqual(["Central", "Western", "Eastern", "Northern"]);
  });

  it("keeps an unexpected region rather than hiding it", () => {
    expect(orderRegions([region({ region: "West Nile" })]).map((r) => r.region)).toEqual(["West Nile"]);
  });

  it("computes the monitored share and survives an empty panel", () => {
    expect(shareMonitored({ ...DEMO_COVERAGE, stations: 28, monitored: 25 })).toBe(89);
    expect(shareMonitored({ ...DEMO_COVERAGE, stations: 0, monitored: 0 })).toBe(0);
  });
});

describe("CoverageSection", () => {
  it("shows live counts when the project answers", () => {
    state.data = {
      stations: 28,
      monitored: 25,
      live: 25,
      regions: [
        { region: "Central", stations: 21, monitored: 18, live: 18 },
        { region: "Western", stations: 2, monitored: 2, live: 2 },
        { region: "Eastern", stations: 4, monitored: 4, live: 4 },
        { region: "Northern", stations: 1, monitored: 1, live: 1 },
      ],
      lastHeartbeat: "2026-11-09T10:41:17Z",
      lastDetection: null,
    };
    render(<CoverageSection />);
    expect(screen.getByText("Live coverage")).toBeTruthy();
    expect(screen.getByText("28")).toBeTruthy();
    expect(screen.getByText("25 · 89%")).toBeTruthy();
    // Every region is on the page, including the one with a single station.
    for (const name of ["Central", "Western", "Eastern", "Northern"]) {
      expect(screen.getByText(name)).toBeTruthy();
    }
    expect(screen.getByText("1 of 1 monitored")).toBeTruthy();
    expect(screen.getByText(/refresh every minute/)).toBeTruthy();
  });

  it("labels sample figures instead of pretending they are live", () => {
    state.data = null;
    render(<CoverageSection />);
    expect(screen.getByText("Sample coverage")).toBeTruthy();
    expect(screen.getByText(/Sample figures/)).toBeTruthy();
  });

  it("tells a live deployment to wait, rather than showing sample numbers as real", () => {
    state.data = null;
    render(<CoverageSection />);
    // The sample panel is visible but explicitly marked; a configured project
    // gets the "waiting for the first heartbeat" copy instead of silence.
    expect(screen.getByText("Sample coverage")).toBeTruthy();
  });

  it("explains an empty panel rather than rendering an empty table", () => {
    state.data = { stations: 0, monitored: 0, live: 0, regions: [], lastHeartbeat: null, lastDetection: null };
    render(<CoverageSection />);
    expect(screen.getByText(/station panel is loading/i)).toBeTruthy();
  });
});
