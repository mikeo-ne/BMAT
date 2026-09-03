"use client";

import { useMemo, useState } from "react";

import { RegionSplit } from "@/components/region-split";
import { Sparkline } from "@/components/sparkline";
import { formatCompact, formatDate, formatNumber, formatPercent, initials } from "@/lib/format";
import { REGION_META, REGIONS, type Region } from "@/lib/regions";
import { dominantRegion, spinsFor, stationsFor, trendFor, type Track } from "@/lib/types";

type SortKey = "title" | "releaseDate" | "totalSpins" | "stations";
type SortDir = "asc" | "desc";

interface CatalogTableProps {
  tracks: Track[];
  focusRegion: Region | "All";
  onFocusRegion: (region: Region | "All") => void;
  onDelete: (id: string) => void;
  pendingDeleteId: string | null;
}

const COLUMNS: { key: SortKey | null; label: string; className?: string; align?: "right" }[] = [
  { key: "title", label: "Track" },
  { key: null, label: "ISRC" },
  { key: "releaseDate", label: "Released" },
  { key: null, label: "Master" },
  { key: "stations", label: "Stations", align: "right" },
  { key: "totalSpins", label: "Total spins", align: "right" },
  { key: null, label: "14-day trend" },
  { key: null, label: "Airplay by region" },
  { key: null, label: "", align: "right" },
];

