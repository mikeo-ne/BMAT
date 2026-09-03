import { REGION_META, REGIONS, type Region } from "@/lib/regions";
import type { RegionAirplay } from "@/lib/types";

interface RegionSplitProps {
  airplay: RegionAirplay[];
  /** Highlight one region (driven by the chart's region selector). */
  focus?: Region | "All";
}

/** Horizontal stacked bar showing how a track's spins split across the 4 regions. */
export function RegionSplit({ airplay, focus = "All" }: RegionSplitProps) {
  const total = airplay.reduce((sum, r) => sum + r.spins, 0);

  if (total === 0) {
    return <div className="h-1.5 w-full rounded-full bg-surface-2" aria-hidden />;
  }

  return (
    <div className="w-full">
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        {REGIONS.map((region) => {
          const entry = airplay.find((a) => a.region === region);
          const share = ((entry?.spins ?? 0) / total) * 100;
          if (share <= 0) return null;

          const dimmed = focus !== "All" && focus !== region;

          return (
            <span
              key={region}
              style={{
                width: `${share}%`,
                background: REGION_META[region].accent,
                opacity: dimmed ? 0.25 : 1,
              }}
              title={`${region}: ${entry?.spins ?? 0} spins (${share.toFixed(1)}%)`}
            />
          );
        })}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[10px] text-muted">
        {REGIONS.map((region) => {
          const entry = airplay.find((a) => a.region === region);
          if (!entry || entry.spins === 0) return null;
          const dimmed = focus !== "All" && focus !== region;
          return (
            <span key={region} className="inline-flex items-center gap-1" style={{ opacity: dimmed ? 0.4 : 1 }}>
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: REGION_META[region].accent }}
              />
              {region.slice(0, 1)}
              {((entry.spins / total) * 100).toFixed(0)}%
            </span>
          );
        })}
      </div>
    </div>
  );
}
