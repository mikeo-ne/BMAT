import { describe, expect, it } from "vitest";
import {
  CUE_SHEET_TARIFF_UGX_PER_PLAY,
  CUE_SHEET_UNMATCHED_LABEL,
  buildCueSheet,
  cueSheetToCsv,
  cueSheetToPdf,
  cueSheetToXlsx,
  type CueSheetOptions,
} from "@/lib/cue-sheets";
import { DEFAULT_WEIGHTING, FLAT_WEIGHTING } from "@/lib/dayparts";
import type { BroadcastSpin } from "@/lib/playout";

function spin(overrides: Partial<BroadcastSpin> & Pick<BroadcastSpin, "id">): BroadcastSpin {
  return {
    detectedAt: "2026-11-02T09:30:00.000Z",
    stationId: "capital-kla",
    stationName: "Capital FM",
    region: "Central",
    medium: "FM",
    trackId: "t-1",
    title: "Mulongo",
    primaryArtist: "Mukisa Collective",
    isrc: "UG-ESD-26-00001",
    durationSec: 214,
    confidence: 0.94,
    source: "captured",
    ...overrides,
  };
}

const options: CueSheetOptions = {
  stationId: "capital-kla",
  stationName: "Capital FM",
  licensee: "Capital FM Uganda Ltd",
  frequency: "91.3 MHz",
  medium: "FM",
  generatedAt: "2026-11-03T09:00:00.000Z",
  periodStart: "2026-10-20T00:00:00.000Z",
  periodEnd: "2026-11-03T23:59:59.999Z",
  policy: DEFAULT_WEIGHTING,
};

describe("buildCueSheet", () => {
  it("keeps only the selected station and reporting window, sorted by time", () => {
    const events = [
      spin({ id: "late", detectedAt: "2026-11-02T09:30:00.000Z" }),
      spin({ id: "early", detectedAt: "2026-10-21T09:30:00.000Z" }),
      spin({
        id: "other-station",
        stationId: "cbs-kla",
        stationName: "CBS FM",
      }),
      spin({ id: "outside", detectedAt: "2026-12-01T09:30:00.000Z" }),
    ];
    const sheet = buildCueSheet(events, options);
    expect(sheet.detail.map((row) => row.playIndex)).toEqual([1, 2]);
    expect(sheet.detail[0].detectedAt).toBe("2026-10-21T09:30:00.000Z");
    expect(sheet.totals.plays).toBe(2);
  });

  it("assigns EAT daypart bands from the captured timestamp", () => {
    const events = [
      // 06:30 EAT → prime (06:00–10:00)
      spin({ id: "a", detectedAt: "2026-11-02T03:30:00.000Z" }),
      // 18:30 EAT → prime (16:00–20:00)
      spin({ id: "b", detectedAt: "2026-11-02T15:30:00.000Z" }),
      // 12:00 EAT → standard
      spin({ id: "c", detectedAt: "2026-11-02T09:00:00.000Z" }),
      // 23:00 EAT → night
      spin({ id: "d", detectedAt: "2026-11-02T20:00:00.000Z" }),
      // 03:00 EAT → night (after midnight)
      spin({ id: "e", detectedAt: "2026-11-02T00:00:00.000Z" }),
    ];
    const sheet = buildCueSheet(events, options);
    expect(sheet.totals.bandPlays).toEqual({ prime: 2, standard: 1, night: 2 });
    // Detail is sorted ascending: e(03:00) a(06:30) c(12:00) b(18:30) d(23:00) EAT.
    expect(sheet.detail.map((row) => row.timeBand)).toEqual([
      "night",
      "prime",
      "standard",
      "prime",
      "night",
    ]);
  });

  it("aggregates by recording and weights plays with the policy multipliers", () => {
    const events = [
      spin({ id: "a", detectedAt: "2026-11-02T03:30:00.000Z" }), // prime ×1.5
      spin({ id: "b", detectedAt: "2026-11-02T09:30:00.000Z" }), // standard ×1
      spin({ id: "c", detectedAt: "2026-11-02T09:30:00.000Z" }), // standard ×1
    ];
    const sheet = buildCueSheet(events, options);
    expect(sheet.byTrack).toHaveLength(1);
    const row = sheet.byTrack[0];
    expect(row.plays).toBe(3);
    expect(row.bandPlays).toEqual({ prime: 1, standard: 2, night: 0 });
    expect(row.weightedPlays).toBeCloseTo(3.5);
    expect(row.share).toBeCloseTo(1);
    expect(sheet.totals.weightedPlays).toBeCloseTo(3.5);
    expect(sheet.totals.indicativePoolUgx).toBe(
      Math.round(3.5 * CUE_SHEET_TARIFF_UGX_PER_PLAY),
    );
  });

  it("uses flat weighting when the policy is flat", () => {
    const events = [
      spin({ id: "a", detectedAt: "2026-11-02T03:30:00.000Z" }),
      spin({ id: "b", detectedAt: "2026-11-02T20:00:00.000Z" }),
    ];
    const sheet = buildCueSheet(events, { ...options, policy: FLAT_WEIGHTING });
    expect(sheet.totals.weightedPlays).toBe(2);
  });

  it("lists unmatched audio with the unidentified label and a blank ISRC", () => {
    const events = [
      spin({
        id: "u",
        trackId: null,
        title: null,
        primaryArtist: null,
        isrc: null,
        confidence: 0.41,
      }),
    ];
    const sheet = buildCueSheet(events, options);
    expect(sheet.detail[0].title).toBe(CUE_SHEET_UNMATCHED_LABEL);
    expect(sheet.detail[0].isrc).toBe("");
    expect(sheet.totals.recordings).toBe(1);
  });

  it("separates two recordings of the same title by artist", () => {
    const events = [
      spin({ id: "a", primaryArtist: "Ray Bwete" }),
      spin({ id: "b", primaryArtist: "Mukisa Collective" }),
    ];
    const sheet = buildCueSheet(events, options);
    expect(sheet.totals.recordings).toBe(2);
    expect(sheet.byTrack.map((row) => row.artist).sort()).toEqual([
      "Mukisa Collective",
      "Ray Bwete",
    ]);
  });

  it("prints EAT clocks and durations on the detail ledger", () => {
    const sheet = buildCueSheet([spin({ id: "a" })], options);
    expect(sheet.detail[0].eatClock).toContain("12:30");
    expect(sheet.detail[0].day).toBe("2026-11-02");
    expect(sheet.detail[0].durationSec).toBe(214);
  });
});

