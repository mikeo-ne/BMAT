import { formatPercent } from "@/lib/format";
import type { ChartEntry, WeeklyChart } from "@/lib/charts";

interface NationalChartsProps {
  chart: WeeklyChart;
}

/** "▲ 2", "▼ 1", "NEW" or "—". */
function Movement({ entry }: { entry: ChartEntry }) {
  if (entry.movement === null) {
    return <span className="chip text-accent">NEW</span>;
  }
  if (entry.movement === 0) {
    return <span className="font-mono text-[11px] text-muted">—</span>;
  }
  const up = entry.movement > 0;
  return (
    <span className={`font-mono text-[11px] ${up ? "text-accent" : "text-brand"}`}>
      {up ? "▲" : "▼"} {Math.abs(entry.movement)}
    </span>
  );
}

function Sparkline({ values, label }: { values: number[]; label: string }) {
  const width = 96;
  const height = 26;
  const max = Math.max(...values, 1);
  const step = width / Math.max(values.length - 1, 1);

  const points = values
    .map((v, i) => `${(i * step).toFixed(1)},${(height - (v / max) * (height - 3) - 1.5).toFixed(1)}`)
    .join(" ");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <polyline
        points={points}
        fill="none"
        stroke="var(--brand)"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

const MEDAL = ["1st", "2nd", "3rd"];

/**
 * The public weekly national chart.
 *
 * The top three read as a podium; the full table underneath is what a radio MD
 * actually scans — movement, the 14-day curve, and where a record is working.
 */
export function NationalCharts({ chart }: NationalChartsProps) {
  const podium = chart.entries.slice(0, 3);
  const rest = chart.entries.slice(3);

  return (
    <div className="flex flex-col gap-4 pb-8">
      <section className="panel p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Uganda national airplay chart</h2>
            <p className="mt-1 text-xs text-muted">
              {chart.weekLabel} · ranked by verified spins across the FM panel over the last seven
              reporting days.
            </p>
          </div>

          <dl className="grid grid-cols-3 gap-3 text-center">
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-muted">Entries</dt>
              <dd className="font-mono text-lg">{chart.entries.length}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-muted">New</dt>
              <dd className="font-mono text-lg text-accent">{chart.newEntries}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-muted">Spins</dt>
              <dd className="font-mono text-lg">{chart.totalSpins.toLocaleString("en-UG")}</dd>
            </div>
          </dl>
        </div>

        {chart.biggestClimber ? (
          <p className="mt-3 rounded border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
            Biggest climber:{" "}
            <span className="font-medium text-foreground">{chart.biggestClimber.track.title}</span>{" "}
            — {chart.biggestClimber.track.primaryArtist}, up{" "}
            {chart.biggestClimber.movement} to #{chart.biggestClimber.rank}.
          </p>
        ) : null}
      </section>

      {/* Podium */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Top three">
        {podium.map((entry, i) => (
          <article key={entry.track.id} className="panel p-4">
            <div className="flex items-start justify-between gap-2">
              <span className="chip text-brand">{MEDAL[i]}</span>
              <Movement entry={entry} />
            </div>
            <h3 className="mt-2 text-base font-semibold tracking-tight">{entry.track.title}</h3>
            <p className="mt-0.5 text-xs text-muted">
              {entry.track.primaryArtist}
              {entry.track.featuredArtists.length > 0
                ? ` ft ${entry.track.featuredArtists.join(", ")}`
                : ""}
            </p>
            <div className="mt-3">
              <Sparkline
                values={entry.trend}
                label={`14-day spin curve for ${entry.track.title}`}
              />
            </div>
            <p className="mt-2 font-mono text-xs text-muted">
              {entry.spins7d.toLocaleString("en-UG")} spins · {entry.dominantRegion} led
            </p>
          </article>
        ))}
      </section>

      {/* Full chart */}
      <section className="panel p-4" aria-labelledby="full-chart-heading">
        <h2 id="full-chart-heading" className="text-sm font-semibold tracking-tight">
          Full chart
        </h2>

        {rest.length === 0 ? (
          <p className="mt-4 rounded border border-dashed border-line px-4 py-8 text-center text-xs text-muted">
            Only the podium charted this week.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-xs">
              <thead>
                <tr className="text-left text-muted">
                  <th scope="col" className="px-2 py-2 font-medium">#</th>
                  <th scope="col" className="px-2 py-2 font-medium">Move</th>
                  <th scope="col" className="px-2 py-2 font-medium">Track</th>
                  <th scope="col" className="px-2 py-2 font-medium">Region</th>
                  <th scope="col" className="px-2 py-2 font-medium">14 days</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Spins</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">W/w</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Weeks</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Peak</th>
                </tr>
              </thead>
              <tbody>
                {rest.map((entry) => (
                  <tr key={entry.track.id} className="border-t border-line">
                    <td className="px-2 py-2 font-mono text-muted">{entry.rank}</td>
                    <td className="px-2 py-2">
                      <Movement entry={entry} />
                    </td>
                    <td className="px-2 py-2">
                      <span className="font-medium text-foreground">{entry.track.title}</span>
                      <span className="ml-1.5 text-muted">{entry.track.primaryArtist}</span>
                    </td>
                    <td className="px-2 py-2 text-muted">{entry.dominantRegion}</td>
                    <td className="px-2 py-2">
                      <Sparkline values={entry.trend} label={`14-day curve, ${entry.track.title}`} />
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {entry.spins7d.toLocaleString("en-UG")}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {entry.changePct === null ? "—" : formatPercent(entry.changePct, 0)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">{entry.weeksOnChart}</td>
                    <td className="px-2 py-2 text-right font-mono">{entry.peakPosition}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="pb-2 text-center text-[11px] text-muted">
        Chart positions are computed from the simulated national airplay model. Peak position is a
        fixture — the prototype keeps only fourteen days of history. No public chart is published
        outside this dashboard.
      </p>
    </div>
  );
}
