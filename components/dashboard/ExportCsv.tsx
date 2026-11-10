"use client";

import { useState } from "react";

import { csvFilename, downloadCsv, toCsv, type CsvValue } from "@/lib/export/csv";
import { cx } from "@/lib/safe";

export type ExportSheet = {
  /** Becomes the file name, e.g. "catalogue". */
  subject: string;
  headers: string[];
  rows: CsvValue[][];
};

/**
 * "Export CSV" for any table on any dashboard.
 *
 * Rights holders are audited by people who work in spreadsheets: UPRS cue
 * sheets, label accountants, advertisers checking proof-of-play. The file is
 * built in the browser from data the account can already see, so row-level
 * security decides what leaves — there is no export endpoint to leak from.
 */
export function ExportCsv({ sheets, label = "Export CSV", disabled }: { sheets: ExportSheet[]; label?: string; disabled?: boolean }) {
  const [note, setNote] = useState("");

  const onClick = () => {
    const usable = sheets.filter((s) => s.rows.length > 0);
    if (usable.length === 0) {
      setNote("Nothing to export yet");
      return;
    }
    // One sheet → one file. Several → one file per sheet, named after it.
    for (const sheet of usable) {
      downloadCsv(csvFilename(sheet.subject), toCsv(sheet.headers, sheet.rows));
    }
    const total = usable.reduce((n, s) => n + s.rows.length, 0);
    setNote(`Exported ${total} row${total === 1 ? "" : "s"}`);
    setTimeout(() => setNote(""), 4000);
  };

  const empty = sheets.every((s) => s.rows.length === 0);

  return (
    <span className="inline-flex items-center gap-2">
      {note && <span className="text-xs text-emerald-400">{note}</span>}
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || empty}
        className={cx("btn-ghost !py-1.5 !text-xs", (disabled || empty) && "cursor-not-allowed opacity-40")}
        title={empty ? "No rows to export yet" : "Download as a spreadsheet"}
      >
        {label}
      </button>
    </span>
  );
}
