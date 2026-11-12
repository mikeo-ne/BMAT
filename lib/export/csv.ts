/**
 * CSV export.
 *
 * Every competitor in this space sells "data feeds" — Radiomonitor ships custom
 * feeds, CMOs live in spreadsheets, and a Ugandan label's accountant wants an
 * attachment, not a login. So any table we can show, we must be able to hand
 * over as a file that opens cleanly in Excel (UTF-8 BOM, CRLF, quoted cells).
 *
 * Pure functions for the building; one small browser helper for the download so
 * the same code works under jsdom in the tests.
 */

export type CsvValue = string | number | boolean | null | undefined;

const NEEDS_QUOTES = /[",\r\n]/;

/** RFC 4180 cell: quote when it contains a delimiter, quote or newline. */
export function csvEscape(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  // A typed cell starting with = + - @ (or tab/CR) runs as a formula in Excel and
  // Sheets. Exports leave the platform (distributors, accountants), so neutralise it.
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Header row plus data rows, CRLF line endings, trailing newline. */
export function toCsv(headers: string[], rows: CsvValue[][]): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) lines.push(row.map(csvEscape).join(","));
  return `${lines.join("\r\n")}\r\n`;
}

/** `east-sound-catalogue-2026-11-05.csv` — stable, sortable, no spaces. */
export function csvFilename(subject: string, now: Date = new Date()): string {
  const slug = subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const day = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  return `${slug || "east-sound"}-${day}.csv`;
}

/** Excel needs the BOM to read non-ASCII (é, ɗ, Luganda names) correctly. */
export const UTF8_BOM = "\uFEFF";

export function csvBlobParts(text: string): string {
  return `${UTF8_BOM}${text}`;
}

/** Triggers a download in the browser. A no-op during server rendering. */
export function downloadCsv(filename: string, text: string): boolean {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") return false;
  const blob = new Blob([csvBlobParts(text)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the click a tick to start before the URL is revoked.
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
}
