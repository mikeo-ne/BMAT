import { createRandom, hashSeed } from "@/lib/airplay";
import type { Hub, Region } from "@/lib/regions";
import type { Track } from "@/lib/types";

/* -------------------------------------------------------------------------- */
/* Hubs                                                                        */
/* -------------------------------------------------------------------------- */

export type MarketTier = "primary" | "secondary" | "cross-border";

export interface GeoHub {
  id: string;
  /** Display name, matching the Ugandan station hubs where one exists. */
  name: Hub | "Nairobi" | "Dar es Salaam";
  country: "Uganda" | "Kenya" | "Tanzania";
  /** Ugandan reporting region; null outside Uganda. */
  region: Region | null;
  tier: MarketTier;
  /** Reporting stations feeding the hub. */
  stations: number;
  /** Approximate metro reach, people. */
  reach: number;
  /** Rough longitude/latitude, for the SVG plot. */
  lon: number;
  lat: number;
}

/**
 * The hubs BMAT reads airplay across — the five Ugandan cities the panel is
 * worked to, plus the two cross-border markets Ugandan records break into first.
 */
export const GEO_HUBS: GeoHub[] = [
  { id: "kla", name: "Kampala", country: "Uganda", region: "Central", tier: "primary", stations: 14, reach: 3_500_000, lon: 32.58, lat: 0.31 },
  { id: "jin", name: "Jinja", country: "Uganda", region: "Eastern", tier: "secondary", stations: 2, reach: 320_000, lon: 33.2, lat: 0.44 },
  { id: "mbr", name: "Mbarara", country: "Uganda", region: "Western", tier: "secondary", stations: 3, reach: 410_000, lon: 30.66, lat: -0.61 },
  { id: "gul", name: "Gulu", country: "Uganda", region: "Northern", tier: "secondary", stations: 3, reach: 290_000, lon: 32.3, lat: 2.77 },
  { id: "mba", name: "Mbale", country: "Uganda", region: "Eastern", tier: "secondary", stations: 2, reach: 260_000, lon: 34.18, lat: 1.08 },
  { id: "nbo", name: "Nairobi", country: "Kenya", region: null, tier: "cross-border", stations: 4, reach: 5_100_000, lon: 36.82, lat: -1.29 },
  { id: "dar", name: "Dar es Salaam", country: "Tanzania", region: null, tier: "cross-border", stations: 3, reach: 6_700_000, lon: 39.28, lat: -6.79 },
];

export const UGANDA_HUBS = GEO_HUBS.filter((h) => h.country === "Uganda");
export const CROSS_BORDER_HUBS = GEO_HUBS.filter((h) => h.country !== "Uganda");

export function hubById(id: string): GeoHub | undefined {
  return GEO_HUBS.find((h) => h.id === id);
}

export const TIER_LABEL: Record<MarketTier, string> = {
  primary: "Primary market",
  secondary: "Secondary market",
  "cross-border": "Cross-border",
};

/* -------------------------------------------------------------------------- */
/* Hub metrics                                                                 */
/* -------------------------------------------------------------------------- */

export interface HubMetric {
  hub: GeoHub;
  /** Spins across the catalogue in the last 7 reporting days. */
  spins7d: number;
  /** Spins in the 7 days before that. */
  spinsPrev7d: number;
  /** Growth rate, -1..n. Null when the previous week was silent. */
  growthRate: number | null;
  /** Streaming-search index, 0-100, relative to the leading hub. */
  searchIndex: number;
  /** Week-on-week movement in the search index, -1..n. */
  searchGrowth: number | null;
  /** Tracks reporting from the hub. */
  tracks: number;
}

/** Share of a region's spins a hub carries, by reach within its region. */
function hubWeight(hub: GeoHub): number {
  if (hub.region) {
    const peers = UGANDA_HUBS.filter((h) => h.region === hub.region);
    const total = peers.reduce((sum, h) => sum + h.reach, 0);
    return total === 0 ? 0 : hub.reach / total;
  }
  // Cross-border demand is a fraction of the Kampala read, scaled by reach.
  const kampala = GEO_HUBS[0];
  return 0.12 + 0.1 * (hub.reach / kampala.reach);
}

