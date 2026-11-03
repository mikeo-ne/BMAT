"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Minus,
  Play,
  Search,
  StopCircle,
} from "lucide-react";
import { DEMO_CHART_ROWS, type ChartRow, type DemoRegion } from "@/lib/site-content";
import { playSnippet, type SnippetHandle } from "@/lib/snippet-audio";
import { useLanguage } from "@/components/language-provider";

const REGIONS: (DemoRegion | "All")[] = [
  "All",
  "Central",
  "Eastern",
  "Western",
  "Northern",
];

function Sparkline({ data, className }: { data: number[]; className?: string }) {
  const max = Math.max(...data, 1);
  const step = data.length > 1 ? 100 / (data.length - 1) : 100;
  const points = data
    .map((value, index) => `${index * step},${28 - (value / max) * 26}`)
    .join(" ");
  return (
    <svg
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke="#34d399"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MovementBadge({ row }: { row: ChartRow }) {
  if (row.previousRank === null || row.movement === null) {
    return (
      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-300">
        NEW
      </span>
    );
  }
  if (row.movement === 0) {
    return <Minus className="h-4 w-4 text-slate-500" />;
  }
  const up = row.movement > 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold ${
        up ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"
      }`}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(row.movement)}
    </span>
  );
}

function RegionChip({ region }: { region: DemoRegion }) {
  const styles: Record<DemoRegion, string> = {
    Central: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    Eastern: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    Western: "border-sky-500/30 bg-sky-500/10 text-sky-300",
    Northern: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  };
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-bold ${styles[region]}`}
    >
      {region}
    </span>
  );
}

