import { describe, expect, it } from "vitest";

import {
  combinedTrend,
  createRandom,
  generateAirplay,
  hashSeed,
  regionShare,
  reportingStations,
  totalSpins,
} from "@/lib/airplay";
import { REGIONS, stationsForRegion } from "@/lib/regions";

const NOW = new Date("2026-09-03T00:00:00Z");

describe("hashSeed / createRandom", () => {
  it("is stable for the same input", () => {
    expect(hashSeed("UG-ESD-26-00001")).toBe(hashSeed("UG-ESD-26-00001"));
  });

  it("differs across inputs", () => {
    expect(hashSeed("UG-ESD-26-00001")).not.toBe(hashSeed("UG-ESD-26-00002"));
  });

  it("stays inside [0,1)", () => {
    const rand = createRandom(hashSeed("panel"));
    for (let i = 0; i < 500; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("regionShare", () => {
  it("covers every region and sums to 1", () => {
    const total = REGIONS.reduce((sum, r) => sum + regionShare(r), 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it("gives Central the largest share of the panel", () => {
    const central = regionShare("Central");
    for (const region of REGIONS) {
      expect(central).toBeGreaterThanOrEqual(regionShare(region));
    }
  });
});

describe("generateAirplay", () => {
  const airplay = generateAirplay({
    seed: "UG-ESD-26-00001",
    releaseDate: "2026-08-28",
    now: NOW,
  });

  it("returns one entry per region", () => {
    expect(airplay.map((a) => a.region)).toEqual([...REGIONS]);
  });

  it("keeps the 14-day trend summing to the reported spins", () => {
    for (const entry of airplay) {
      expect(entry.trend).toHaveLength(14);
      expect(entry.trend.reduce((a, b) => a + b, 0)).toBe(entry.spins);
    }
  });

  it("never reports more stations than the region actually has", () => {
    for (const entry of airplay) {
      expect(entry.stations).toBeGreaterThanOrEqual(1);
      expect(entry.stations).toBeLessThanOrEqual(stationsForRegion(entry.region).length);
    }
  });

  it("registers a non-zero signal for a current release", () => {
    expect(totalSpins(airplay)).toBeGreaterThan(0);
    expect(reportingStations(airplay)).toBeGreaterThan(0);
  });

  it("is deterministic for the same seed", () => {
    const again = generateAirplay({
      seed: "UG-ESD-26-00001",
      releaseDate: "2026-08-28",
      now: NOW,
    });
    expect(again).toEqual(airplay);
  });

  it("changes when the seed changes", () => {
    const other = generateAirplay({
      seed: "UG-ESD-26-00002",
      releaseDate: "2026-08-28",
      now: NOW,
    });
    expect(totalSpins(other)).not.toBe(totalSpins(airplay));
  });

  it("reports more for a track that has had time to build than one released today", () => {
    const established = generateAirplay({
      seed: "same-seed",
      releaseDate: "2026-06-01",
      now: NOW,
    });
    const brandNew = generateAirplay({
      seed: "same-seed",
      releaseDate: "2026-09-03",
      now: NOW,
    });
    expect(totalSpins(established)).toBeGreaterThan(totalSpins(brandNew));
  });

  it("reports nothing for a release far in the future", () => {
    const future = generateAirplay({
      seed: "future",
      releaseDate: "2030-01-01",
      now: NOW,
    });
    expect(totalSpins(future)).toBeLessThan(totalSpins(airplay));
  });

  it("tolerates an unparseable release date", () => {
    const result = generateAirplay({ seed: "x", releaseDate: "not-a-date", now: NOW });
    expect(result).toHaveLength(REGIONS.length);
  });
});

describe("combinedTrend", () => {
  it("adds the daily curves together", () => {
    const airplay = generateAirplay({
      seed: "UG-ESD-26-00003",
      releaseDate: "2026-08-14",
      now: NOW,
    });
    const combined = combinedTrend(airplay);

    expect(combined).toHaveLength(14);
    expect(combined.reduce((a, b) => a + b, 0)).toBe(totalSpins(airplay));
  });

  it("returns an empty curve for no entries", () => {
    expect(combinedTrend([])).toEqual([]);
  });
});
