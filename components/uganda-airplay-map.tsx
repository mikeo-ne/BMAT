"use client";
import { useId } from "react";
import { ArrowUpRight, MapPin, MoveUpRight, RotateCcw } from "lucide-react";
import { formatCompact, formatNumber } from "@/lib/format";
import type { BroadcastSpin } from "@/lib/playout";
import { REGIONS, REGION_META, type Region } from "@/lib/regions";
import { UGANDA_OUTLINE, REGION_PATHS, REGION_LABELS } from "@/lib/uganda-map";

export function UgandaAirplayMap({
  events,
  focusRegion,
  onFocusRegion,
}: {
  events: BroadcastSpin[];
  focusRegion: Region | "All";
  onFocusRegion: (region: Region | "All") => void;
}) {
  const id = useId().replace(/:/g, "");
  const matched = events.filter((event) => event.trackId);
  const regions = REGIONS.map((region) => {
    const rows = matched.filter((event) => event.region === region);
    return {
      region,
      spins: rows.length,
      stations: new Set(rows.map((event) => event.stationId)).size,
      share: matched.length ? rows.length / matched.length : 0,
    };
  });
  const selected = regions.find((entry) => entry.region === focusRegion);
  const leading = [...regions].sort((a, b) => b.spins - a.spins)[0];
  const toggle = (region: Region) =>
    onFocusRegion(focusRegion === region ? "All" : region);
  return (
    <section
      className="panel flex h-full flex-col overflow-hidden"
      aria-labelledby={`${id}-heading`}
    >
      <header className="flex items-start justify-between gap-2 px-5 pb-4 pt-5">
        <div>
          <p className="eyebrow">REACH BEYOND THE CAPITAL</p>
          <h3 id={`${id}-heading`} className="mt-1.5 text-sm font-semibold">
            Where Uganda is listening
          </h3>
          <p className="mt-1 text-[10px] text-muted">
            Select a region to explore its rotation.
          </p>
        </div>
        <span className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[9px] text-muted">
          <MapPin size={11} />
          UGANDA
        </span>
      </header>
      <div className="grid flex-1 grid-cols-1 min-[580px]:grid-cols-[1fr_0.9fr]">
        <div className="map-grid relative flex min-h-[270px] items-center justify-center border-y border-line/50 bg-[#f4f8f5] min-[580px]:border-b-0 min-[580px]:border-r">
          <span className="absolute left-4 top-3 flex items-center gap-1 text-[8px] uppercase tracking-[0.16em] text-[#8ca59a]">
            <MoveUpRight size={12} />N
          </span>
          <svg
            viewBox="0 0 460 460"
            className="h-[285px] w-full max-w-[330px] p-2"
            role="group"
            aria-label="Interactive Uganda schematic, four airplay regions"
          >
            <defs>
              <clipPath id={`${id}-clip`}>
                <path d={UGANDA_OUTLINE} />
              </clipPath>
              <filter id={`${id}-shadow`}>
                <feDropShadow
                  dx="0"
                  dy="5"
                  stdDeviation="6"
                  floodOpacity=".06"
                />
              </filter>
            </defs>
            <path
              d={UGANDA_OUTLINE}
              fill="#e5eee8"
              filter={`url(#${id}-shadow)`}
            />
            <g clipPath={`url(#${id}-clip)`}>
              {regions.map((entry) => (
                <path
                  key={entry.region}
                  d={REGION_PATHS[entry.region]}
                  fill={REGION_META[entry.region].accent}
                  fillOpacity={
                    focusRegion === "All" || focusRegion === entry.region
                      ? 0.68 + entry.share * 0.3
                      : 0.16
                  }
                  stroke="#f4f8f5"
                  strokeWidth="3"
                  className="map-region"
                  role="button"
                  tabIndex={0}
                  aria-label={`Filter to ${entry.region} region, ${formatNumber(entry.spins)} matched spins`}
                  aria-pressed={focusRegion === entry.region}
                  onClick={() => toggle(entry.region)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggle(entry.region);
                    }
                  }}
                >
                  <title>{`${entry.region}: ${formatNumber(entry.spins)} matched spins`}</title>
                </path>
              ))}
            </g>
            <path
              d={UGANDA_OUTLINE}
              fill="none"
              stroke="#ffffff"
              strokeWidth="2"
              className="pointer-events-none"
            />
            {regions.map((entry) => {
              const label = REGION_LABELS[entry.region];
              const dimmed =
                focusRegion !== "All" && focusRegion !== entry.region;
              return (
                <g
                  key={entry.region}
                  className="pointer-events-none"
                  opacity={dimmed ? 0.4 : 1}
                >
                  <text
                    x={label.x}
                    y={label.y}
                    fill="#173b33"
                    fontSize="14"
                    fontWeight="600"
                    textAnchor="middle"
                  >
                    {entry.region}
                  </text>
                  <text
                    x={label.x}
                    y={label.y + 17}
                    fill="#244b3d"
                    fontSize="11"
                    textAnchor="middle"
                  >
                    {formatCompact(entry.spins)} spins
                  </text>
                </g>
              );
            })}
            <circle
              cx="222"
              cy="323"
              r="5"
              fill="#153b30"
              stroke="white"
              strokeWidth="2"
              className="pointer-events-none"
            />
            <text
              x="240"
              y="326"
              fontSize="10"
              fill="#173b33"
              className="pointer-events-none"
            >
              Kampala
            </text>
          </svg>
          <span className="absolute bottom-3 left-4 rounded bg-white/75 px-1.5 py-0.5 text-[8px] text-muted">
            Schematic · not administrative boundaries
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1 p-3.5 min-[580px]:flex min-[580px]:flex-col min-[580px]:justify-center">
          {regions.map((entry) => (
            <button
              key={entry.region}
              type="button"
              aria-pressed={focusRegion === entry.region}
              onClick={() => toggle(entry.region)}
              className={`rounded-xl border px-3 py-3 text-left transition-colors ${focusRegion === entry.region ? "border-brand/20 bg-brand/5" : "border-transparent hover:bg-surface-2"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-[11px] font-medium">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: REGION_META[entry.region].accent }}
                  />
                  {entry.region}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-muted">
                  {(entry.share * 100).toFixed(1)}%<ArrowUpRight size={10} />
                </span>
              </div>
              <div className="mt-1.5 flex items-baseline justify-between gap-2">
                <span className="text-[17px] font-semibold tracking-tight tabular-nums">
                  {formatNumber(entry.spins)}
                </span>
                <span className="text-[9px] text-muted">
                  {entry.stations} stations
                </span>
              </div>
              <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${entry.share * 100}%`,
                    background: REGION_META[entry.region].accent,
                  }}
                />
              </div>
            </button>
          ))}
        </div>
      </div>
      <footer className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3 text-[10px] text-muted">
        <span>
          {selected
            ? `${selected.region} selected · ${formatNumber(selected.spins)} matched spins`
            : `${leading?.spins ? leading.region : "No region"} leads this reporting window`}
        </span>
        {focusRegion !== "All" ? (
          <button
            type="button"
            className="flex items-center gap-1 font-medium text-brand"
            onClick={() => onFocusRegion("All")}
          >
            <RotateCcw size={11} />
            Reset map
          </button>
        ) : (
          <span className="flex items-center gap-1">
            <span className="h-1 w-1 rounded-full bg-brand" />
            {events.length && events.every((event) => event.source === "demo")
              ? "Seeded panel data"
              : events.length
                ? "Capture records only"
                : "Awaiting capture records"}
          </span>
        )}
      </footer>
    </section>
  );
}
