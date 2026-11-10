import { describe, expect, it } from "vitest";

import {
  buildMonthlyPack,
  evidenceShare,
  FEED_MAX_ROWS,
  monthKey,
  monthRange,
  packFilename,
  parseFeedQuery,
  recentMonths,
  stationCsvRows,
  toFeedRow,
  workCsvRows,
} from "@/lib/cmo-report";

/**
 * The distribution pack is the document a CMO files. Wrong month boundaries or
 * a silently dropped station would be a real money error, so the pure layer is
 * tested harder than the UI.
 */

const stationRow = (over: Record<string, unknown> = {}) => ({
  station_id: "s1",
  station: "Capital FM",
  region: "Central",
  spins: 100,
  works: 20,
  artists: 10,
  with_evidence: 97,
  first_play: "2026-11-02T05:14:00Z",
  last_play: "2026-11-27T22:41:00Z",
  ...over,
});

describe("month boundaries", () => {
  it("uses Kampala time so a 00:30 play on the 1st is not filed in the previous month", () => {
    // 2026-11-01T00:30 Kampala = 2026-10-31T21:30 UTC
    expect(monthKey(new Date("2026-10-31T21:30:00Z"))).toBe("2026-11");
    expect(monthKey(new Date("2026-11-30T21:30:00Z"))).toBe("2026-12");
  });

  it("rejects anything that is not YYYY-MM", () => {
    expect(() => monthRange("2026-13")).toThrow();
    expect(() => monthRange("November")).toThrow();
    expect(() => monthRange("2026-1")).toThrow();
  });

  it("knows month lengths, including February in a leap year", () => {
    expect(monthRange("2026-11")).toMatchObject({ from: "2026-11-01", to: "2026-11-30", days: 30, label: "November 2026" });
    expect(monthRange("2026-02").days).toBe(28);
    expect(monthRange("2028-02").days).toBe(29);
  });

  it("lists recent months newest first, rolling over the year", () => {
    expect(recentMonths(3, new Date("2026-01-15T12:00:00Z"))).toEqual(["2026-01", "2025-12", "2025-11"]);
  });
});

describe("building the pack", () => {
  it("sums totals and sorts stations by plays", () => {
    const pack = buildMonthlyPack(
      [stationRow(), stationRow({ station_id: "s2", station: "Pearl FM", region: "Eastern", spins: 400 })],
      [],
      "2026-11",
      true,
    );
    expect(pack.stations.map((s) => s.station)).toEqual(["Pearl FM", "Capital FM"]);
    expect(pack.totals).toMatchObject({ spins: 500, stations: 2, evidence: 194 });
    expect(pack.label).toBe("November 2026");
  });

  it("survives a broken RPC without inventing plays", () => {
    const pack = buildMonthlyPack(null, undefined, "2026-11", true);
    expect(pack.stations).toEqual([]);
    expect(pack.totals.spins).toBe(0);
    expect(evidenceShare(pack)).toBe(0);
  });

  it("ignores negative or non-numeric counts", () => {
    const pack = buildMonthlyPack([stationRow({ spins: -5, works: "many", with_evidence: NaN })], [], "2026-11", true);
    expect(pack.stations[0]).toMatchObject({ spins: 0, works: 0, withEvidence: 0 });
  });

  it("keeps the standard columns for the CSV and the PDF", () => {
    const pack = buildMonthlyPack([stationRow()], [{ rank: 1, title: "Kampala Nights", artist: "Nalu Akello", owner: "East Sound", spins: 42, stations: 6 }], "2026-11", true);
    expect(stationCsvRows(pack)[0]).toEqual(["Capital FM", "Central", "100", "20", "10", "97", "2026-11-02", "2026-11-27"]);
    expect(workCsvRows(pack)[0]).toEqual(["1", "Kampala Nights", "Nalu Akello", "East Sound", "42", "6"]);
    expect(evidenceShare(pack)).toBe(97);
  });

  it("names files deterministically, and refuses to build a path from junk", () => {
    expect(packFilename("2026-11", "pdf")).toBe("east-sound-station-report-2026-11.pdf");
    expect(packFilename("../../etc/passwd", "csv")).toMatch(/^east-sound-station-report-\d{4}-\d{2}\.csv$/);
  });
});

describe("feed query contract", () => {
  const at = new Date("2026-11-10T09:00:00Z");

  it("defaults to the current month, JSON and a safe limit", () => {
    const r = parseFeedQuery(new URLSearchParams(), at);
    expect(r).toEqual({ ok: true, query: { month: "2026-11", from: "2026-11-01", to: "2026-11-30", format: "json", station: null, limit: 10_000 } });
  });

  it("accepts csv, a station slug and an explicit limit", () => {
    const r = parseFeedQuery(new URLSearchParams({ month: "2026-10", format: "CSV", station: "capital-fm", limit: "50" }), at);
    expect(r.ok && r.query).toMatchObject({ month: "2026-10", format: "csv", station: "capital-fm", limit: 50 });
  });

  it("caps the limit instead of letting a caller ask for everything", () => {
    const r = parseFeedQuery(new URLSearchParams({ limit: "999999" }), at);
    expect(r.ok && r.query.limit).toBe(FEED_MAX_ROWS);
  });

  it("rejects a malformed month with a message a client can act on", () => {
    const r = parseFeedQuery(new URLSearchParams({ month: "2026-11-01" }), at);
    expect(r).toEqual({ ok: false, error: "month must look like 2026-11" });
  });
});

describe("feed rows", () => {
  it("flattens the nested station and recording shapes", () => {
    const row = toFeedRow({
      detected_at: "2026-11-02T05:14:00Z",
      source: "stream",
      confidence: "91.5",
      duration_sec: 198,
      evidence_path: "2026/11/02/clip.wav",
      stations: [{ name: "Capital FM", region: "Central" }],
      recordings: { title: "Kampala Nights", artist_name: "Nalu Akello", isrc: "UGABC2600001" },
    });
    expect(row).toMatchObject({ station: "Capital FM", region: "Central", title: "Kampala Nights", confidence: 91.5, duration_sec: 198 });
  });

  it("falls back to the matched title when the recording row is gone", () => {
    const row = toFeedRow({ detected_at: "2026-11-02T05:14:00Z", matched_title: "Unknown Hit", matched_artist: "Someone", recordings: null });
    expect(row).toMatchObject({ title: "Unknown Hit", artist: "Someone", station: null, confidence: null });
  });
});
