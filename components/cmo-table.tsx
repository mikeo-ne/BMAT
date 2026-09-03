"use client";

import { useMemo, useState } from "react";

import { formatCurrency, formatNumber, formatPeriod } from "@/lib/format";
import { TARIFF, type PlayRow } from "@/lib/uprs";

type SortKey =
  | "memberId"
  | "artist"
  | "station"
  | "region"
  | "period"
  | "plays"
  | "ugxPerPlay"
  | "allocationUgx";

type SortDir = "asc" | "desc";

const PAGE_SIZES = [25, 50, 100] as const;

const COLUMNS: { key: SortKey | null; label: string; align?: "right"; width?: string }[] = [
  { key: "memberId", label: "Member ID" },
  { key: "artist", label: "Artist / rights holder" },
  { key: null, label: "Recording" },
  { key: "station", label: "Station" },
  { key: "region", label: "Region" },
  { key: "period", label: "Period" },
  { key: "plays", label: "Plays", align: "right" },
  { key: null, label: "Share" },
  { key: "ugxPerPlay", label: "Rate (UGX)", align: "right" },
  { key: "allocationUgx", label: "Allocation (UGX)", align: "right" },
];

interface CmoTableProps {
  rows: PlayRow[];
}

export function CmoTable({ rows }: CmoTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("allocationUgx");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [pageSize, setPageSize] = useState<number>(25);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const valueOf = (row: PlayRow): string | number => {
      switch (sortKey) {
        case "memberId":
          return row.memberId;
        case "artist":
          return row.artist.toLowerCase();
        case "station":
          return row.station.toLowerCase();
        case "region":
          return row.region;
        case "period":
          return row.period;
        case "plays":
          return row.plays;
        case "ugxPerPlay":
          return row.ugxPerPlay;
        default:
          return row.allocationUgx;
      }
    };

    return [...rows].sort((a, b) => {
      const av = valueOf(a);
      const bv = valueOf(b);
      const cmp =
        typeof av === "string" && typeof bv === "string" ? av.localeCompare(bv) : Number(av) - Number(bv);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));

  // Derived rather than corrected in an effect: a narrowed result set simply
  // clamps the window instead of triggering a second render.
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * pageSize;
  const visible = sorted.slice(start, start + pageSize);

  const totals = useMemo(
    () => ({
      plays: sorted.reduce((s, r) => s + r.plays, 0),
      ugx: sorted.reduce((s, r) => s + r.allocationUgx, 0),
    }),
    [sorted],
  );

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "plays" || key === "allocationUgx" || key === "ugxPerPlay" ? "desc" : "asc");
    }
  };

  return (
    <section className="panel overflow-hidden" aria-labelledby="ledger-heading">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
        <div>
          <h2 id="ledger-heading" className="text-sm font-semibold tracking-tight">
            Radio play ledger
          </h2>
          <p className="text-xs text-muted">
            <span className="tabular-nums text-foreground">{formatNumber(sorted.length)}</span>{" "}
            aggregated member × station × period rows ·{" "}
            <span className="tabular-nums text-foreground">{formatNumber(totals.plays)}</span> plays ·{" "}
            <span className="tabular-nums text-foreground">
              UGX {formatCurrency(totals.ugx)}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-[11px] text-muted" htmlFor="cmo-page-size">
            Rows
          </label>
          <select
            id="cmo-page-size"
            className="field !w-auto !py-1 !text-xs"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(0);
            }}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
      </header>

      {sorted.length === 0 ? (
        <div className="px-5 py-16 text-center">
          <p className="text-sm font-medium">No ledger rows match these filters</p>
          <p className="mt-1 text-xs text-muted">
            Widen the station, region, period or member selection.
          </p>
        </div>
      ) : (
        <>
          <div className="max-h-[620px] overflow-auto">
            <table className="w-full min-w-[1180px] border-collapse text-left text-[13px]">
              <caption className="sr-only">
                UPRS aggregated radio play data by member, station and reporting period
              </caption>
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-line bg-surface-2 text-[11px] uppercase tracking-wider text-muted">
                  {COLUMNS.map((col) => (
                    <th
                      key={col.label}
                      scope="col"
                      className={[
                        "whitespace-nowrap px-3 py-2.5 font-medium first:pl-5 last:pr-5",
                        col.align === "right" ? "text-right" : "",
                      ].join(" ")}
                      aria-sort={
                        col.key && sortKey === col.key
                          ? sortDir === "asc"
                            ? "ascending"
                            : "descending"
                          : undefined
                      }
                    >
                      {col.key ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(col.key as SortKey)}
                          className="inline-flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-foreground"
                        >
                          {col.label}
                          <span
                            aria-hidden
                            className={sortKey === col.key ? "text-brand" : "opacity-30"}
                          >
                            {sortKey === col.key && sortDir === "asc" ? "▲" : "▼"}
                          </span>
                        </button>
                      ) : (
                        col.label
                      )}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {visible.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-line/50 transition-colors last:border-0 hover:bg-surface-2/50"
                  >
                    <td className="whitespace-nowrap px-3 py-2 pl-5 font-mono text-xs text-muted">
                      {row.memberId}
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-2 font-medium">{row.artist}</td>
                    <td className="max-w-[220px] px-3 py-2">
                      <span className="block truncate">{row.title}</span>
                      <span className="block truncate font-mono text-[10px] text-muted">
                        {row.isrc}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="block whitespace-nowrap">{row.station}</span>
                      <span className="block text-[10px] text-muted">
                        {TARIFF[row.tier].label}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted">{row.region}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted tabular-nums">
                      {formatPeriod(row.period)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.plays)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-muted tabular-nums">
                      {(row.share * 100).toFixed(0)}%
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-muted tabular-nums">
                      {formatNumber(row.ugxPerPlay)}
                    </td>
                    <td className="px-3 py-2 pr-5 text-right font-medium tabular-nums">
                      {formatCurrency(row.allocationUgx)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-2/60 px-4 py-2.5 text-xs sm:px-5">
            <p className="text-muted tabular-nums">
              Showing {formatNumber(start + 1)}–{formatNumber(Math.min(sorted.length, start + pageSize))}{" "}
              of {formatNumber(sorted.length)} rows
            </p>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="btn btn-ghost !px-2 !py-1 text-[11px]"
                onClick={() => setPage(Math.max(0, safePage - 1))}
                disabled={safePage === 0}
              >
                ← Prev
              </button>
              <span className="px-1 font-mono text-[11px] text-muted tabular-nums">
                {safePage + 1} / {pageCount}
              </span>
              <button
                type="button"
                className="btn btn-ghost !px-2 !py-1 text-[11px]"
                onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
                disabled={safePage >= pageCount - 1}
              >
                Next →
              </button>
            </div>
          </footer>
        </>
      )}
    </section>
  );
}