export function buildHubMetrics(catalogue: Track[]): HubMetric[] {
  return GEO_HUBS.map((hub) => {
    const rand = createRandom(hashSeed(`hub:${hub.id}`));
    const regionEntry = hub.region;

    let spins7d = 0;
    let spinsPrev7d = 0;
    let tracks = 0;

    for (const track of catalogue) {
      const airplay = regionEntry
        ? track.airplay.find((a) => a.region === regionEntry)
        : track.airplay.reduce(
            (best, a) => (a.spins > best.spins ? a : best),
            track.airplay[0] ?? { spins: 0, trend: Array.from({ length: 14 }, () => 0) },
          );

      if (!airplay) continue;

      const weight = hubWeight(hub);
      const recent = airplay.trend.slice(-7).reduce((a, b) => a + b, 0);
      const prior = airplay.trend.slice(-14, -7).reduce((a, b) => a + b, 0);

      // Cross-border hubs are deliberately noisier — a record either lands or it
      // does not, rather than tracking Kampala week to week.
      const jitter = regionEntry ? 1 : 0.55 + rand() * 1.3;

      spins7d += Math.round(recent * weight * jitter);
      spinsPrev7d += Math.round(prior * weight * jitter);
      if (recent * weight > 0) tracks += 1;
    }

    const searchIndex = Math.min(
      100,
      Math.round((spins7d / Math.max(1, GEO_HUBS[0].stations)) * 0.9 + rand() * 12),
    );

    return {
      hub,
      spins7d,
      spinsPrev7d,
      growthRate: spinsPrev7d === 0 ? (spins7d > 0 ? null : 0) : (spins7d - spinsPrev7d) / spinsPrev7d,
      searchIndex,
      searchGrowth: spinsPrev7d === 0 ? null : (searchIndex / 60 - 1) * 0.8,
      tracks,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Track velocity                                                              */
/* -------------------------------------------------------------------------- */

export interface VelocityPoint {
  /** Day label, e.g. "Mon". */
  label: string;
  /** Radio spins that day. */
  spins: number;
  /** Streaming-search index that day, 0-100. */
  search: number;
}

export interface TrackVelocity {
  trackId: string;
  title: string;
  primaryArtist: string;
  /** Radio spin growth over the last 7 days, -1..n. */
  spinGrowth: number | null;
  /** Streaming-search growth over the same window, -1..n. */
  searchGrowth: number | null;
  /** Spins in the gap between the two curves — radio leading is positive. */
  radioLead: number | null;
  series: VelocityPoint[];
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Compare a track's radio spin growth against its streaming-search trend.
 *
 * Radio leading search usually means the record is being pushed rather than
 * pulled; search leading radio is the shape an organic breakout takes.
 */
export function buildVelocity(track: Track): TrackVelocity {
  const rand = createRandom(hashSeed(`velocity:${track.isrc}`));
  const trend = track.airplay.reduce<number[]>(
    (acc, entry) => entry.trend.map((v, i) => (acc[i] ?? 0) + v),
    Array.from({ length: 14 }, () => 0),
  );

  const last7 = trend.slice(-7);
  const prior7 = trend.slice(-14, -7);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  const series: VelocityPoint[] = last7.map((spins, i) => {
    // Search lags radio by a day or two and is noisier.
    const lagged = last7[Math.max(i - 1, 0)] ?? spins;
    const search = Math.max(
      2,
      Math.min(100, Math.round(lagged * 1.6 + rand() * 18 + (spins > lagged ? -6 : 4))),
    );
    return { label: DAY_LABELS[i], spins, search };
  });

  const priorSum = sum(prior7);
  const recentSum = sum(last7);
  const searchNow = series[series.length - 1]?.search ?? 0;
  const searchThen = series[0]?.search ?? 0;

  return {
    trackId: track.id,
    title: track.title,
    primaryArtist: track.primaryArtist,
    spinGrowth: priorSum === 0 ? (recentSum > 0 ? null : 0) : (recentSum - priorSum) / priorSum,
    searchGrowth: searchThen === 0 ? null : (searchNow - searchThen) / searchThen,
    radioLead: searchThen === 0 ? null : (recentSum / priorSum) - (searchNow / searchThen),
    series,
  };
}

/* -------------------------------------------------------------------------- */
/* A&R hit predictor                                                           */
/* -------------------------------------------------------------------------- */

/** Spins in a secondary market over a week that qualify a track as emerging. */
export const EMERGING_SPIN_FLOOR = 50;

export interface HitCandidate {
  trackId: string;
  title: string;
  primaryArtist: string;
  genre: string;
  /** Strongest secondary market. */
  breakoutHub: GeoHub;
  secondarySpins: number;
  kampalaSpins: number;
  /** Secondary spins per Kampala spin; higher means further from breaking. */
  ratio: number;
  /** 0-100 likelihood of crossing into Kampala main rotation. */
  score: number;
  verdict: "breaking-now" | "watch" | "early";
}

/**
 * Emerging regional tracks: over `EMERGING_SPIN_FLOOR` spins this week in a
 * secondary market while Kampala has not yet picked the record up.
 *
 * This is the classic Ugandan break pattern — a record works Gulu, Mbale or
 * Mbarara for two or three weeks before Kampala stations add it.
 */
export function buildHitPredictor(catalogue: Track[]): HitCandidate[] {
  const kampala = GEO_HUBS[0];

  const candidates = catalogue
    .map((track) => {
      const secondary = UGANDA_HUBS.filter((h) => h.tier === "secondary")
        .map((hub) => {
          const region = hub.region ? track.airplay.find((a) => a.region === hub.region) : null;
          const spins = region
            ? Math.round(region.trend.slice(-7).reduce((a, b) => a + b, 0) * hubWeight(hub))
            : 0;
          return { hub, spins };
        })
        .sort((a, b) => b.spins - a.spins)[0];

      const central = track.airplay.find((a) => a.region === "Central");
      const kampalaSpins = central
        ? Math.round(central.trend.slice(-7).reduce((a, b) => a + b, 0) * hubWeight(kampala))
        : 0;

      if (!secondary || secondary.spins < EMERGING_SPIN_FLOOR) return null;

      const ratio = secondary.spins / Math.max(kampalaSpins, 1);
      // A record strong in the regions but absent from Kampala scores highest.
      const score = Math.round(Math.min(100, (secondary.spins / 220) * 55 + Math.min(ratio, 4) * 11));
      const verdict: HitCandidate["verdict"] =
        ratio < 0.6 ? "breaking-now" : ratio < 1.8 ? "watch" : "early";

      return {
        trackId: track.id,
        title: track.title,
        primaryArtist: track.primaryArtist,
        genre: track.genre ?? "—",
        breakoutHub: secondary.hub,
        secondarySpins: secondary.spins,
        kampalaSpins,
        ratio,
        score,
        verdict,
      };
    })
    .filter((c): c is HitCandidate => c !== null);

  return candidates.sort((a, b) => b.score - a.score);
}

export const VERDICT_LABEL: Record<HitCandidate["verdict"], string> = {
  "breaking-now": "Breaking into Kampala",
  watch: "Watch",
  early: "Early signal",
};
