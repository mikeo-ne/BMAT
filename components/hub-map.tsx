"use client";

import { TIER_LABEL, type GeoHub, type HubMetric } from "@/lib/geography";
import { formatCompact } from "@/lib/format";

interface HubMapProps {
  metrics: HubMetric[];
  selectedId: string | null;
  onSelect: (hubId: string) => void;
}

const TIER_COLOR: Record<GeoHub["tier"], string> = {
  primary: "var(--brand)",
  secondary: "var(--accent)",
  "cross-border": "var(--region-western)",
};

/**
 * Uganda and its two cross-border markets, plotted by longitude and latitude.
 *
 * A plain equirectangular projection over the hub bounding box — enough to read
 * relative position without shipping a tile layer. Marker radius tracks the
 * week's spins, colour tracks market tier.
 */
export function HubMap({ metrics, selectedId, onSelect }: HubMapProps) {
  const lons = metrics.map((m) => m.hub.lon);
  const lats = metrics.map((m) => m.hub.lat);
  const pad = 0.6;

  const minLon = Math.min(...lons) - pad;
  const maxLon = Math.max(...lons) + pad;
  const minLat = Math.min(...lats) - pad;
  const maxLat = Math.max(...lats) + pad;

  const width = 640;
  const height = 460;

  const x = (lon: number) => ((lon - minLon) / (maxLon - minLon)) * width;
  const y = (lat: number) => height - ((lat - minLat) / (maxLat - minLat)) * height;

  const ceiling = Math.max(1, ...metrics.map((m) => m.spins7d));
  const r = (spins: number) => 8 + Math.sqrt(spins / ceiling) * 22;

  return (
    <section className="panel p-4" aria-labelledby="hub-map-heading">
      <h2 id="hub-map-heading" className="text-sm font-semibold tracking-tight">
        Airplay geography
      </h2>
      <p className="mt-1 text-xs text-muted">
        Uganda and East Africa by hub. Marker size is the last week of spins; click a hub to filter.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full rounded-lg border border-line bg-background"
          role="group"
          aria-label="Hub map of Uganda, Kenya and Tanzania"
        >
          {/* Uganda's border, loosely, so the domestic hubs read as domestic. */}
          <path
            d="M 96 60 L 268 44 L 300 96 L 336 132 L 316 208 L 268 268 L 216 320 L 148 300 L 96 232 L 68 148 Z"
            fill="color-mix(in srgb, var(--surface-2) 70%, transparent)"
            stroke="var(--line)"
            strokeWidth={1}
          />

          {metrics.map((metric) => {
            const cx = x(metric.hub.lon);
            const cy = y(metric.hub.lat);
            const active = metric.hub.id === selectedId;

            return (
              <g key={metric.hub.id}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={r(metric.spins7d)}
                  fill={TIER_COLOR[metric.hub.tier]}
                  opacity={active ? 0.5 : 0.22}
                  stroke={TIER_COLOR[metric.hub.tier]}
                  strokeWidth={active ? 2.4 : 1}
                />
                <circle
                  cx={cx}
                  cy={cy}
                  r={Math.max(r(metric.spins7d), 18)}
                  fill="transparent"
                  className="cursor-pointer"
                  role="button"
                  tabIndex={0}
                  aria-label={`${metric.hub.name}, ${metric.hub.country}: ${formatCompact(metric.spins7d)} spins this week`}
                  aria-pressed={active}
                  onClick={() => onSelect(metric.hub.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(metric.hub.id);
                    }
                  }}
                />
                <text
                  x={cx}
                  y={cy - r(metric.spins7d) - 8}
                  textAnchor="middle"
                  className="pointer-events-none fill-foreground"
                  style={{ fontSize: 13, fontWeight: 600 }}
                >
                  {metric.hub.name}
                </text>
                <text
                  x={cx}
                  y={cy + r(metric.spins7d) + 16}
                  textAnchor="middle"
                  className="pointer-events-none"
                  style={{ fontSize: 11, fill: "var(--muted)" }}
                >
                  {formatCompact(metric.spins7d)} spins
                </text>
              </g>
            );
          })}
        </svg>

        <ul className="space-y-1.5 text-xs">
          {metrics.map((metric) => {
            const active = metric.hub.id === selectedId;
            return (
              <li key={metric.hub.id}>
                <button
                  type="button"
                  onClick={() => onSelect(metric.hub.id)}
                  aria-pressed={active}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-left"
                  style={{ background: active ? "var(--surface-2)" : "transparent" }}
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ background: TIER_COLOR[metric.hub.tier] }}
                        aria-hidden
                      />
                      <span className="truncate font-medium">{metric.hub.name}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted">
                      {metric.hub.country} · {TIER_LABEL[metric.hub.tier]} ·{" "}
                      {metric.hub.stations} station{metric.hub.stations === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="shrink-0 text-right font-mono">
                    {formatCompact(metric.spins7d)}
                    <span className="block text-[10px] text-muted">
                      {metric.growthRate === null
                        ? "new"
                        : `${metric.growthRate >= 0 ? "+" : ""}${Math.round(metric.growthRate * 100)}%`}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