export function PublicChartsBrowser({ rows }: { rows: ChartRow[] }) {
  const { t } = useLanguage();
  const [region, setRegion] = useState<(typeof REGIONS)[number]>("All");
  const [query, setQuery] = useState("");
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [handle, setHandle] = useState<SnippetHandle | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (region !== "All" && row.region !== region) return false;
      if (!needle) return true;
      return (
        row.title.toLowerCase().includes(needle) ||
        row.artist.toLowerCase().includes(needle)
      );
    });
  }, [rows, region, query]);

  const togglePlay = (row: ChartRow) => {
    if (handle && playingKey === row.snippetSeed) {
      handle.stop();
      setHandle(null);
      setPlayingKey(null);
      return;
    }
    const next = playSnippet(row.snippetSeed);
    if (next) {
      setHandle(next);
      setPlayingKey(row.snippetSeed);
      window.setTimeout(() => setPlayingKey(null), 10_000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Filter strip */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2">
          {REGIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setRegion(option)}
              className={`h-11 rounded-full border px-4 text-xs font-bold transition-colors ${
                region === option
                  ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-300"
                  : "border-slate-700 bg-slate-900/60 text-slate-400 hover:border-slate-600 hover:text-slate-200"
              }`}
            >
              {option === "All" ? t("charts.all") : option}
            </button>
          ))}
        </div>
        <label className="relative ml-auto flex h-11 items-center">
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-slate-500" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("charts.search")}
            className="w-44 rounded-full border border-slate-700 bg-slate-900/60 py-0 pl-9 pr-3 text-sm text-slate-200 placeholder:text-slate-500 focus:border-emerald-400/50 focus:outline-none sm:w-56"
          />
        </label>
      </div>

      {/* Mobile: compact cards with tap-to-play snippets */}
      <div className="space-y-2.5 lg:hidden">
        {filtered.map((row) => (
          <ChartCard
            key={row.rank}
            row={row}
            playing={playingKey === row.snippetSeed}
            onPlay={togglePlay}
          />
        ))}
        {filtered.length === 0 && <EmptyState />}
      </div>

      {/* Desktop: full table with velocity */}
      <div className="hidden overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/40 lg:block">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <th className="w-12 px-4 py-3.5">#</th>
              <th className="w-16 px-2 py-3.5">Move</th>
              <th className="px-3 py-3.5">Track</th>
              <th className="w-20 px-3 py-3.5 text-right">{t("charts.spins")}</th>
              <th className="w-20 px-3 py-3.5 text-right">{t("charts.prev")}</th>
              <th className="w-14 px-3 py-3.5 text-right">{t("charts.peak")}</th>
              <th className="w-14 px-3 py-3.5 text-right">{t("charts.weeks")}</th>
              <th className="w-24 px-3 py-3.5">{t("charts.region")}</th>
              <th className="w-14 px-3 py-3.5 text-right">{t("charts.confidence")}</th>
              <th className="w-24 px-3 py-3.5">Velocity</th>
              <th className="w-24 px-4 py-3.5 text-right">{t("charts.evidence")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr
                key={row.rank}
                className="border-b border-slate-800/60 transition-colors hover:bg-slate-800/30"
              >
                <td className="px-4 py-3">
                  <span
                    className={`text-lg font-extrabold ${
                      row.rank <= 3 ? "text-emerald-300" : "text-slate-300"
                    }`}
                  >
                    {row.rank}
                  </span>
                </td>
                <td className="px-2 py-3">
                  <MovementBadge row={row} />
                </td>
                <td className="px-3 py-3">
                  <p className="font-semibold text-white">{row.title}</p>
                  <p className="text-xs text-slate-400">{row.artist}</p>
                </td>
                <td className="px-3 py-3 text-right font-bold text-white">
                  {row.spins7d}
                </td>
                <td className="px-3 py-3 text-right text-slate-400">
                  {row.spinsPrev7d}
                </td>
                <td className="px-3 py-3 text-right text-slate-300">{row.peak}</td>
                <td className="px-3 py-3 text-right text-slate-400">
                  {row.weeksOnChart}
                </td>
                <td className="px-3 py-3">
                  <RegionChip region={row.region} />
                </td>
                <td className="px-3 py-3 text-right">
                  <span
                    className={`font-semibold ${
                      row.confidence >= 0.9
                        ? "text-emerald-300"
                        : row.confidence >= 0.8
                          ? "text-amber-300"
                          : "text-red-300"
                    }`}
                  >
                    {Math.round(row.confidence * 100)}%
                  </span>
                </td>
                <td className="px-3 py-3">
                  <Sparkline data={row.trend} className="h-7 w-24" />
                </td>
                <td className="px-4 py-3 text-right">
                  <EvidenceButton
                    row={row}
                    playing={playingKey === row.snippetSeed}
                    onPlay={togglePlay}
                  />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-slate-500">
                  No rows match the current filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmptyState() {
  const { t } = useLanguage();
  return (
    <p className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-center text-sm text-slate-500">
      {t("charts.search")}
    </p>
  );
}

function EvidenceButton({
  row,
  playing,
  onPlay,
}: {
  row: ChartRow;
  playing: boolean;
  onPlay: (row: ChartRow) => void;
}) {
  const { t } = useLanguage();
  return (
    <button
      type="button"
      onClick={() => onPlay(row)}
      aria-label={`${t("charts.evidence")}: ${row.title}`}
      className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-bold transition-colors ${
        playing
          ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-300"
          : "border-slate-700 bg-slate-900/60 text-slate-400 hover:border-emerald-400/40 hover:text-emerald-300"
      }`}
    >
      {playing ? <StopCircle className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      {playing ? "Stop" : "10s"}
    </button>
  );
}

function ChartCard({
  row,
  playing,
  onPlay,
}: {
  row: ChartRow;
  playing: boolean;
  onPlay: (row: ChartRow) => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-4 transition-colors hover:border-emerald-400/20">
      <span
        className={`w-8 shrink-0 text-center text-xl font-extrabold ${
          row.rank <= 3 ? "text-emerald-300" : "text-slate-400"
        }`}
      >
        {row.rank}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-white">{row.title}</p>
        <div className="mt-0.5 flex items-center gap-2">
          <p className="truncate text-xs text-slate-400">{row.artist}</p>
          <RegionChip region={row.region} />
        </div>
        <div className="mt-1.5 flex items-center gap-3">
          <span className="text-xs font-bold text-emerald-300">
            {row.spins7d} spins
          </span>
          <MovementBadge row={row} />
          <Sparkline data={row.trend} className="hidden h-6 w-24 sm:block" />
        </div>
      </div>
      <button
        type="button"
        onClick={() => onPlay(row)}
        aria-label={`${t("charts.evidence")}: ${row.title}`}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors ${
          playing
            ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-300"
            : "border-slate-700 bg-slate-900/60 text-slate-300 hover:border-emerald-400/40 hover:text-emerald-300"
        }`}
      >
        {playing ? <StopCircle className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>
    </div>
  );
}

export { DEMO_CHART_ROWS };
