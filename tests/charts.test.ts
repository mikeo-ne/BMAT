import { describe, expect, it } from "vitest";

import { buildWeeklyChart, CHART_SIZE, weekStartIso } from "@/lib/charts";
import { buildSeedTracks } from "@/lib/catalog";

const NOW = new Date("2026-09-03T00:00:00Z");
const CHART = buildWeeklyChart(buildSeedTracks(NOW), NOW);

describe("weekStartIso", () => {
  it("lands on the Monday of the week", () => {
    // 2026-09-03 is a Thursday; the Monday of that week is 2026-08-31.
    expect(weekStartIso(NOW)).toBe("2026-08-31");
    // A Monday maps to itself.
    expect(weekStartIso(new Date("2026-08-31T00:00:00Z"))).toBe("2026-08-31");
  });
});

describe("buildWeeklyChart", () => {
  it("only charts recordings with spins in the last seven days", () => {
    expect(CHART.entries.length).toBeGreaterThan(0);
    for (const entry of CHART.entries) {
      expect(entry.spins7d).toBeGreaterThan(0);
    }
  });

  it("ranks by seven-day spins with contiguous ranks", () => {
    for (let i = 1; i < CHART.entries.length; i++) {
      expect(CHART.entries[i - 1].spins7d).toBeGreaterThanOrEqual(CHART.entries[i].spins7d);
    }
    CHART.entries.forEach((entry, i) => expect(entry.rank).toBe(i + 1));
  });

  it("never exceeds the chart size", () => {
    expect(CHART.entries.length).toBeLessThanOrEqual(CHART_SIZE);
  });

  it("marks a debut when there were no spins last week", () => {
    for (const entry of CHART.entries) {
      if (entry.previousRank === null) {
        expect(entry.spinsPrev7d).toBe(0);
        expect(entry.movement).toBeNull();
      } else {
        expect(entry.spinsPrev7d).toBeGreaterThan(0);
        expect(entry.movement).toBe(entry.previousRank - entry.rank);
      }
    }
  });

  it("keeps the peak at or above the current rank", () => {
    for (const entry of CHART.entries) {
      expect(entry.peakPosition).toBeGreaterThanOrEqual(1);
      expect(entry.peakPosition).toBeLessThanOrEqual(entry.rank);
    }
  });

  it("reports totals consistent with the entries", () => {
    expect(CHART.totalSpins).toBe(CHART.entries.reduce((s, e) => s + e.spins7d, 0));
    expect(CHART.newEntries).toBe(
      CHART.entries.filter((e) => e.previousRank === null).length,
    );
  });

  it("names a climber only when someone actually climbed", () => {
    const anyUp = CHART.entries.some((e) => (e.movement ?? 0) > 0);
    expect(CHART.biggestClimber !== null).toBe(anyUp);
  });

  it("is deterministic", () => {
    const again = buildWeeklyChart(buildSeedTracks(NOW), NOW);
    expect(again.entries.map((e) => `${e.rank}:${e.track.id}`)).toEqual(
      CHART.entries.map((e) => `${e.rank}:${e.track.id}`),
    );
  });
});
