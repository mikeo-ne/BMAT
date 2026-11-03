import { DEMO_CHART_ROWS, type DemoRegion } from "@/lib/site-content";

const REGIONS: DemoRegion[] = ["Central", "Eastern", "Western", "Northern"];

const REGION_COLORS: Record<DemoRegion, string> = {
  Central: "rgba(52, 211, 153, ",
  Eastern: "rgba(251, 191, 36, ",
  Western: "rgba(56, 189, 248, ",
  Northern: "rgba(167, 139, 250, ",
};

const REGION_NAMES: Record<DemoRegion, string> = {
  Central: "Central · Kampala, Mukono",
  Eastern: "Eastern · Jinja, Mbale, Tororo",
  Western: "Western · Mbarara, Fort Portal, Kasese",
  Northern: "Northern · Gulu, Lira, Arua",
};

interface Cell {
  region: DemoRegion;
  title: string;
  artist: string;
  intensity: number; // 0..1 share of the region's top-10 spins
}

/**
 * Regional velocity heatmap for the public chart.
 *
 * Grid: one column per Ugandan region, one row per Top-10 track. Cell colour
 * intensity is the track's share of that region's captured spins — hotter
 * cells are where the record is actually working.
 */
export function RegionVelocityHeatmap() {
  // Regions are ranked by total captured spins across the Top 10.
  const totals = new Map<DemoRegion, number>();
  for (const row of DEMO_CHART_ROWS) {
    totals.set(row.region, (totals.get(row.region) ?? 0) + row.spins7d);
  }
  const orderedRegions = [...REGIONS].sort(
    (a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0),
  );

  const cells: Cell[] = [];
  for (const region of orderedRegions) {
    const regionRows = DEMO_CHART_ROWS.filter((row) => row.region === region);
    const regionTotal = regionRows.reduce((sum, row) => sum + row.spins7d, 0);
    for (const row of regionRows) {
      cells.push({
        region,
        title: row.title,
        artist: row.artist,
        intensity: regionTotal ? row.spins7d / regionTotal : 0,
      });
    }
  }

  // Column heights: pad with empty cells so every column has 10 rows.
  const maxHeight = Math.max(...orderedRegions.map((region) =>
    DEMO_CHART_ROWS.filter((row) => row.region === region).length,
  ));

  return (
    <section className="panel p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">
            Regional velocity heatmap
          </h2>
          <p className="mt-1 text-xs text-muted">
            Where each Top-10 track is actually working — darker cells mean a
            bigger share of that region&apos;s captured spins.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted">low</span>
          <div className="flex h-3 w-24 overflow-hidden rounded-full bg-slate-700">
            <div className="h-full w-1/5 bg-slate-600" />
            <div className="h-full w-1/5 bg-slate-500" />
            <div className="h-full w-1/5 bg-slate-400" />
            <div className="h-full w-1/5 bg-slate-300" />
            <div className="h-full w-1/5 bg-slate-200" />
          </div>
          <span className="text-[10px] text-muted">high</span>
        </div>
      </div>

      <div className="mt-4 flex gap-3">
        {orderedRegions.map((region) => {
          const regionCells = cells.filter((cell) => cell.region === region);
          const missing = maxHeight - regionCells.length;
          return (
            <div key={region} className="flex min-w-[12.5rem] flex-1 flex-col">
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: REGION_COLORS[region] + "0.9)" }}
                />
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
                  {REGION_NAMES[region]}
                </p>
              </div>
              <div className="flex flex-col gap-1">
                {regionCells.map((cell) => (
                  <div
                    key={`${cell.region}-${cell.title}`}
                    className="relative flex h-8 items-center overflow-hidden rounded-lg px-2.5"
                    style={{
                      backgroundColor:
                        REGION_COLORS[cell.region] +
                        (0.08 + cell.intensity * 0.6).toFixed(2) +
                        ")",
                    }}
                  >
                    <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-white/95 mix-blend-luminosity">
                      {cell.title}
                    </span>
                    <span className="absolute bottom-0 left-0 right-0 h-px bg-black/20" />
                  </div>
                ))}
                {Array.from({ length: missing }).map((_, i) => (
                  <div
                    key={`empty-${region}-${i}`}
                    className="h-8 rounded-lg border border-dashed border-slate-700/50 bg-slate-900/30"
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
