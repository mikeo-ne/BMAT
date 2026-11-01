"use client";
import { useId, useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import { formatCompact, formatNumber } from "@/lib/format";
import { eatDate, eatHour, type BroadcastSpin } from "@/lib/playout";

export function AirplayTrend({ events }: { events: BroadcastSpin[] }) {
  const [mode, setMode] = useState<"daily" | "hourly">("daily");
  const [hover, setHover] = useState<number | null>(null);
  const id = useId().replace(/:/g, "");
  const points = useMemo(() => {
    if (mode === "hourly")
      return Array.from({ length: 24 }, (_, hour) => ({
        label: `${String(hour).padStart(2, "0")}:00`,
        value: events.filter(
          (event) => event.trackId && eatHour(event.detectedAt) === hour,
        ).length,
      }));
    const counts = new Map<string, number>();
    const dates = [
      ...new Set(events.map((event) => eatDate(event.detectedAt))),
    ].sort();
    for (const event of events)
      if (event.trackId)
        counts.set(
          eatDate(event.detectedAt),
          (counts.get(eatDate(event.detectedAt)) ?? 0) + 1,
        );
    return dates.map((date) => ({
      label: new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }).format(new Date(`${date}T12:00:00Z`)),
      value: counts.get(date) ?? 0,
    }));
  }, [events, mode]);
  const max = Math.max(1, ...points.map((point) => point.value));
  const width = 600,
    height = 160;
  const coords = points.map((point, i) => [
    (i * width) / Math.max(1, points.length - 1),
    height - (point.value / max) * (height - 12),
  ]);
  const line = coords
    .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const total = events.filter((event) => event.trackId).length;
  const active = hover === null ? null : points[hover];
  return (
    <section
      className="panel flex h-full flex-col p-5"
      aria-labelledby="trend-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="eyebrow">MOMENTUM</p>
          <h3 id="trend-heading" className="mt-1.5 text-sm font-semibold">
            Your airplay, over time
          </h3>
        </div>
        <div className="flex rounded-lg border border-line bg-surface-2/60 p-0.5">
          {(["daily", "hourly"] as const).map((view) => (
            <button
              key={view}
              type="button"
              onClick={() => {
                setMode(view);
                setHover(null);
              }}
              aria-pressed={mode === view}
              className={`rounded-md px-2.5 py-1 text-[10px] capitalize ${mode === view ? "bg-surface font-medium text-foreground shadow-sm" : "text-muted"}`}
            >
              {view}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-4 mt-4 flex items-baseline justify-between">
        <p className="text-2xl font-semibold tracking-tight tabular-nums">
          {formatNumber(active?.value ?? total)}
          <span className="ml-2 text-[10px] font-normal tracking-normal text-muted">
            {active?.label ?? "matched plays"}
          </span>
        </p>
        <TrendingUp size={17} className="text-brand" />
      </div>
      {points.length ? (
        <div className="relative mt-auto">
          <div className="flex gap-2">
            <div className="flex w-7 shrink-0 flex-col justify-between pb-1 text-right text-[9px] text-muted">
              <span>{formatCompact(max)}</span>
              <span>{formatCompact(max / 2)}</span>
              <span>0</span>
            </div>
            <div className="min-w-0 flex-1">
              <svg
                viewBox={`0 0 ${width} ${height + 4}`}
                className="h-44 w-full overflow-visible sm:h-60"
                preserveAspectRatio="none"
                role="img"
                aria-label={`${mode} matched airplay trend. ${formatNumber(total)} matched plays.`}
                onMouseLeave={() => setHover(null)}
              >
                <defs>
                  <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor="var(--brand)"
                      stopOpacity=".16"
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--brand)"
                      stopOpacity="0"
                    />
                  </linearGradient>
                </defs>
                {[0, 0.5, 1].map((value) => (
                  <line
                    key={value}
                    x1="0"
                    y1={value * height}
                    x2={width}
                    y2={value * height}
                    stroke="var(--line)"
                    strokeDasharray="3 5"
                  />
                ))}
                <path
                  d={`${line} L${width},${height} L0,${height} Z`}
                  fill={`url(#${id})`}
                />
                <path
                  d={line}
                  fill="none"
                  stroke="var(--brand)"
                  strokeWidth="2.5"
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                />
                {coords.map(([x, y], index) => (
                  <g key={index} onMouseEnter={() => setHover(index)}>
                    <rect
                      x={x - width / Math.max(2, points.length) / 2}
                      y="0"
                      width={width / Math.max(1, points.length)}
                      height={height}
                      fill="transparent"
                    />
                    <circle
                      cx={x}
                      cy={y}
                      r={hover === index ? 4 : 0}
                      fill="var(--brand)"
                      stroke="white"
                      strokeWidth="2"
                    />
                  </g>
                ))}
              </svg>
              <div className="mt-3 flex justify-between text-[9px] text-muted">
                {[
                  0,
                  Math.floor((points.length - 1) / 2),
                  points.length - 1,
                ].map((index, i) => (
                  <span key={i}>{points[index]?.label}</span>
                ))}
              </div>
            </div>
          </div>
          <p className="mt-4 border-t border-line pt-3 text-[9px] text-muted">
            {mode === "hourly"
              ? "Hourly distribution in EAT. Hover a point to inspect rotation."
              : "Captured reporting days · matched records only · current EAT day may be partial"}
          </p>
        </div>
      ) : (
        <div className="flex min-h-48 items-center justify-center text-xs text-muted">
          No airplay in this selection.
        </div>
      )}
    </section>
  );
}