export function CatalogTable({
  tracks,
  focusRegion,
  onFocusRegion,
  onDelete,
  pendingDeleteId,
}: CatalogTableProps) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("totalSpins");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const filtered = tracks.filter((track) => {
      if (!needle) return true;
      const haystack = [
        track.title,
        track.primaryArtist,
        track.isrc,
        ...track.featuredArtists,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });

    const valueOf = (track: Track): string | number => {
      if (sortKey === "totalSpins") return spinsFor(track, focusRegion);
      if (sortKey === "stations") return stationsFor(track, focusRegion);
      if (sortKey === "releaseDate") return track.releaseDate;
      return track.title.toLowerCase();
    };

    return [...filtered].sort((a, b) => {
      const av = valueOf(a);
      const bv = valueOf(b);
      const cmp =
        typeof av === "string" && typeof bv === "string"
          ? av.localeCompare(bv)
          : Number(av) - Number(bv);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [tracks, query, sortKey, sortDir, focusRegion]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "title" ? "asc" : "desc");
    }
  };

  const total = rows.reduce((sum, t) => sum + spinsFor(t, focusRegion), 0);
  const stationTotal = rows.reduce((sum, t) => sum + stationsFor(t, focusRegion), 0);

  return (
    <section className="panel overflow-hidden" aria-labelledby="catalog-heading">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
        <div>
          <h2 id="catalog-heading" className="text-sm font-semibold tracking-tight">
            Active catalogue
          </h2>
          <p className="text-xs text-muted">
            {rows.length} of {tracks.length} tracks ·{" "}
            <span className="tabular-nums text-foreground">{formatNumber(total)}</span> spins
            {focusRegion !== "All" ? ` in ${focusRegion}` : " nationwide"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
            >
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7" />
              <path d="M20 20l-3.2-3.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            <input
              className="field w-52 pl-8"
              placeholder="Search title, artist, ISRC…"
              value={query}
              aria-label="Search the catalogue"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-line bg-surface-2 p-0.5">
            <button
              type="button"
              onClick={() => onFocusRegion("All")}
              className={[
                "rounded px-2 py-1 text-[11px] transition-colors",
                focusRegion === "All" ? "bg-brand text-brand-ink" : "text-muted hover:text-foreground",
              ].join(" ")}
              aria-pressed={focusRegion === "All"}
            >
              All regions
            </button>
            {REGIONS.map((region) => (
              <button
                key={region}
                type="button"
                onClick={() => onFocusRegion(focusRegion === region ? "All" : region)}
                className={[
                  "rounded px-2 py-1 text-[11px] transition-colors",
                  focusRegion === region ? "text-brand-ink" : "text-muted hover:text-foreground",
                ].join(" ")}
                style={focusRegion === region ? { background: REGION_META[region].accent } : undefined}
                aria-pressed={focusRegion === region}
              >
                {region}
              </button>
            ))}
          </div>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="px-5 py-16 text-center">
          <p className="text-sm font-medium">Nothing to show yet</p>
          <p className="mt-1 text-xs text-muted">
            {tracks.length === 0
              ? "Drop an MP3 or WAV above to deliver your first master."
              : "No track matches that search."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <caption className="sr-only">
              Uploaded tracks with total spins across Uganda FM stations and regional airplay split
            </caption>
            <thead>
              <tr className="border-b border-line bg-surface-2/60 text-[11px] uppercase tracking-wider text-muted">
                {COLUMNS.map((col) => (
                  <th
                    key={col.label || "actions"}
                    scope="col"
                    className={[
                      "px-3 py-2.5 font-medium first:pl-5 last:pr-5",
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
                        <span aria-hidden className={sortKey === col.key ? "text-brand" : "opacity-30"}>
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
              {rows.map((track) => {
                const spins = spinsFor(track, focusRegion);
                const stations = stationsFor(track, focusRegion);
                const trend = trendFor(track, focusRegion);
                const accent = REGION_META[dominantRegion(track)].accent;
                const wow = (() => {
                  const recent = trend.slice(-7).reduce((a, b) => a + b, 0);
                  const prior = trend.slice(-14, -7).reduce((a, b) => a + b, 0);
                  return prior === 0 ? null : (recent - prior) / prior;
                })();

                return (
                  <tr
                    key={track.id}
                    className="border-b border-line/60 align-middle transition-colors last:border-0 hover:bg-surface-2/50"
                  >
                    <td className="px-3 py-3 pl-5">
                      <div className="flex items-center gap-3">
                        <span
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-[11px] font-bold"
                          style={{
                            background: `color-mix(in srgb, ${accent} 22%, var(--surface-2))`,
                            color: accent,
                          }}
                          aria-hidden
                        >
                          {initials(track.title)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{track.title}</span>
                          <span className="block truncate text-xs text-muted">
                            {track.primaryArtist}
                            {track.featuredArtists.length > 0 &&
                              ` · ft. ${track.featuredArtists.join(", ")}`}
                          </span>
                        </span>
                      </div>
                    </td>

                    <td className="px-3 py-3 font-mono text-xs text-muted">{track.isrc}</td>
                    <td className="px-3 py-3 text-xs tabular-nums text-muted">
                      {formatDate(track.releaseDate)}
                    </td>

                    <td className="px-3 py-3">
                      <span className="chip font-mono">{track.audio.format}</span>
                    </td>

                    <td className="px-3 py-3 text-right tabular-nums">{stations}</td>

                    <td className="px-3 py-3 text-right">
                      <span className="block font-semibold tabular-nums">{formatNumber(spins)}</span>
                      <span
                        className={[
                          "block text-[11px] tabular-nums",
                          wow === null
                            ? "text-muted"
                            : wow >= 0
                              ? "text-accent"
                              : "text-red-300",
                        ].join(" ")}
                      >
                        {wow === null ? "new this week" : `${formatPercent(wow, 0)} w/w`}
                      </span>
                    </td>

                    <td className="px-3 py-3">
                      <Sparkline
                        values={trend}
                        stroke={focusRegion === "All" ? "var(--brand)" : REGION_META[focusRegion].accent}
                        label={`${track.title} spins over 14 days`}
                      />
                    </td>

                    <td className="px-3 py-3 pr-2">
                      <div className="w-40">
                        <RegionSplit airplay={track.airplay} focus={focusRegion} />
                      </div>
                    </td>

                    <td className="px-3 py-3 pr-5 text-right">
                      <button
                        type="button"
                        className="btn btn-ghost !px-2 !py-1 text-[11px]"
                        onClick={() => onDelete(track.id)}
                        disabled={pendingDeleteId === track.id}
                        aria-label={`Remove ${track.title} from the catalogue`}
                      >
                        {pendingDeleteId === track.id ? "Removing…" : "Remove"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>

            <tfoot>
              <tr className="border-t border-line bg-surface-2/60 text-xs text-muted">
                <td className="px-3 py-2.5 pl-5" colSpan={4}>
                  Panel total · {formatCompact(total)} spins
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{stationTotal}</td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums text-foreground">
                  {formatNumber(total)}
                </td>
                <td colSpan={3} className="px-3 py-2.5 pr-5 text-right">
                  Reporting window: last 14 days
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
