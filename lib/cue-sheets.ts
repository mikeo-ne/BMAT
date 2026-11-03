import { timeBandForHour, type TimeBand, type WeightingPolicy } from "@/lib/dayparts";
import { eatHour, formatCurrency, formatDuration, formatEatClock } from "@/lib/format";
import type { BroadcastSpin } from "@/lib/playout";
import { buildXlsx, type XlsxRow } from "@/lib/xlsx-writer";

/**
 * Reportal — automated UPRS broadcast cue sheet generator.
 *
 * Builds a station-level broadcast cue sheet from captured playout events:
 * a per-play detail ledger with EAT timestamps and daypart bands, an
 * aggregation by recording, and daypart-weighted totals. Output formats are
 * Excel-compatible CSV, a real `.xlsx` workbook and a PDF document, all
 * generated client-side so the station manager never leaves the log.
 *
 * The tariff below is an explicitly labelled placeholder. These documents are
 * internal compliance exports, not certified UPRS filings, and unmatched
 * audio is listed with a blank ISRC rather than invented identifiers.
 */

export const CUE_SHEET_TARIFF_NOTE =
  "Illustrative placeholder tariff — replace with the current UPRS schedule before any external filing.";
export const CUE_SHEET_UNMATCHED_LABEL = "Unidentified broadcast audio";

export const CUE_SHEET_TARIFF_UGX_PER_PLAY = 250;

export interface CueSheetOptions {
  stationId: string;
  stationName: string;
  /** Licensee / broadcaster name printed on the report. */
  licensee: string;
  frequency?: string;
  medium?: "FM" | "TV";
  generatedAt: Date | string;
  periodStart: Date | string;
  periodEnd: Date | string;
  policy: WeightingPolicy;
}

export interface CueSheetDetailRow {
  playIndex: number;
  detectedAt: string;
  eatClock: string;
  day: string;
  timeBand: TimeBand;
  multiplier: number;
  title: string;
  artist: string;
  isrc: string;
  durationSec: number;
  confidence: number;
  source: string;
}

export interface CueSheetTrackRow {
  title: string;
  artist: string;
  isrc: string;
  plays: number;
  bandPlays: Record<TimeBand, number>;
  weightedPlays: number;
  share: number;
}

export interface CueSheet {
  options: CueSheetOptions;
  detail: CueSheetDetailRow[];
  byTrack: CueSheetTrackRow[];
  totals: {
    plays: number;
    weightedPlays: number;
    recordings: number;
    bandPlays: Record<TimeBand, number>;
    indicativePoolUgx: number;
  };
}

const isrcOf = (spin: BroadcastSpin) =>
  spin.isrc && spin.isrc.trim() ? spin.isrc.trim() : "";

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

function daypartCounts(
  rows: CueSheetDetailRow[],
): Record<TimeBand, number> {
  return {
    prime: rows.filter((row) => row.timeBand === "prime").length,
    standard: rows.filter((row) => row.timeBand === "standard").length,
    night: rows.filter((row) => row.timeBand === "night").length,
  };
}

/**
 * Builds the cue sheet for one station and reporting period. Only captured
 * events within the window are included; demo/simulated rows never reach this
 * builder because the workspace data is capture-backed.
 */
