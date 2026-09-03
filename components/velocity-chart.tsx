"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { TrackVelocity } from "@/lib/geography";
import { formatPercent } from "@/lib/format";

interface VelocityChartProps {
  velocity: TrackVelocity;
}

function GrowthBadge({ value, label }: { value: number | null; label: string }) {
  const tone =
    value === null ? "text-muted" : value > 0.05 ? "text-accent" : value < -0.05 ? "text-brand" : "text-muted";

  return (
    <div className="rounded-lg border border-line bg-surface-2 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-0.5 font-mono text-lg ${tone}`}>
        {formatPercent(value, 0)}
      </p>
    </div>
  );
}

/**
 * Radio spin growth against streaming-search trend.
 *
 * Radio leading search usually means a record is being pushed by stations;
 * search leading radio is the shape an organic breakout takes. The gap between
 * the two curves is the number worth arguing about.
 */
export function VelocityChart({ velocity }: VelocityChartProps) {
  const lead = velocity.radioLead;
  const verdict =
    lead === null
      ? "Not enough history to compare."
      : lead > 0.15
        ? "Radio is pulling ahead of search — this looks like station push rather than listener demand."
        : lead < -0.15
          ? "Search is outpacing radio — the audience is finding the record before stations add it."
          : "Radio and search are moving together; the record is tracking normally.";

  return (
    <section className="panel p-4" aria-labelledby="velocity-heading">
      <h2 id="velocity-heading" className="text-sm font-semibold tracking-tight">
        Track velocity — {velocity.title}
      </h2>
      <p className="mt-1 text-xs text-muted">
        {velocity.primaryArtist} · radio spin growth over 7 days against the streaming-search index
      </p>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <GrowthBadge value={velocity.spinGrowth} label="Radio spin growth" />
        <GrowthBadge value={velocity.searchGrowth} label="Search trend" />
        <GrowthBadge value={lead} label="Radio lead" />
      </div>

      <div className="mt-4 h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={velocity.series} margin={{ top: 8, right: 12, left: -18, bottom: 4 }}>
            <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="var(--muted)"
              tick={{ fontSize: 11, fill: "var(--muted)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--line)" }}
            />
            <YAxis
              stroke="var(--muted)"
              tick={{ fontSize: 11, fill: "var(--muted)" }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--line)",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "var(--foreground)" }}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: "var(--muted)" }} />
            <Line
              type="monotone"
              dataKey="spins"
              name="Radio spins"
              stroke="var(--brand)"
              strokeWidth={2}
              dot={{ r: 2.5, fill: "var(--brand)" }}
            />
            <Line
              type="monotone"
              dataKey="search"
              name="Search index"
              stroke="var(--accent)"
              strokeWidth={2}
              dot={{ r: 2.5, fill: "var(--accent)" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-3 rounded border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
        {verdict}
      </p>
    </section>
  );
}
