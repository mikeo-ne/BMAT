import { describe, expect, it } from "vitest";

import {
  CUE_SHEET_HEADER,
  cueSheetFilename,
  cueSheetRows,
  cueSheetSummary,
  durationLabel,
  hhmm,
  musicWorks,
  type CueSegment,
} from "@/lib/cue-sheet";

const seg = (over: Partial<CueSegment> = {}): CueSegment => ({
  start: 360,
  end: 363,
  kind: "music",
  label: "Kampala Nights — Nalu Akello",
  composer: "N. Akello",
  publisher: "Pearl Sound Publishing",
  isrc: "UG-PSR-26-00011",
  ...over,
});

describe("hhmm", () => {
  it.each([
    [0, "00:00"],
    [1, "00:01"],
    [59, "00:59"],
    [60, "01:00"],
    [61, "01:01"],
    [719, "11:59"],
    [720, "12:00"],
    [1439, "23:59"],
    [1440, "24:00"],
  ])("renders %i minutes as %s", (minutes, expected) => {
    expect(hhmm(minutes)).toBe(expected);
  });

  it("floors fractional minutes", () => {
    expect(hhmm(90.9)).toBe("01:30");
  });

  it("never renders NaN for junk input", () => {
    for (const junk of [NaN, undefined, null, "abc", Infinity])
      expect(hhmm(junk as never)).toMatch(/^\d{2}:\d{2}$/);
  });

  it("clamps negatives to midnight", () => {
    expect(hhmm(-5)).toBe("00:00");
  });
});

describe("durationLabel", () => {
  it("labels whole-minute durations", () => {
    expect(durationLabel({ start: 360, end: 363 })).toBe("3:00");
    expect(durationLabel({ start: 0, end: 11 })).toBe("11:00");
  });

  it("never reports a negative duration", () => {
    expect(durationLabel({ start: 100, end: 90 })).toBe("0:00");
  });
});

describe("musicWorks", () => {
  it("keeps only matched music", () => {
    const works = musicWorks([
      seg({ kind: "music", start: 10 }),
      seg({ kind: "ad", start: 20 }),
      seg({ kind: "talk", start: 30 }),
    ]);
    expect(works).toHaveLength(1);
    expect(works[0].start).toBe(10);
  });

  it("orders by playout time even when the log arrives unsorted", () => {
    const works = musicWorks([
      seg({ start: 600, label: "later" }),
      seg({ start: 60, label: "earlier" }),
      seg({ start: 300, label: "middle" }),
    ]);
    expect(works.map((w) => w.label)).toEqual(["earlier", "middle", "later"]);
  });

  it("does not mutate the caller's array", () => {
    const input = [seg({ start: 600 }), seg({ start: 60 })];
    const snapshot = input.map((s) => s.start);
    musicWorks(input);
    expect(input.map((s) => s.start)).toEqual(snapshot);
  });

  it("survives null, undefined and junk", () => {
    expect(musicWorks(null)).toEqual([]);
    expect(musicWorks(undefined)).toEqual([]);
    expect(musicWorks([] as CueSegment[])).toEqual([]);
  });

  it("preserves extra fields such as evidence paths", () => {
    const withEvidence = { ...seg(), evidencePath: "/evidence/clip.flac" };
    const [work] = musicWorks([withEvidence]);
    expect(work.evidencePath).toBe("/evidence/clip.flac");
  });
});

describe("cueSheetRows", () => {
  it("emits the documented seven-column matrix", () => {
    expect(CUE_SHEET_HEADER).toHaveLength(7);
    const [row] = cueSheetRows([seg()]);
    expect(row).toHaveLength(CUE_SHEET_HEADER.length);
    expect(row).toEqual([
      "1",
      "06:00",
      "3:00",
      "Kampala Nights — Nalu Akello",
      "N. Akello",
      "Pearl Sound Publishing",
      "UG-PSR-26-00011",
    ]);
  });

  it("numbers rows from 1 in playout order", () => {
    const rows = cueSheetRows([
      seg({ start: 600, label: "b" }),
      seg({ start: 60, label: "a" }),
    ]);
    expect(rows.map((r) => r[0])).toEqual(["1", "2"]);
    expect(rows.map((r) => r[3])).toEqual(["a", "b"]);
  });

  it("blanks unknown metadata rather than printing undefined", () => {
    const [row] = cueSheetRows([
      { start: 0, end: 5, kind: "music", label: "Untitled" },
    ]);
    expect(row).toEqual(["1", "00:00", "5:00", "Untitled", "", "", ""]);
    expect(row.join("|")).not.toContain("undefined");
  });

  it("excludes ads and talk entirely", () => {
    const rows = cueSheetRows([
      seg({ kind: "ad", label: "Telecom spot 30s" }),
      seg({ kind: "talk", label: "News bulletin" }),
      seg({ kind: "music", label: "Only work" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0][3]).toBe("Only work");
  });

  it("returns an empty sheet when nothing matched", () => {
    expect(cueSheetRows([])).toEqual([]);
    expect(cueSheetRows(null)).toEqual([]);
    expect(cueSheetRows(undefined)).toEqual([]);
  });

  it("produces only strings — exporters cannot receive numbers", () => {
    const rows = cueSheetRows([seg(), seg({ start: 400 })]);
    for (const row of rows) for (const cell of row) expect(typeof cell).toBe("string");
  });
});

describe("cueSheetSummary", () => {
  it("names the station, date and work count", () => {
    expect(cueSheetSummary("Capital FM", "2026-11-04", 12)).toBe(
      "Capital FM · 2026-11-04 · 12 music works",
    );
  });

  it("uses the singular for one work", () => {
    expect(cueSheetSummary("Capital FM", "2026-11-04", 1)).toContain("1 music work");
  });

  it("degrades gracefully without a station or date", () => {
    expect(cueSheetSummary(null, null, 0)).toBe("Station · — · 0 music works");
    expect(cueSheetSummary("  ", "", 3)).toContain("Station");
  });
});

describe("cueSheetFilename", () => {
  it("stamps the date and extension", () => {
    expect(cueSheetFilename("2026-11-04", "pdf")).toBe("UPRS-cue-sheet-2026-11-04.pdf");
    expect(cueSheetFilename("2026-11-04", "xlsx")).toBe("UPRS-cue-sheet-2026-11-04.xlsx");
  });

  it("strips anything that would escape the filename", () => {
    const name = cueSheetFilename("../../etc/passwd", "pdf");
    expect(name).not.toContain("/");
    expect(name).not.toContain("..");
    expect(name).not.toContain("etc");
    expect(name).toBe("UPRS-cue-sheet-undated.pdf");
  });

  it("keeps ordinary dates intact and never emits a separator", () => {
    const name = cueSheetFilename("2026-11-04", "xlsx");
    expect(name).toContain("2026-11-04");
    expect(name).not.toContain("/");
  });

  it("falls back to undated when the date is missing", () => {
    expect(cueSheetFilename(null, "pdf")).toBe("UPRS-cue-sheet-undated.pdf");
    expect(cueSheetFilename("", "xlsx")).toBe("UPRS-cue-sheet-undated.xlsx");
  });
});
