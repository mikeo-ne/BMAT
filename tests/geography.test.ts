import { describe, expect, it } from "vitest";

import { buildSeedTracks } from "@/lib/catalog";
import {
  buildHitPredictor,
  buildHubMetrics,
  buildVelocity,
  CROSS_BORDER_HUBS,
  EMERGING_SPIN_FLOOR,
  GEO_HUBS,
  hubById,
  UGANDA_HUBS,
  VERDICT_LABEL,
} from "@/lib/geography";

const CATALOGUE = buildSeedTracks(new Date("2026-09-03T00:00:00Z"));
const METRICS = buildHubMetrics(CATALOGUE);

describe("hub panel", () => {
  it("covers the five Ugandan hubs and both cross-border markets", () => {
    const names = GEO_HUBS.map((h) => h.name);
    for (const hub of ["Kampala", "Jinja", "Mbarara", "Gulu", "Mbale", "Nairobi", "Dar es Salaam"]) {
      expect(names).toContain(hub);
    }
    expect(UGANDA_HUBS).toHaveLength(5);
    expect(CROSS_BORDER_HUBS).toHaveLength(2);
  });

  it("maps every Ugandan hub to a reporting region", () => {
    for (const hub of UGANDA_HUBS) {
      expect(hub.region).toBeTruthy();
    }
    for (const hub of CROSS_BORDER_HUBS) {
      expect(hub.region).toBeNull();
    }
  });

  it("has unique ids and a lookup that resolves them", () => {
    expect(new Set(GEO_HUBS.map((h) => h.id)).size).toBe(GEO_HUBS.length);
    for (const hub of GEO_HUBS) {
      expect(hubById(hub.id)).toBe(hub);
    }
    expect(hubById("nope")).toBeUndefined();
  });
});

describe("hub metrics", () => {
  it("returns one metric per hub with non-negative spins", () => {
    expect(METRICS).toHaveLength(GEO_HUBS.length);
    for (const metric of METRICS) {
      expect(metric.spins7d).toBeGreaterThanOrEqual(0);
      expect(metric.spinsPrev7d).toBeGreaterThanOrEqual(0);
      expect(metric.searchIndex).toBeGreaterThanOrEqual(0);
      expect(metric.searchIndex).toBeLessThanOrEqual(100);
    }
  });

  it("computes growth as the week-on-week change", () => {
    for (const metric of METRICS) {
      if (metric.spinsPrev7d === 0) continue;
      const expected = (metric.spins7d - metric.spinsPrev7d) / metric.spinsPrev7d;
      expect(metric.growthRate!).toBeCloseTo(expected, 10);
    }
  });
});

describe("track velocity", () => {
  it("compares seven days of spins against seven days of search", () => {
    const velocity = buildVelocity(CATALOGUE[0]);

    expect(velocity.series).toHaveLength(7);
    for (const point of velocity.series) {
      expect(point.spins).toBeGreaterThanOrEqual(0);
      expect(point.search).toBeGreaterThanOrEqual(0);
      expect(point.search).toBeLessThanOrEqual(100);
    }
  });

  it("names the track it is describing", () => {
    const velocity = buildVelocity(CATALOGUE[0]);
    expect(velocity.title).toBe(CATALOGUE[0].title);
    expect(velocity.primaryArtist).toBe(CATALOGUE[0].primaryArtist);
  });
});

describe("A&R hit predictor", () => {
  const candidates = buildHitPredictor(CATALOGUE);

  it("only promotes tracks that cleared the secondary-market floor", () => {
    for (const candidate of candidates) {
      expect(candidate.secondarySpins).toBeGreaterThanOrEqual(EMERGING_SPIN_FLOOR);
    }
  });

  it("ranks by breakout score, descending", () => {
    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i - 1].score).toBeGreaterThanOrEqual(candidates[i].score);
    }
  });

  it("keeps the score inside 0-100 and labels every verdict", () => {
    for (const candidate of candidates) {
      expect(candidate.score).toBeGreaterThanOrEqual(0);
      expect(candidate.score).toBeLessThanOrEqual(100);
      expect(VERDICT_LABEL[candidate.verdict]).toBeTruthy();
    }
  });

  it("nominates a secondary market, never Kampala, as the breakout hub", () => {
    for (const candidate of candidates) {
      expect(candidate.breakoutHub.tier).toBe("secondary");
      expect(candidate.breakoutHub.name).not.toBe("Kampala");
    }
  });
});
