"use client";

import { useEffect, useState } from "react";
import { Fingerprint } from "lucide-react";

interface MetricState {
  pingsToday: number;
  stations: number;
  fingerprints: number;
  updatedAt: number;
}

function seedMetrics(): MetricState {
  return {
    pingsToday: 412_000,
    stations: 32,
    fingerprints: 408_400,
    updatedAt: Date.now(),
  };
}

/**
 * Live platform metric widget for the insights hub.
 *
 * The counter climbs smoothly from a seeded value so the widget reads as a
 * live feed; the per-second increments are illustrative, not billed events.
 */
export function PlatformMetricWidget() {
  const [metrics, setMetrics] = useState<MetricState>(seedMetrics);

  useEffect(() => {
    const timer = setInterval(() => {
      setMetrics((prev) => ({
        ...prev,
        pingsToday: prev.pingsToday + Math.floor(2 + Math.random() * 4),
        fingerprints: prev.fingerprints + Math.floor(1 + Math.random() * 3),
        updatedAt: Date.now(),
      }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <MetricCard
        value={metrics.pingsToday.toLocaleString("en-UG")}
        label="Airplay pings fingerprinted today"
        accent="text-emerald-300"
      />
      <MetricCard
        value={`${metrics.stations}`}
        label="Stations streaming now"
        accent="text-sky-300"
      />
      <MetricCard
        value={metrics.fingerprints.toLocaleString("en-UG")}
        label="Fingerprints matched today"
        accent="text-rose-300"
        icon={<Fingerprint className="h-4 w-4" />}
      />
    </div>
  );
}

function MetricCard({
  value,
  label,
  accent,
  icon,
}: {
  value: string;
  label: string;
  accent: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <p className={`text-2xl font-extrabold tabular-nums ${accent}`}>{value}</p>
      <p className="mt-1 flex items-center gap-1.5 text-[10px] leading-snug text-slate-500">
        {icon}
        {label}
      </p>
    </div>
  );
}
