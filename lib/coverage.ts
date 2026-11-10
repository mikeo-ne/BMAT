/**
 * Public coverage — the answer to "how much of the country are you really
 * listening to?".
 *
 * Global monitoring services sell a country average; our whole claim is
 * density inside one country, region by region. These helpers keep the numbers
 * honest: unknown shapes collapse to null (the page then falls back to sample
 * data, clearly labelled), and regions always render in the same order so
 * upcountry coverage is never hidden behind Kampala.
 */

export type RegionCoverage = { region: string; stations: number; monitored: number; live: number };

export type Coverage = {
  stations: number;
  monitored: number;
  live: number;
  regions: RegionCoverage[];
  lastHeartbeat: string | null;
  lastDetection: string | null;
};

export const REGION_ORDER = ["Central", "Western", "Eastern", "Northern"] as const;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

/** Anything malformed becomes null — a marketing page must never invent data. */
export function normaliseCoverage(raw: unknown): Coverage | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.regions)) return null;
  const regions = (r.regions as unknown[])
    .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
    .map((x) => ({
      region: String(x.region ?? "Unspecified"),
      stations: num(x.stations),
      monitored: num(x.monitored),
      live: num(x.live),
    }))
    .filter((x) => x.stations > 0);
  return {
    stations: num(r.stations),
    monitored: num(r.monitored),
    live: num(r.live),
    regions: orderRegions(regions),
    lastHeartbeat: typeof r.last_heartbeat === "string" ? r.last_heartbeat : null,
    lastDetection: typeof r.last_detection === "string" ? r.last_detection : null,
  };
}

/** Kampala first only because it is alphabetical there; every region is kept. */
export function orderRegions(regions: RegionCoverage[]): RegionCoverage[] {
  const rank = (name: string) => {
    const i = (REGION_ORDER as readonly string[]).indexOf(name);
    return i === -1 ? REGION_ORDER.length : i;
  };
  return [...regions].sort((a, b) => rank(a.region) - rank(b.region) || a.region.localeCompare(b.region));
}

/** Percentage of the panel that is reporting right now (0–100, integer). */
export function shareMonitored(c: Coverage): number {
  if (!c.stations) return 0;
  return Math.round((c.monitored / c.stations) * 100);
}

/** What the page shows before (or without) a live project: clearly a sample. */
export const DEMO_COVERAGE: Coverage = {
  stations: 28,
  monitored: 25,
  live: 25,
  regions: [
    { region: "Central", stations: 21, monitored: 18, live: 18 },
    { region: "Western", stations: 2, monitored: 2, live: 2 },
    { region: "Eastern", stations: 4, monitored: 4, live: 4 },
    { region: "Northern", stations: 1, monitored: 1, live: 1 },
  ],
  lastHeartbeat: null,
  lastDetection: null,
};
