import { describe, expect, it } from "vitest";
import { buildFixtureTracks as buildSeedTracks } from "@/tests/fixtures/catalogue";
import {
  buildBroadcastLog,
  eatDate,
  eatHour,
  eatTime,
  filterBroadcastLog,
  summariseBroadcastLog,
} from "@/lib/playout";
import { REGIONS } from "@/lib/regions";
const NOW = new Date("2026-11-01T12:00:00Z");
const catalogue = buildSeedTracks(NOW);
const log = buildBroadcastLog(catalogue, NOW);

describe("broadcast playout model", () => {
  it("retains the seeded recordings and produces deterministic unique FM and TV demo events", () => {
    expect(buildBroadcastLog(catalogue, NOW)).toEqual(log);
    expect(new Set(log.map((event) => event.id)).size).toBe(log.length);
    expect(
      log.every((event) => event.source === "demo" && !event.evidence),
    ).toBe(true);
    expect(
      log.some(
        (event) => event.stationName === "NBS TV" && event.medium === "TV",
      ),
    ).toBe(true);
    for (const track of catalogue)
      expect(log.some((event) => event.isrc === track.isrc)).toBe(true);
    expect(
      catalogue.find((track) => track.primaryArtist === "QA Ensemble")?.title,
    ).toBe("Fixture C");
  });
  it("uses completed EAT days and never invents pre-release or future events", () => {
    for (const event of log) {
      expect(eatDate(event.detectedAt) >= "2026-10-18").toBe(true);
      expect(eatDate(event.detectedAt) <= "2026-10-31").toBe(true);
      if (event.trackId)
        expect(
          event.detectedAt.slice(0, 10) >=
            catalogue.find((track) => track.id === event.trackId)!.releaseDate,
        ).toBe(true);
    }
    expect(
      buildBroadcastLog([{ ...catalogue[0], releaseDate: "2030-01-01" }], NOW),
    ).toEqual([]);
  });
  it("keeps unknown audio as reviewable events with no fabricated ISRC", () => {
    const unknown = log.filter((event) => !event.isrc);
    expect(unknown.length).toBeGreaterThan(0);
    expect(
      unknown.every(
        (event) =>
          event.title === null &&
          event.trackId === null &&
          event.confidence < 0.6,
      ),
    ).toBe(true);
  });
  it("reconciles modelled FM matched events with the original catalogue totals", () => {
    expect(
      log.filter((event) => event.medium === "FM" && event.isrc).length,
    ).toBe(catalogue.reduce((sum, track) => sum + track.totalSpins, 0));
  });
  it("filters region, station, medium, status, search and reporting window together", () => {
    const filtered = filterBroadcastLog(log, {
      region: "Central",
      stationId: "capital-kla",
      medium: "FM",
      days: 7,
      status: "matched",
      query: "QA Artist Alpha",
    });
    expect(filtered.length).toBeGreaterThan(0);
    expect(
      filtered.every(
        (event) =>
          event.region === "Central" &&
          event.stationId === "capital-kla" &&
          event.primaryArtist === "QA Artist Alpha" &&
          eatDate(event.detectedAt) >= "2026-10-25",
      ),
    ).toBe(true);
    expect(
      filterBroadcastLog(log, { stationId: "nbs-tv-kla", region: "Northern" }),
    ).toEqual([]);
    expect(filterBroadcastLog([...log].reverse(), { days: 7 }).length).toBe(
      filterBroadcastLog(log, { days: 7 }).length,
    );
  });
  it("reconciles the summary and region counts to filtered logs", () => {
    const summary = summariseBroadcastLog(log);
    expect(summary.total).toBe(summary.matched + summary.unmatched);
    expect(
      REGIONS.reduce(
        (sum, region) => sum + filterBroadcastLog(log, { region }).length,
        0,
      ),
    ).toBe(summary.total);
    const stationSpins = log.filter(
      (event) => event.stationName === summary.topStation!.name && event.isrc,
    ).length;
    expect(summary.topStation!.count).toBe(stationSpins);
    expect(summary.peakWindow).toMatch(/^\d{2}:00–\d{2}:00$/);
  });
  it("handles an empty catalogue and view", () => {
    expect(buildBroadcastLog([], NOW)).toEqual([]);
    expect(filterBroadcastLog([], { days: 7 })).toEqual([]);
    expect(summariseBroadcastLog([])).toMatchObject({
      total: 0,
      unmatched: 0,
      topStation: null,
      peakWindow: "—",
    });
  });
  it("converts UTC across EAT midnight correctly", () => {
    expect(eatDate("2026-10-31T22:30:15Z")).toBe("2026-11-01");
    expect(eatTime("2026-10-31T22:30:15Z")).toBe("01:30:15");
    expect(eatHour("2026-10-31T22:30:15Z")).toBe(1);
  });
});