export function buildCueSheet(
  events: BroadcastSpin[],
  options: CueSheetOptions,
): CueSheet {
  const start = toIso(options.periodStart);
  const end = toIso(options.periodEnd);
  const detail: CueSheetDetailRow[] = events
    .filter(
      (event) =>
        event.stationId === options.stationId &&
        event.detectedAt >= start &&
        event.detectedAt < end,
    )
    .sort((a, b) => a.detectedAt.localeCompare(b.detectedAt))
    .map((event, playIndex) => {
      const hour = eatHour(event.detectedAt);
      const band = timeBandForHour(hour);
      return {
        playIndex: playIndex + 1,
        detectedAt: event.detectedAt,
        eatClock: formatEatClock(event.detectedAt),
        day: dayOf(event.detectedAt),
        timeBand: band,
        multiplier: options.policy[band],
        title: event.title ?? CUE_SHEET_UNMATCHED_LABEL,
        artist: event.primaryArtist ?? "—",
        isrc: isrcOf(event),
        durationSec: event.durationSec,
        confidence: event.confidence,
        source: event.source,
      };
    });

  const groups = new Map<string, CueSheetTrackRow>();
  for (const row of detail) {
    const key = `${row.isrc || "unidentified"}|${row.title}|${row.artist}`;
    const existing = groups.get(key);
    if (existing) {
      existing.plays += 1;
      existing.bandPlays[row.timeBand] += 1;
      existing.weightedPlays += row.multiplier;
    } else {
      const bandPlays: Record<TimeBand, number> = {
        prime: 0,
        standard: 0,
        night: 0,
      };
      bandPlays[row.timeBand] = 1;
      groups.set(key, {
        title: row.title,
        artist: row.artist,
        isrc: row.isrc,
        plays: 1,
        bandPlays,
        weightedPlays: row.multiplier,
        share: 0,
      });
    }
  }
  const byTrack = [...groups.values()].sort(
    (a, b) => b.plays - a.plays || a.title.localeCompare(b.title),
  );
  const totals = {
    plays: detail.length,
    weightedPlays: Number(
      byTrack.reduce((sum, row) => sum + row.weightedPlays, 0).toFixed(2),
    ),
    recordings: byTrack.length,
    bandPlays: daypartCounts(detail),
    indicativePoolUgx: Math.round(
      detail.reduce((sum, row) => sum + row.multiplier, 0) *
        CUE_SHEET_TARIFF_UGX_PER_PLAY,
    ),
  };
  for (const row of byTrack) row.share = totals.plays ? row.plays / totals.plays : 0;
  return { options, detail, byTrack, totals };
}

const BAND_LABELS: Record<TimeBand, string> = {
  prime: "Prime time",
  standard: "Standard",
  night: "Night time",
};

function headerRows(sheet: CueSheet): XlsxRow[] {
  const { options, totals } = sheet;
  return [
    ["UPRS BROADCAST CUE SHEET"],
    ["Station", options.stationName],
    ["Frequency", options.frequency ?? options.medium ?? ""],
    ["Licensee / broadcaster", options.licensee],
    ["Reporting period", `${dayOf(toIso(options.periodStart))} → ${dayOf(toIso(options.periodEnd))} (EAT)`],
    ["Generated", toIso(options.generatedAt)],
    ["Daypart weighting", `Prime ×${options.policy.prime} · Standard ×${options.policy.standard} · Night ×${options.policy.night}`],
    ["Total plays", totals.plays],
    ["Recordings", totals.recordings],
    ["Daypart split", `Prime ${totals.bandPlays.prime} · Standard ${totals.bandPlays.standard} · Night ${totals.bandPlays.night}`],
    ["Weighted plays", totals.weightedPlays],
    [
      "Indicative royalty estimate (UGX)",
      `${formatCurrency(totals.indicativePoolUgx)} — ${CUE_SHEET_TARIFF_NOTE}`,
    ],
    [],
  ];
}

const DETAIL_HEADER = [
  "#",
  "Date",
  "EAT time",
  "Daypart",
  "Multiplier",
  "Track",
  "Artist",
  "ISRC",
  "Duration",
  "Match confidence",
  "Source",
];

function detailRows(sheet: CueSheet): XlsxRow[] {
  return [
    DETAIL_HEADER,
    ...sheet.detail.map((row) => [
      row.playIndex,
      row.day,
      row.eatClock,
      BAND_LABELS[row.timeBand],
      row.multiplier,
      row.title,
      row.artist,
      row.isrc,
      formatDuration(row.durationSec),
      `${(row.confidence * 100).toFixed(1)}%`,
      row.source,
    ]),
  ];
}

function summaryRows(sheet: CueSheet): XlsxRow[] {
  const { totals } = sheet;
  return [
    [],
    ["SUMMARY BY RECORDING"],
    ["Track", "Artist", "ISRC", "Plays", "Prime", "Standard", "Night", "Weighted plays", "Share"],
    ...sheet.byTrack.map((row) => [
      row.title,
      row.artist,
      row.isrc,
      row.plays,
      row.bandPlays.prime,
      row.bandPlays.standard,
      row.bandPlays.night,
      row.weightedPlays,
      row.share.toFixed(3),
    ]),
    [],
    ["TOTALS"],
    ["Plays", totals.plays],
    ["Recordings", totals.recordings],
    ["Weighted plays", totals.weightedPlays],
    ["Indicative royalty estimate (UGX)", formatCurrency(totals.indicativePoolUgx)],
    [],
    [CUE_SHEET_TARIFF_NOTE],
    ["Generated by East Sound Reportal. Internal compliance export — not a certified UPRS filing."],
  ];
}

