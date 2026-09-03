"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCompact, formatNumber } from "@/lib/format";
import { REGION_META, REGIONS, stationsForRegion, type Region } from "@/lib/regions";
import { spinsFor, stationsFor, type CatalogSummary, type Track } from "@/lib/types";

interface RegionAirplayChartProps {
  tracks: Track[];
  summary: CatalogSummary;
  focusRegion: Region | "All";
  onFocusRegion: (region: Region | "All") => void;
}

type View = "region" | "track";

interface TooltipItem {
  name?: string | number;
  value?: string | number;
  color?: string;
  dataKey?: string | number;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipItem[];
  label?: string | number;
}) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium">{label}</p>
      <ul className="space-y-0.5">
        {payload.map((item, i) => (
          <li key={`${item.dataKey ?? i}`} className="flex items-center gap-2 tabular-nums">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: item.color ?? "var(--brand)" }}
              aria-hidden
            />
            <span className="text-muted">{item.name ?? item.dataKey}</span>
            <span className="ml-auto font-medium">{formatNumber(Number(item.value ?? 0))}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RegionAirplayChart({
  tracks,
  summary,
  focusRegion,
  onFocusRegion,
}: RegionAirplayChartProps) {
  const [view, setView] = useState<View>("region");

  const regionData = useMemo(
    () =>
      REGIONS.map((region) => {
        const entry = summary.byRegion[region];
        return {
          region,
          spins: entry?.spins ?? 0,
          stations: entry?.stations ?? 0,
          audience: entry?.audience ?? 0,
          accent: REGION_META[region].accent,
        };
      }),
    [summary],
  );

  const trackData = useMemo(
    () =>
      [...tracks]
        .sort((a, b) => b.totalSpins - a.totalSpins)
        .slice(0, 8)
        .map((track) => {
          const row: Record<string, string | number> = {
            name: track.title,
            short: track.title.length > 18 ? `${track.title.slice(0, 17)}…` : track.title,
          };
          for (const region of REGIONS) {
            row[region] = track.airplay.find((a) => a.region === region)?.spins ?? 0;
          }
          return row;
        }),
    [tracks],
  );

  const grandTotal = regionData.reduce((s, r) => s + r.spins, 0);

  return (
    <section className="panel p-4 sm:p-5" aria-labelledby="airplay-heading">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="airplay-heading" className="text-sm font-semibold tracking-tight">
            Airplay breakdown by region
          </h2>
          <p className="text-xs text-muted">
            Spins logged by the {formatNumber(summary.reportingStations)} region panels over the last
            14 days.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-line bg-surface-2 p-0.5">
          <button
            type="button"
            onClick={() => setView("region")}
            className={[
              "rounded px-2.5 py-1 text-[11px] transition-colors",
              view === "region" ? "bg-brand text-brand-ink" : "text-muted hover:text-foreground",
            ].join(" ")}
            aria-pressed={view === "region"}
          >
            By region
          </button>
          <button
            type="button"
            onClick={() => setView("track")}
            className={[
              "rounded px-2.5 py-1 text-[11px] transition-colors",
              view === "track" ? "bg-brand text-brand-ink" : "text-muted hover:text-foreground",
            ].join(" ")}
            aria-pressed={view === "track"}
          >
            Top tracks × region
          </button>
        </div>
      </header>

      {tracks.length === 0 ? (
        <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-line text-center text-xs text-muted">
          Regional airplay appears here once your first master is delivered.
        </div>
      ) : view === "region" ? (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={regionData} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="region"
                stroke="var(--muted)"
                tick={{ fill: "var(--muted)", fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: "var(--line)" }}
              />
              <YAxis
                stroke="var(--muted)"
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={54}
                tickFormatter={(v: number) => formatCompact(v)}
              />
              <Tooltip
                cursor={{ fill: "color-mix(in srgb, var(--muted) 12%, transparent)" }}
                content={<ChartTooltip />}
              />
              <Bar dataKey="spins" name="Spins" radius={[6, 6, 0, 0]} maxBarSize={92}>
                {regionData.map((entry) => (
                  <Cell
                    key={entry.region}
                    fill={entry.accent}
                    fillOpacity={focusRegion === "All" || focusRegion === entry.region ? 1 : 0.28}
                    stroke={focusRegion === entry.region ? entry.accent : "transparent"}
                    strokeWidth={2}
                    cursor="pointer"
                    onClick={() =>
                      onFocusRegion(focusRegion === entry.region ? "All" : (entry.region as Region))
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={trackData}
              layout="vertical"
              margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
            >
              <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                stroke="var(--muted)"
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "var(--line)" }}
                tickFormatter={(v: number) => formatCompact(v)}
              />
              <YAxis
                type="category"
                dataKey="short"
                stroke="var(--muted)"
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={132}
              />
              <Tooltip
                cursor={{ fill: "color-mix(in srgb, var(--muted) 10%, transparent)" }}
                content={<ChartTooltip />}
              />
              {REGIONS.map((region) => (
                <Bar
                  key={region}
                  dataKey={region}
                  stackId="airplay"
                  fill={REGION_META[region].accent}
                  fillOpacity={focusRegion === "All" || focusRegion === region ? 1 : 0.28}
                  maxBarSize={26}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {regionData.map((entry) => {
          const share = grandTotal === 0 ? 0 : (entry.spins / grandTotal) * 100;
          const panel = stationsForRegion(entry.region as Region);
          const selected = focusRegion === entry.region;

          return (
            <button
              key={entry.region}
              type="button"
              onClick={() => onFocusRegion(selected ? "All" : (entry.region as Region))}
              aria-pressed={selected}
              className={[
                "rounded-lg border p-3 text-left transition-colors",
                selected
                  ? "border-brand bg-brand/10"
                  : "border-line bg-surface-2 hover:border-muted",
              ].join(" ")}
            >
              <dt className="flex items-center gap-1.5 text-xs font-medium">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: entry.accent }}
                  aria-hidden
                />
                {entry.region}
              </dt>
              <dd className="mt-1.5 text-lg font-semibold tabular-nums">
                {formatNumber(entry.spins)}
                <span className="ml-1.5 text-[11px] font-normal text-muted tabular-nums">
                  {share.toFixed(1)}%
                </span>
              </dd>
              <p className="mt-0.5 text-[11px] leading-snug text-muted">
                {entry.stations}/{panel.length} stations · {formatCompact(entry.audience)} reach
              </p>
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-background">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${share}%`, background: entry.accent }}
                />
              </div>
            </button>
          );
        })}
      </dl>

      <p className="mt-3 text-[11px] text-muted">
        {focusRegion === "All"
          ? "Select a region to filter the catalogue and re-rank spins."
          : `Filtered to ${focusRegion} — ${formatNumber(
              tracks.reduce((s, t) => s + spinsFor(t, focusRegion), 0),
            )} spins from ${formatNumber(
              tracks.reduce((s, t) => s + stationsFor(t, focusRegion), 0),
            )} station reports.`}
      </p>
    </section>
  );
}