describe("cue sheet exports", () => {
  const sheet = buildCueSheet(
    [
      spin({ id: "a", detectedAt: "2026-11-02T03:30:00.000Z" }),
      spin({ id: "b", detectedAt: "2026-11-02T09:30:00.000Z" }),
    ],
    options,
  );

  it("exports an Excel-compatible CSV with the full document structure", () => {
    const csv = cueSheetToCsv(sheet);
    expect(csv).toContain("UPRS BROADCAST CUE SHEET");
    expect(csv).toContain("Capital FM Uganda Ltd");
    expect(csv).toContain("91.3 MHz");
    expect(csv).toContain("Mulongo");
    expect(csv).toContain("UG-ESD-26-00001");
    expect(csv).toContain("SUMMARY BY RECORDING");
    expect(csv).toContain("TOTALS");
    expect(csv).toContain("placeholder tariff");
  });

  it("produces real XLSX bytes with a valid ZIP container", () => {
    const bytes = cueSheetToXlsx(sheet);
    const signature = [0x50, 0x4b, 0x03, 0x04];
    expect(Array.from(bytes.slice(0, 4))).toEqual(signature);
    expect(Array.from(bytes.slice(-22, -18))).toEqual([0x50, 0x4b, 0x05, 0x06]);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("UPRS BROADCAST CUE SHEET");
    expect(text).toContain("inlineStr");
    expect(text).toContain("[Content_Types].xml");
    expect(text).toContain("xl/workbook.xml");
  });

  it("renders a multi-page PDF document", async () => {
    const bytes = await cueSheetToPdf(sheet);
    const text = new TextDecoder("latin1").decode(bytes.slice(0, 5));
    expect(text).toBe("%PDF-");
  });
});
