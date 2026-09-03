import { FM_STATIONS, REGIONS, stationsForRegion, type Region } from "@/lib/regions";
import type { RegionAirplay } from "@/lib/types";

/**
 * Airplay model.
 *
 * Spin logs arrive from each station's playout system; until that ingest feed is
 * live, this module derives a deterministic, plausible 14-day panel read-out
 * from the track identity + release date. Every function here is pure and seeded,
 * so the same track always produces the same numbers — the catalog never
 * re-shuffles between requests.
 */

const TREND_DAYS = 14;

/** Stable 32-bit string hash (FNV-1a). */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, deterministic PRNG. */
export function createRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GenerateAirplayInput {
  /** Anything unique and stable about the track (id or ISRC works). */
  seed: string;
  /** ISO yyyy-mm-dd. Newer releases skew toward a rising curve, older ones decay. */
  releaseDate: string;
  /** Today, injectable for tests. */
  now?: Date;
}

/**
 * Baseline regional weighting derived from the reach of each region's panel.
 * Central carries the biggest audience, so it normally reports the most spins.
 */
export function regionReach(region: Region): number {
  return stationsForRegion(region).reduce((sum, s) => sum + s.reach, 0);
}

export function regionShare(region: Region): number {
  const total = REGIONS.reduce((sum, r) => sum + regionReach(r), 0);
  return total === 0 ? 0 : regionReach(region) / total;
}

function daysSinceRelease(releaseDate: string, now: Date): number {
  const release = new Date(`${releaseDate}T00:00:00Z`);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (Number.isNaN(release.getTime())) return 30;
  return Math.round((today.getTime() - release.getTime()) / 86_400_000);
}

/**
 * How hard a record is being pushed at this point in its campaign, as a
 * multiplier on total spins. A record released today has barely accumulated
 * plays, one six weeks in is at peak, and catalogue decays slowly after that.
 */
export function campaignFactor(ageDays: number): number {
  if (ageDays < 0) return 0.15; // pre-release promo only
  if (ageDays < 7) return 0.35 + ageDays * 0.09; // launch ramp
  if (ageDays < 45) return 1; // peak campaign
  return Math.max(0.28, 1 - (ageDays - 45) * 0.006); // catalogue decay
}

/**
 * Daily shape across the reporting window: a launch ramp for fresh releases,
 * a plateau mid-campaign, and a decay tail for older catalogue — with per-day
 * noise on top, because rotation never plays a record the same number of times
 * two days running.
 */
function dailyWeights(ageDays: number, rand: () => number): number[] {
  const weights: number[] = [];

  for (let i = 0; i < TREND_DAYS; i++) {
    const dayFromNow = TREND_DAYS - 1 - i; // 13 = oldest day in window
    const campaignDay = ageDays - dayFromNow;

    let w: number;
    if (campaignDay < 0) {
      w = 0.08; // pre-release promo/leak trickle
    } else if (campaignDay < 10) {
      w = 0.35 + campaignDay * 0.09; // launch ramp
    } else if (campaignDay < 45) {
      w = 1.1 - (campaignDay - 10) * 0.004; // plateau
    } else {
      w = Math.max(0.15, 0.96 - (campaignDay - 45) * 0.006); // catalogue decay
    }

    weights.push(Math.max(0.05, w * (0.72 + rand() * 0.56)));
  }

  return weights;
}

export function generateAirplay(input: GenerateAirplayInput): RegionAirplay[] {
  const now = input.now ?? new Date();
  const ageDays = daysSinceRelease(input.releaseDate, now);
  const rand = createRandom(hashSeed(input.seed));

  // Per-track overall heat: how hard the panel is pushing this record.
  const heat = 0.35 + rand() * 0.9;

  return REGIONS.map((region) => {
    const stations = stationsForRegion(region);
    if (stations.length === 0) {
      return { region, spins: 0, stations: 0, audience: 0, trend: Array(TREND_DAYS).fill(0) };
    }

    const weights = dailyWeights(ageDays, rand);
    const weightSum = weights.reduce((a, b) => a + b, 0);

    // Bigger panel + more reach => more spins, with per-region variance.
    const base = regionShare(region) * FM_STATIONS.length * 92 * heat;
    const regionScale = 0.72 + rand() * 0.62;
    const target = Math.max(6, Math.round(base * regionScale * campaignFactor(ageDays)));

    const trend = weights.map((w) => Math.max(0, Math.round((target * w) / weightSum)));

    // Guarantee a visible signal on the busiest day of the window.
    const spins = trend.reduce((a, b) => a + b, 0);
    if (spins === 0 && trend.length > 0) {
      trend[trend.length - 1] = 1;
    }

    const reporting = Math.max(
      1,
      Math.round(stations.length * (0.45 + rand() * 0.5)),
    );

    const activeStations = stations.slice(0, reporting);
    const reachOfReporting = activeStations.reduce((s, st) => s + st.reach, 0);
    const audience = Math.round(
      (spins / Math.max(1, reporting)) * (reachOfReporting / Math.max(1, reporting)) * 0.018,
    );

    return {
      region,
      spins: trend.reduce((a, b) => a + b, 0),
      stations: reporting,
      audience,
      trend,
    };
  });
}

export function totalSpins(airplay: RegionAirplay[]): number {
  return airplay.reduce((sum, r) => sum + r.spins, 0);
}

export function reportingStations(airplay: RegionAirplay[]): number {
  return airplay.reduce((sum, r) => sum + r.stations, 0);
}

/** Combined 14-day curve for one region across every supplied track. */
export function combinedTrend(entries: RegionAirplay[]): number[] {
  const length = Math.max(0, ...entries.map((e) => e.trend.length));
  return Array.from({ length }, (_, i) => entries.reduce((sum, e) => sum + (e.trend[i] ?? 0), 0));
}
