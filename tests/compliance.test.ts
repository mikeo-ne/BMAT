import { describe, expect, it } from "vitest";
import { buildFixtureTracks as buildSeedTracks } from "@/tests/fixtures/catalogue";
import {
  complianceLoggingCsv,
  priceSpin,
  summariseWeightedSpins,
  weightPlayLedger,
} from "@/lib/compliance";
import { csvCell } from "@/lib/csv";
import {
  DEFAULT_WEIGHTING,
  FLAT_WEIGHTING,
  timeBandForHour,
} from "@/lib/dayparts";
import { createDemoEvidenceWav, EVIDENCE_SECONDS } from "@/lib/evidence";
import { buildBroadcastLog } from "@/lib/playout";
import {
  buildPlayLedger,
  buildReport,
  EMPTY_FILTERS,
  ledgerToCsv,
  reportToCsv,
} from "@/lib/uprs";
const NOW = new Date("2026-11-01T12:00:00Z"),
  catalogue = buildSeedTracks(NOW);
const log = buildBroadcastLog(catalogue, NOW);
const ledger = buildPlayLedger({ catalogue, now: NOW });

describe("EAT royalty dayparts", () => {
  it.each([
    [5, "night"],
    [6, "prime"],
    [9, "prime"],
    [10, "standard"],
    [15, "standard"],
    [16, "prime"],
    [19, "prime"],
    [20, "standard"],
    [21, "standard"],
    [22, "night"],
    [0, "night"],
  ])("classifies %s:00 as %s", (hour, band) => {
    expect(timeBandForHour(Number(hour))).toBe(band);
  });
  it("rejects invalid hours and weighting inputs", () => {
    expect(() => timeBandForHour(24)).toThrow(RangeError);
    expect(() =>
      priceSpin(log[0], { prime: NaN, standard: 1, night: 1 }),
    ).toThrow(RangeError);
    expect(() =>
      weightPlayLedger(ledger, { prime: -1, standard: 1, night: 1 }),
    ).toThrow(RangeError);
  });
  it("prices a logged spin by its actual EAT hour and never pays an unknown", () => {
    const spin = {
      ...log.find((event) => !!event.isrc)!,
      detectedAt: "2026-10-31T03:00:00Z",
    };
    const priced = priceSpin(spin);
    expect(priced.timeBand).toBe("prime");
    expect(priced.multiplier).toBe(1.5);
    expect(priced.allocationUgx).toBe(Math.round(priced.baseRate * 1.5));
    expect(priceSpin({ ...spin, isrc: null }).allocationUgx).toBe(0);
  });
  it("preserves monthly allocated plays and reconciles weighted report allocations", () => {
    const rows = weightPlayLedger(ledger);
    expect(rows.reduce((sum, row) => sum + row.plays, 0)).toBe(
      ledger.reduce((sum, row) => sum + row.plays, 0),
    );
    for (const row of rows)
      expect(row.allocationUgx).toBe(
        Math.round(row.plays * row.ugxPerPlay * row.multiplier!),
      );
    const report = buildReport(rows, EMPTY_FILTERS, NOW);
    expect(
      report.timeWeighting?.bands.reduce(
        (sum, band) => sum + band.amountUgx,
        0,
      ),
    ).toBe(report.royaltyPoolUgx);
    expect(
      report.allocations.reduce((sum, row) => sum + row.allocationUgx, 0),
    ).toBe(report.royaltyPoolUgx);
    expect(ledgerToCsv(rows).split("\r\n")[0]).toContain(
      "Time band (modelled),Time multiplier",
    );
    expect(reportToCsv(report)).toContain("Prime time multiplier,1.5");
    expect(reportToCsv(report)).toContain("Not timestamped broadcast evidence");
  });
  it("flat weighting is exactly equivalent to the base pool", () => {
    const summary = summariseWeightedSpins(log, FLAT_WEIGHTING);
    expect(summary.basePoolUgx).toBe(summary.weightedPoolUgx);
    expect(
      weightPlayLedger(ledger, FLAT_WEIGHTING).reduce(
        (sum, row) => sum + row.allocationUgx,
        0,
      ),
    ).toBe(ledger.reduce((sum, row) => sum + row.allocationUgx, 0));
  });
});

describe("review logging-sheet CSV", () => {
  it("exports actual selection, EAT timestamps, rates, weights, evidence and review gaps", () => {
    const selected = [
      log.find((event) => event.isrc)!,
      log.find((event) => !event.isrc)!,
    ];
    const csv = complianceLoggingCsv(
      selected,
      catalogue,
      DEFAULT_WEIGHTING,
      NOW,
    );
    expect(csv).toContain("Not an official UPRS template");
    expect(csv).toContain("ISRC,ISWC");
    expect(csv).toContain("Start time (EAT)");
    expect(csv).toContain("Multiplier,Estimated allocation (UGX)");
    expect(csv).toContain("No captured evidence");
    expect(csv).toContain("Unmatched audio — identify before filing");
    expect(csv).toContain(selected[0].isrc!);
    expect(csv.split("\r\n")).toHaveLength(9);
  });
  it("neutralises spreadsheet formulas and escapes commas, CR, LF and quotes", () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("+SUM(1)")).toBe("'+SUM(1)");
    expect(csvCell("@formula")).toBe("'@formula");
    expect(csvCell("name\rvalue")).toBe('"name\rvalue"');
    expect(csvCell(-3)).toBe("-3");
    expect(csvCell('Artist, "name"')).toBe('"Artist, ""name"""');
  });
});

describe("audible demo evidence", () => {
  it("generates exactly ten seconds of deterministic valid mono PCM WAV", () => {
    const bytes = createDemoEvidenceWav("record-one");
    const view = new DataView(bytes.buffer);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe("WAVE");
    expect(view.getUint32(40, true) / view.getUint32(28, true)).toBe(
      EVIDENCE_SECONDS,
    );
    expect(view.getUint16(22, true)).toBe(1);
    expect(createDemoEvidenceWav("record-one")).toEqual(bytes);
    expect(createDemoEvidenceWav("record-two")).not.toEqual(bytes);
  });
});
