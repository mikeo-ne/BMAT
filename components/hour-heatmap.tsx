import { peakHour, type HeatmapRow } from "@/lib/advertising";

interface HourHeatmapProps {
  rows: HeatmapRow[];
  /** Campaign id whose window band to highlight; defaults to every row's own. */
  compact?: boolean;
}

/**
 * Time-of-day grid: one row per station, one column per hour of the EAT day.
 *
 * Shading is relative to the busiest cell in the whole grid, so a quiet station
 * still reads as quiet. The contracted window is outlined per row, which is what
 * makes an off-window buy visible at a glance.
 */
export function HourHeatmap({ rows, compact = false }: HourHeatmapProps) {
  if (rows.length === 0) {
    return (
      <p className="rounded border border-dashed border-line px-4 py-8 text-center text-xs text-muted">
        No aired spots to plot yet.
      </p>
    );
  }

  const ceiling = Math.max(1, ...rows.flatMap((r) => r.hours));
  const hours = Array.from({ length: 24 }, (_, h) => h);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-[11px]">
        <caption className="sr-only">
          Aired ad spots by station and hour of day, East Africa Time
        </caption>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 bg-surface px-2 py-1.5 text-left font-medium text-muted">
              Station
            </th>
            {hours.map((h) => (
              <th
                key={h}
                scope="col"
                className="px-0 py-1.5 text-center font-mono font-normal text-muted"
              >
                {compact && h % 3 !== 0 ? "" : String(h).padStart(2, "0")}
              </th>
            ))}
            <th scope="col" className="px-2 py-1.5 text-right font-medium text-muted">
              Peak
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const peak = peakHour(row);
            return (
              <tr key={`${row.stationId}-${row.windowStartHour}`}>
                <th
                  scope="row"
                  className="sticky left-0 whitespace-nowrap bg-surface px-2 py-1 text-left font-medium"
                >
                  {row.stationName}
                  <span className="ml-1 font-normal text-muted">
                    {String(row.windowStartHour).padStart(2, "0")}–
                    {String(row.windowEndHour).padStart(2, "0")}
                  </span>
                </th>

                {row.hours.map((count, h) => {
                  const intensity = count === 0 ? 0 : Math.max(count / ceiling, 0.12);
                  const inWindow = h >= row.windowStartHour && h < row.windowEndHour;

                  return (
                    <td
                      key={h}
                      className="px-0 py-1 text-center"
                      title={`${row.stationName} · ${String(h).padStart(2, "0")}:00 EAT · ${count} spot${count === 1 ? "" : "s"}`}
                    >
                      <span
                        className="mx-auto block h-5 w-full rounded-[3px]"
                        style={{
                          background:
                            count === 0
                              ? "transparent"
                              : `color-mix(in srgb, ${inWindow ? "var(--accent)" : "var(--brand)"} ${Math.round(intensity * 100)}%, transparent)`,
                          outline: inWindow ? "1px solid color-mix(in srgb, var(--line) 90%, transparent)" : "none",
                        }}
                        aria-hidden
                      />
                      <span className="sr-only">
                        {count} spot{count === 1 ? "" : "s"}
                      </span>
                    </td>
                  );
                })}

                <td className="px-2 py-1 text-right font-mono text-muted">{peak.label}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-accent" aria-hidden />
          Inside the contracted window
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-brand" aria-hidden />
          Outside the contracted window
        </span>
        <span>Darker means more spots in that hour.</span>
      </div>
    </div>
  );
}