function cueSheetRows(sheet: CueSheet): XlsxRow[] {
  return [
    ...headerRows(sheet),
    ...detailRows(sheet),
    ...summaryRows(sheet),
  ];
}

function csvCell(value: string | number | null | undefined): string {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Excel-compatible CSV (BOM added by the download helper at the UI layer). */
export function cueSheetToCsv(sheet: CueSheet): string {
  return cueSheetRows(sheet)
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}

/** Real `.xlsx` workbook bytes. */
export function cueSheetToXlsx(sheet: CueSheet): Uint8Array {
  return buildXlsx("UPRS cue sheet", cueSheetRows(sheet));
}

/* -------------------------------------------------------------------------- */
/* PDF                                                                          */
/* -------------------------------------------------------------------------- */

const PAGE = { width: 612, height: 792, margin: 42 };
const COLUMNS: Array<{ key: string; label: string; width: number }> = [
  { key: "playIndex", label: "#", width: 26 },
  { key: "day", label: "Date", width: 60 },
  { key: "eatClock", label: "EAT", width: 52 },
  { key: "timeBand", label: "Daypart", width: 68 },
  { key: "title", label: "Track", width: 150 },
  { key: "artist", label: "Artist", width: 110 },
  { key: "isrc", label: "ISRC", width: 80 },
  { key: "duration", label: "Dur", width: 40 },
];

function truncate(
  text: string,
  font: { widthOfTextAtSize(text: string, size: number): number },
  size: number,
  maxWidth: number,
): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let shortened = text;
  while (shortened.length > 1 && font.widthOfTextAtSize(`${shortened}…`, size) > maxWidth)
    shortened = shortened.slice(0, -1);
  return `${shortened}…`;
}

