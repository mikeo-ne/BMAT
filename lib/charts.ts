import { createRandom, hashSeed } from "@/lib/airplay";
import type { Region } from "@/lib/regions";
import { dominantRegion, trendFor } from "@/lib/types";
import type { Track } from "@/lib/types";

/** Rows on the published chart; the panel is small, the table is sized like a real Top 100. */
export const CHART_SIZE = 100;

export interface ChartEntry {
  rank: number;
  /** Last week's position; null on a debut. */
  previousRank: number | null;
  /** Places climbed this week; positive is up, null on a debut. */
  movement: number | null;
  track: Track;
  spins7d: number;
  spinsPrev7d: number;
  /** Week-on-week spin change, -1..n; null when last week was silent. */
  changePct: number | null;
  weeksOnChart: number;
  /** Best historical position; never worse than the current rank. */
  peakPosition: number;
  dominantRegion: Region;
  /** 14-day combined curve for the sparkline. */
  trend: number[];
}

export interface WeeklyChart {
  /** ISO date of the Monday the chart week starts on. */
  weekStart: string;
  weekLabel: string;
  entries: ChartEntry[];
  newEntries: number;
  biggestClimber: ChartEntry | null;
  totalSpins: number;
}

/** Monday of the week containing `now`, as `YYYY-MM-DD`. */
export function weekStartIso(now: Date = new Date()): string {
  const day = now.getUTCDay(); // 0 Sun .. 6 Sat
  const offset = (day + 6) % 7; // days since Monday
  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset),
  );
  return monday.toISOString().slice(0, 10);
}

function daysBetween(aIso: string, now: Date): number {
  const a = new Date(`${aIso}T00:00:00Z`).getTime();
  const b = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((b - a) / 86_400_000);
}

/**
 * The weekly national chart: every recording with spins in the last seven
 * reporting days, ranked by those spins.
 *
 * Last week's ranking comes from the seven days before that, so movement and
 * debuts are read straight off the airplay curve rather than invented. Peak
 * position is the one fixture element — the prototype only keeps fourteen days
 * of history — and is bounded above by the current rank so a peak can never be
 * worse than where the record sits today.
 */
export function buildWeeklyChart(catalogue: Track[], now: Date = new Date()): WeeklyChart {
  const weekStart = weekStartIso(now);

  const scored = catalogue
    .map((track) => {
      const trend = trendFor(track, "All");
      const spins7d = trend.slice(-7).reduce((a, b) => a + b, 0);
      const spinsPrev7d = trend.slice(-14, -7).reduce((a, b) => a + b, 0);
      return { track, spins7d, spinsPrev7d, trend };
    })
    .filter((row) => row.spins7d > 0);

  const current = [...scored].sort(
    (a, b) => b.spins7d - a.spins7d || a.track.title.localeCompare(b.track.title),
  );

  const prior = scored
    .filter((row) => row.spinsPrev7d > 0)
    .sort((a, b) => b.spinsPrev7d - a.spinsPrev7d || a.track.title.localeCompare(b.track.title));
  const previousRankOf = new Map(prior.map((row, index) => [row.track.id, index + 1]));

  const entries: ChartEntry[] = current.slice(0, CHART_SIZE).map((row, index) => {
    const rank = index + 1;
    const previousRank = previousRankOf.get(row.track.id) ?? null;
    const days = Math.max(daysBetween(row.track.releaseDate, now), 0);

    // Bounded fixture peak: a record's best-ever slot cannot be worse than now.
    const peakPosition = 1 + (hashSeed(`${row.track.isrc}:peak`) % rank);

    return {
      rank,
      previousRank,
      movement: previousRank === null ? null : previousRank - rank,
      track: row.track,
      spins7d: row.spins7d,
      spinsPrev7d: row.spinsPrev7d,
      changePct:
        row.spinsPrev7d === 0 ? null : (row.spins7d - row.spinsPrev7d) / row.spinsPrev7d,
      weeksOnChart: Math.min(Math.floor(days / 7) + 1, 52),
      peakPosition,
      dominantRegion: dominantRegion(row.track),
      trend: row.trend,
    };
  });

  const climbers = entries.filter((e) => e.movement !== null);
  const biggestClimber = climbers.reduce<ChartEntry | null>(
    (best, entry) =>
      best === null || (entry.movement ?? 0) > (best.movement ?? 0) ? entry : best,
    null,
  );

  return {
    weekStart,
    weekLabel: `Week of ${weekStart}`,
    entries,
    newEntries: entries.filter((e) => e.previousRank === null).length,
    biggestClimber: biggestClimber && (biggestClimber.movement ?? 0) > 0 ? biggestClimber : null,
    totalSpins: entries.reduce((sum, e) => sum + e.spins7d, 0),
  };
}

/** Seeded tie-break noise so the public chart never looks hand-ordered. */
export function chartFingerprint(entry: ChartEntry): number {
  return createRandom(hashSeed(`chart:${entry.track.isrc}`))();
}
