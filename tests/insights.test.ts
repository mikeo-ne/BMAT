import { describe, expect, it } from "vitest";
import { byRegion, hourLabel, loadInsights, loadProof, parseInsights, peakHours, DEMO_TOKEN } from "@/lib/db/insights";

describe("airplay insights", () => {
  it("fills missing hours and weekdays with zero and tolerates nulls", () => {
    const d = parseInsights({ by_hour: [1, 2], by_weekday: null, by_station: null, plays: "4" });
    expect(d.byHour).toHaveLength(24);
    expect(d.byWeekday).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(d.byStation).toEqual([]);
    expect(d.plays).toBe(4);
    expect(parseInsights(null).days).toBe(30);
  });

  it("finds peak hours, best first, skipping empty hours", () => {
    const h = Array(24).fill(0);
    h[19] = 6; h[18] = 5; h[8] = 5;
    expect(peakHours(h)).toEqual([19, 8, 18]);
    expect(peakHours(Array(24).fill(0))).toEqual([]);
    expect(hourLabel(7)).toBe("07:00");
  });

  it("groups stations by region in a fixed order", () => {
    const g = byRegion([{ name: "B", region: "Western" }, { name: "A", region: "Central" }, { name: "C", region: "Central" }, { name: "Z", region: "" }]);
    expect(g.map(([r]) => r)).toEqual(["Central", "Western", "Other"]);
    expect(g[0][1]).toEqual(["A", "C"]);
  });

  it("serves a labelled sample in demo mode", async () => {
    const d = await loadInsights(30);
    expect(d.demo).toBe(true);
    expect(d.notPlaying.length).toBeGreaterThan(0);
    expect(d.byStation.reduce((a, s) => a + s.plays, 0)).toBe(d.plays);
  });

  it("only accepts well-formed proof tokens", async () => {
    expect(await loadProof("../../etc")).toBeNull();
    expect(await loadProof("abc")).toBeNull();
    expect(await loadProof(DEMO_TOKEN)).not.toBeNull();
  });
});