/** Renders the cue sheet as a PDF document (pdf-lib, client or server side). */
export async function cueSheetToPdf(sheet: CueSheet): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.12, 0.16);
  const muted = rgb(0.45, 0.48, 0.55);
  const brand = rgb(0.16, 0.52, 0.45);

  let page = doc.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - PAGE.margin;

  function ensure(space: number) {
    if (y - space >= PAGE.margin) return;
    page = doc.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - PAGE.margin;
  }
  // The standard 14 PDF fonts use WinAnsi; keep generated text inside it.
  function winAnsi(text: string): string {
    return text.replace(/→/g, "to").replace(/[^\x00-\xff]/g, "?");
  }
  function text(
    value: string,
    x: number,
    yPos: number,
    opts: { size?: number; font?: "regular" | "bold"; color?: "ink" | "muted" | "brand" },
  ) {
    const fontObj = opts.font === "bold" ? bold : font;
    page.drawText(winAnsi(value), {
      x,
      y: yPos,
      size: opts.size ?? 9,
      font: fontObj,
      color:
        opts.color === "brand"
          ? brand
          : opts.color === "muted"
            ? muted
            : ink,
    });
  }
  function rule() {
    page.drawLine({
      start: { x: PAGE.margin, y },
      end: { x: PAGE.width - PAGE.margin, y },
      thickness: 0.6,
      color: muted,
    });
    y -= 12;
  }

  text("UPRS BROADCAST CUE SHEET", PAGE.margin, y, { size: 15, font: "bold", color: "brand" });
  y -= 16;
  text("East Sound Reportal · automated station compliance export", PAGE.margin, y, {
    size: 8.5,
    color: "muted",
  });
  y -= 12;
  rule();

  const { options, totals } = sheet;
  const info: Array<[string, string]> = [
    ["Station", options.stationName],
    ["Frequency / medium", `${options.frequency ?? ""} ${options.medium ?? ""}`.trim() || "—"],
    ["Licensee / broadcaster", options.licensee],
    ["Reporting period", `${dayOf(toIso(options.periodStart))} → ${dayOf(toIso(options.periodEnd))} (EAT)`],
    ["Generated", new Date(toIso(options.generatedAt)).toUTCString()],
    [
      "Daypart weighting",
      `Prime ×${options.policy.prime} · Standard ×${options.policy.standard} · Night ×${options.policy.night}`,
    ],
  ];
  for (const [label, value] of info) {
    text(label, PAGE.margin, y, { size: 8.5, color: "muted" });
    text(value, PAGE.margin + 165, y, { size: 8.5, font: "bold" });
    y -= 13;
  }
  y -= 4;
  rule();

  text(
    `Plays ${totals.plays} · Recordings ${totals.recordings} · Weighted ${totals.weightedPlays}`,
    PAGE.margin,
    y,
    { size: 8.5, font: "bold" },
  );
  y -= 13;

  // Detail ledger.
  y -= 4;
  const columnX = [
    PAGE.margin,
    PAGE.margin + COLUMNS[0].width,
    PAGE.margin + COLUMNS[0].width + COLUMNS[1].width,
    PAGE.margin + COLUMNS[0].width + COLUMNS[1].width + COLUMNS[2].width,
    PAGE.margin +
      COLUMNS[0].width +
      COLUMNS[1].width +
      COLUMNS[2].width +
      COLUMNS[3].width,
    PAGE.margin +
      COLUMNS[0].width +
      COLUMNS[1].width +
      COLUMNS[2].width +
      COLUMNS[3].width +
      COLUMNS[4].width,
    PAGE.margin +
      COLUMNS[0].width +
      COLUMNS[1].width +
      COLUMNS[2].width +
      COLUMNS[3].width +
      COLUMNS[4].width +
      COLUMNS[5].width,
    PAGE.margin +
      COLUMNS[0].width +
      COLUMNS[1].width +
      COLUMNS[2].width +
      COLUMNS[3].width +
      COLUMNS[4].width +
      COLUMNS[5].width +
      COLUMNS[6].width,
  ];
  for (const column of COLUMNS)
    text(column.label, columnX[COLUMNS.indexOf(column)], y, {
      size: 7.5,
      font: "bold",
      color: "muted",
    });
  y -= 8;
  rule();

  const detailValues = (row: CueSheetDetailRow) => [
    String(row.playIndex),
    row.day,
    row.eatClock,
    BAND_LABELS[row.timeBand],
    row.title,
    row.artist,
    row.isrc || "—",
    formatDuration(row.durationSec),
  ];
  for (const row of sheet.detail) {
    ensure(24);
    const values = detailValues(row);
    values.forEach((value, index) => {
      const column = COLUMNS[index];
      const cell =
        index === 4
          ? truncate(value, font, 7, column.width - 4)
          : index === 5
            ? truncate(value, font, 7, column.width - 4)
            : value;
      text(cell, columnX[index] + 2, y, { size: 7 });
    });
    y -= 13;
  }

  ensure(90);
  y -= 6;
  rule();
  text("TOTALS", PAGE.margin, y, { size: 9, font: "bold", color: "brand" });
  y -= 13;
  text(
    `Plays ${totals.plays} · Prime ${totals.bandPlays.prime} · Standard ${totals.bandPlays.standard} · Night ${totals.bandPlays.night}`,
    PAGE.margin,
    y,
    { size: 8.5 },
  );
  y -= 13;
  text(
    `Indicative royalty estimate: UGX ${formatCurrency(totals.indicativePoolUgx)} (${CUE_SHEET_TARIFF_NOTE})`,
    PAGE.margin,
    y,
    { size: 8.5, color: "muted" },
  );
  y -= 40;
  text("Licensee signature", PAGE.margin, y, { size: 8, color: "muted" });
  page.drawLine({
    start: { x: PAGE.margin, y: y - 6 },
    end: { x: PAGE.margin + 220, y: y - 6 },
    thickness: 0.7,
    color: ink,
  });
  text("UPRS receipt (for office use)", PAGE.margin + 280, y, { size: 8, color: "muted" });
  page.drawLine({
    start: { x: PAGE.margin + 280, y: y - 6 },
    end: { x: PAGE.margin + 500, y: y - 6 },
    thickness: 0.7,
    color: ink,
  });
  y -= 34;
  text(
    "Generated by East Sound Reportal from authenticated captured playout records. Internal compliance export — not a certified UPRS filing. Unidentified audio is listed with a blank ISRC and is never matched or relabelled.",
    PAGE.margin,
    y,
    { size: 7.5, color: "muted" },
  );

  return doc.save();
}
