import { describe, expect, it } from "vitest";

import {
  FALLBACK_TRACK_SEC,
  QUARTER_HOUR_SEC,
  fmtReach,
  reachCaveat,
  stationImpressions,
  summariseReach,
  type ReachRow,
} from "@/lib/reach";

/**
 * Impressions are the number an advertiser will hold us to, so the tests are
 * mostly about refusing to produce one: no declared audience, no claim.
 */
const row = (over: Partial<ReachRow> = {}): ReachRow => ({
  station: "Capital FM",
  region: "Central",
  kind: "radio",
  spins: 100,
  listenSeconds: 100 * 198,
  aqh: 18_000,
  audienceSource: "Station survey 2026",
  audienceAsOf: "2026-06-30",
  ...over,
});

describe("stationImpressions", () => {
  it("multiplies declared audience by quarter-hours aired", () => {
    // 900 s of music = one quarter hour → impressions equal AQH.
    expect(stationImpressions(QUARTER_HOUR_SEC, 10_000, 5)).toBe(10_000);
    expect(stationImpressions(QUARTER_HOUR_SEC * 4, 10_000, 5)).toBe(40_000);
  });

  it("returns null — not zero — when the station has no audience figure", () => {
    expect(stationImpressions(99_999, null, 500)).toBeNull();
  });

  it("falls back to a 3:30 track when durations are missing", () => {
    const estimate = stationImpressions(0, 1_000, 10);
    expect(estimate).toBe(Math.round(1_000 * ((10 * FALLBACK_TRACK_SEC) / QUARTER_HOUR_SEC)));
  });

  it("treats a declared audience of zero as zero, and ignores junk", () => {
    expect(stationImpressions(900, 0, 3)).toBe(0);
    // A negative duration is treated as "missing", so the 3:30 fallback applies.
    expect(stationImpressions(-10, 5_000, 2)).toBe(Math.round(5_000 * ((2 * FALLBACK_TRACK_SEC) / QUARTER_HOUR_SEC)));
  });
});

describe("summariseReach", () => {
  it("counts only stations we can defend, and reports the coverage gap", () => {
    const summary = summariseReach([
      row({ spins: 100, listenSeconds: 900 }),
      row({ station: "Pearl FM", spins: 50, listenSeconds: 450, aqh: 4_000 }),
      row({ station: "Radio Gulu", spins: 500, listenSeconds: 90_000, aqh: null }),
    ]);
    expect(summary).toEqual({ stations: 3, withAudience: 2, coverage: 67, impressions: 18_000 + 2_000, playsCovered: 150 });
  });

  it("returns a zero summary for no rows instead of dividing by zero", () => {
    expect(summariseReach([])).toEqual({ stations: 0, withAudience: 0, coverage: 0, impressions: 0, playsCovered: 0 });
    expect(summariseReach(null)).toEqual({ stations: 0, withAudience: 0, coverage: 0, impressions: 0, playsCovered: 0 });
  });
});

describe("the caveat is part of the metric", () => {
  it("says plainly when there is no audience data at all", () => {
    const text = reachCaveat({ stations: 12, withAudience: 0, coverage: 0, impressions: 0, playsCovered: 0 });
    expect(text).toMatch(/No station has supplied an audience figure/);
    expect(text).toMatch(/not guessed|No station/);
  });

  it("states the shortfall when only some stations report", () => {
    const text = reachCaveat({ stations: 12, withAudience: 5, coverage: 42, impressions: 1, playsCovered: 1 });
    expect(text).toMatch(/5 of 12 stations/);
    expect(text).toMatch(/excluded, not guessed/);
  });

  it("still calls a full panel an estimate, not a measurement", () => {
    const text = reachCaveat({ stations: 4, withAudience: 4, coverage: 100, impressions: 1, playsCovered: 1 });
    expect(text).toMatch(/Estimates, not a panel measurement/);
  });
});

describe("fmtReach", () => {
  it("compacts large numbers for a dashboard tile", () => {
    expect(fmtReach(999)).toBe("999");
    expect(fmtReach(12_400)).toBe("12k");
    expect(fmtReach(1_240_000)).toBe("1.2M");
    expect(fmtReach(24_000_000)).toBe("24M");
    expect(fmtReach(-5)).toBe("0");
  });
});
