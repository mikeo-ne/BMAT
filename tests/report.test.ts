import { describe, expect, it } from "vitest";
import { csvEscape } from "@/lib/export/csv";
import { loadSongReport, parseReport, pitchText, reportRows, REPORT_HEADERS, type SongAirplay } from "@/lib/db/report";

const song = (o: Partial<SongAirplay> = {}): SongAirplay => ({
  id: "1", title: "Kampala Nights", artist: "Lamaro Grace", featuring: null, isrc: "UG-A1B-26-00012", upc: null,
  plays: 31, stations: 7, first_play: "2026-10-15T08:12:00Z", last_play: "2026-11-11T16:42:00Z",
  regions: ["Central", "Eastern"], top_stations: [{ name: "Capital FM", plays: 11 }, { name: "Galaxy FM", plays: 9 }], proof_token: null, ...o,
});

describe("airplay report", () => {
  it("writes a pitch with plays, stations, top stations, regions and ISRC", () => {
    const t = pitchText(song(), 30)!;
    expect(t).toContain('"Kampala Nights" by Lamaro Grace has played 31 times on 7 Ugandan radio stations in the last 30 days');
    expect(t).toContain("most spins on Capital FM and Galaxy FM");
    expect(t).toContain("across Central and Eastern Uganda");
    expect(t).toContain("ISRC UG-A1B-26-00012");
  });

  it("handles one play, one station, a featured artist and a proof link", () => {
    const t = pitchText(song({ plays: 1, stations: 1, featuring: "Kato", regions: ["Western"], top_stations: [] }), 7, "https://x/proof/abc")!;
    expect(t).toContain("by Lamaro Grace ft. Kato has played once on 1 Ugandan radio station in the last 7 days in Western Uganda.");
    expect(t.endsWith("Hear it on air: https://x/proof/abc")).toBe(true);
  });

  it("has nothing to pitch before the first play", () => {
    expect(pitchText(song({ plays: 0 }), 30)).toBeNull();
  });

  it("exports one row per song with ISRC and UPC, matching the headers", async () => {
    const r = await loadSongReport(30);
    const rows = reportRows(r);
    expect(rows).toHaveLength(r.songs.length);
    for (const row of rows) expect(row).toHaveLength(REPORT_HEADERS.length);
    expect(rows[0][3]).toBe(r.songs[0].isrc);
  });

  it("tolerates missing fields from the database", () => {
    const r = parseReport({ songs: [{ title: "x", plays: "2", regions: null, top_stations: null }] });
    expect(r.songs[0].plays).toBe(2);
    expect(r.songs[0].regions).toEqual([]);
    expect(r.days).toBe(30);
  });
});

describe("csv export safety", () => {
  it("neutralises formulas typed into text cells but leaves numbers alone", () => {
    expect(csvEscape('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvEscape("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvEscape(-5)).toBe("-5");
    expect(csvEscape("Kampala Nights")).toBe("Kampala Nights");
  });
});
