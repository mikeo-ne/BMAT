// UPRS cue sheet building, lifted out of BroadcasterDashboard so it can be
// tested without rendering. Everything here is pure: ids in, strings out.

import { safeArray, safeNumber } from "@/lib/safe";

export type CueSegment = {
  start: number;
  end: number;
  kind: string;
  label: string;
  composer?: string;
  publisher?: string;
  isrc?: string;
};

export const CUE_SHEET_HEADER = [
  "#",
  "Time (EAT)",
  "Duration",
  "Title — Artist",
  "Composer",
  "Publisher",
  "ISRC",
] as const;

/** Minutes after Kampala midnight as HH:MM. 1440 renders as 24:00. */
export function hhmm(minutes: number): string {
  const m = Math.max(0, Math.floor(safeNumber(minutes)));
  const h = String(Math.floor(m / 60)).padStart(2, "0");
  return `${h}:${String(m % 60).padStart(2, "0")}`;
}

/** Whole-minute duration label used in the Duration column ("3:00"). */
export function durationLabel(segment: Pick<CueSegment, "start" | "end">): string {
  const minutes = Math.max(0, Math.round(safeNumber(segment.end) - safeNumber(segment.start)));
  return `${minutes}:00`;
}

/**
 * Only matched music belongs on a UPRS sheet — ads and talk never do.
 * Generic so callers keep their own segment type (e.g. evidence paths).
 */
export function musicWorks<T extends { kind: string; start: number }>(
  segments: readonly T[] | null | undefined,
): T[] {
  return safeArray(segments)
    .filter((s) => s && s.kind === "music")
    .slice()
    .sort((a, b) => safeNumber(a.start) - safeNumber(b.start));
}

/**
 * The exact matrix the PDF and XLSX exporters write.
 * One row per matched work, numbered from 1 in playout order.
 */
export function cueSheetRows(
  segments: readonly CueSegment[] | null | undefined,
): string[][] {
  return musicWorks(segments).map((s, i) => [
    String(i + 1),
    hhmm(s.start),
    durationLabel(s),
    s.label ?? "",
    s.composer ?? "",
    s.publisher ?? "",
    s.isrc ?? "",
  ]);
}

/** "Station · date · N music works" — the subtitle both exporters print. */
export function cueSheetSummary(
  stationName: string | null | undefined,
  date: string | null | undefined,
  count: number,
): string {
  const works = Math.max(0, Math.floor(safeNumber(count)));
  return `${stationName?.trim() || "Station"} · ${date || "—"} · ${works} music work${works === 1 ? "" : "s"}`;
}

/** Filename stem shared by the PDF and XLSX exports. */
export function cueSheetFilename(date: string | null | undefined, ext: "pdf" | "xlsx"): string {
  const stamp = (date || "").replace(/[^0-9-]/g, "") || "undated";
  return `UPRS-cue-sheet-${stamp}.${ext}`;
}
