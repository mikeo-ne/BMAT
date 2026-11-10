/**
 * Reach & impressions.
 *
 * The rule this file exists to enforce: an impression is only computed when a
 * station has supplied an audience figure and we know where it came from.
 * Everything else is reported as "no audience data" — never as a plausible
 * number. Methodology: docs/reach-methodology.md.
 *
 *   impressions = AQH × (music seconds aired / 900)
 *
 * AQH is average quarter-hour listeners, the unit Ugandan stations already sell
 * advertising in, so the figure can come from the station's own survey or its
 * agency rate card rather than from us guessing.
 */

export const QUARTER_HOUR_SEC = 900; // 15 minutes
export const FALLBACK_TRACK_SEC = 210; // 3:30, only used when durations are missing

export type ReachRow = {
  station: string;
  region: string;
  kind: "radio" | "tv";
  spins: number;
  listenSeconds: number;
  aqh: number | null;
  audienceSource: string | null;
  audienceAsOf: string | null;
};

export type ReachSummary = {
  stations: number;
  withAudience: number;
  coverage: number; // % of stations carrying an audience figure
  impressions: number;
  playsCovered: number; // plays on stations with audience data
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

/**
 * Estimated impressions for one station's month.
 * Returns null — not 0 — when there is no declared audience, so callers can say
 * "no data" instead of "nobody listened".
 */
export function stationImpressions(listenSeconds: number, aqh: number | null, spins: number): number | null {
  if (aqh === null || aqh === undefined) return null;
  const audience = num(aqh);
  if (audience === 0) return 0;
  const seconds = num(listenSeconds) || num(spins) * FALLBACK_TRACK_SEC;
  return Math.round(audience * (seconds / QUARTER_HOUR_SEC));
}

/** Sum only the stations we can defend, and say how much of the panel that is. */
export function summariseReach(rows: readonly ReachRow[] | null | undefined): ReachSummary {
  const list = Array.isArray(rows) ? rows : [];
  let impressions = 0;
  let playsCovered = 0;
  let withAudience = 0;
  for (const r of list) {
    const estimate = stationImpressions(r.listenSeconds, r.aqh, r.spins);
    if (estimate === null) continue;
    withAudience += 1;
    impressions += estimate;
    playsCovered += num(r.spins);
  }
  return {
    stations: list.length,
    withAudience,
    coverage: list.length ? Math.round((withAudience / list.length) * 100) : 0,
    impressions,
    playsCovered,
  };
}

/** Compact display: 1.2M, 850k, 12,400. */
export function fmtReach(n: number): string {
  const v = Math.max(0, Math.round(num(n)));
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}M`;
  if (v >= 10_000) return `${Math.round(v / 1000)}k`;
  return v.toLocaleString("en-GB");
}

/** The one-line caveat that must sit next to any impressions number. */
export function reachCaveat(summary: ReachSummary): string {
  if (summary.withAudience === 0) {
    return "No station has supplied an audience figure yet, so no impressions are shown. Ask the broadcaster for its AQH survey (or agency rate card) to start.";
  }
  if (summary.withAudience < summary.stations) {
    return `Estimated reach, not a measurement: ${summary.withAudience} of ${summary.stations} stations have a declared audience figure. Stations without one are excluded, not guessed.`;
  }
  return "Estimated reach from broadcaster-declared audience figures (AQH). Estimates, not a panel measurement — see the methodology.";
}
