import { campaignFactor } from "@/lib/airplay";
import { formatPeriod, lastNMonths, periodStartIso } from "@/lib/format";
import { hashSeed, createRandom } from "@/lib/airplay";
import { FM_STATIONS, REGIONS, stationsForRegion, type Region } from "@/lib/regions";
import type { Track } from "@/lib/types";

/**
 * UPRS (Uganda Performing Right Society) audit model.
 *
 * Takes the delivered catalogue and its regional airplay, expands it into a
 * month-by-month station-level play ledger, splits each play between the rights
 * holders on the recording, and prices it against a flat per-play tariff.
 *
 * IMPORTANT: the tariff rates, the distribution split and the UGX/USD rate below
 * are placeholders chosen to make the arithmetic visible end to end. They are
 * NOT the published UPRS tariff. Replace `TARIFF`, `DISTRIBUTION_POLICY` and
 * `UGX_PER_USD` with the values from the current UPRS licensing schedule before
 * any figure here is shown to a member or a licensee.
 */

export const CMO_NAME = "UPRS";
export const CMO_FULL_NAME = "Uganda Performing Right Society";

/** Indicative conversion for display only. */
export const UGX_PER_USD = 3_720;

/* -------------------------------------------------------------------------- */
/* Membership                                                                  */
/* -------------------------------------------------------------------------- */

export interface UprsMember {
  memberId: string;
  name: string;
  /** Catalogue works the member appears on, as primary or featured artist. */
  works: number;
}

/** Stable member id derived from the name, so re-runs never renumber members. */
export function memberIdFor(name: string): string {
  const n = hashSeed(`uprs:${name.trim().toLowerCase()}`) % 100_000;
  return `UPRS-${String(n).padStart(5, "0")}`;
}

export function buildMembers(catalogue: Track[]): UprsMember[] {
  const works = new Map<string, number>();

  for (const track of catalogue) {
    for (const name of [track.primaryArtist, ...track.featuredArtists]) {
      const key = name.trim();
      if (!key) continue;
      works.set(key, (works.get(key) ?? 0) + 1);
    }
  }

  return [...works.entries()]
    .map(([name, count]) => ({ memberId: memberIdFor(name), name, works: count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* -------------------------------------------------------------------------- */
/* Distribution policy                                                         */
/* -------------------------------------------------------------------------- */

export interface DistributionPolicy {
  /** Share of a recording's performing right going to the primary artist. */
  primaryShare: number;
  /** Remainder, split equally between featured artists. */
  featuredShare: number;
}

export const DISTRIBUTION_POLICY: DistributionPolicy = {
  primaryShare: 0.6,
  featuredShare: 0.4,
};

/** Per-artist share of one recording's plays under the policy. */
export function sharesFor(track: Track): { name: string; share: number }[] {
  const features = track.featuredArtists.map((f) => f.trim()).filter(Boolean);

  if (features.length === 0) {
    return [{ name: track.primaryArtist, share: 1 }];
  }

  const perFeature = DISTRIBUTION_POLICY.featuredShare / features.length;
  return [
    { name: track.primaryArtist, share: DISTRIBUTION_POLICY.primaryShare },
    ...features.map((name) => ({ name, share: perFeature })),
  ];
}

/* -------------------------------------------------------------------------- */
/* Tariff                                                                      */
/* -------------------------------------------------------------------------- */

export type StationTier = "national" | "regional" | "community" | "television";

export interface TariffRate {
  tier: StationTier;
  label: string;
  ugxPerPlay: number;
}

/** Flat per-play rates. Placeholders — see the note at the top of this file. */
export const TARIFF: Record<StationTier, TariffRate> = {
  national: { tier: "national", label: "National FM", ugxPerPlay: 450 },
  regional: { tier: "regional", label: "Regional FM", ugxPerPlay: 300 },
  community: { tier: "community", label: "Community FM", ugxPerPlay: 180 },
  television: { tier: "television", label: "Television", ugxPerPlay: 620 },
};

export function tierFor(reach: number, medium: "FM" | "TV" = "FM"): StationTier {
  if (medium === "TV") return "television";
  if (reach >= 1_000_000) return "national";
  if (reach >= 400_000) return "regional";
  return "community";
}

export function rateFor(reach: number, medium: "FM" | "TV" = "FM"): TariffRate {
  return TARIFF[tierFor(reach, medium)];
}

/* -------------------------------------------------------------------------- */
/* Play ledger                                                                 */
/* -------------------------------------------------------------------------- */

export interface PlayRow {
  id: string;
  memberId: string;
  artist: string;
  isrc: string;
  title: string;
  stationId: string;
  station: string;
  tier: StationTier;
  region: Region;
  /** "YYYY-MM" */
  period: string;
  /** This member's allocated share of the station's plays that month. */
  plays: number;
  share: number;
  ugxPerPlay: number;
  allocationUgx: number;
}

/** The 14-day reporting window the airplay model produces, in months. */
const WINDOW_MONTHS = 30 / 14;

function ageDaysOn(releaseDate: string, iso: string): number {
  const release = new Date(`${releaseDate}T00:00:00Z`);
  const at = new Date(iso);
  if (Number.isNaN(release.getTime()) || Number.isNaN(at.getTime())) return 30;
  return Math.round((at.getTime() - release.getTime()) / 86_400_000);
}

/**
 * Expands the catalogue into a station-level monthly ledger.
 *
 * Regional 14-day spins are annualised to a month, then scaled by the campaign
 * factor for that month relative to today, so a record's history peaks around
 * release and decays as catalogue. Each region's monthly total is then split
 * across its reporting stations in proportion to their reach.
 */
export function buildPlayLedger(input: {
  catalogue: Track[];
  now?: Date;
  months?: number;
}): PlayRow[] {
  const now = input.now ?? new Date();
  const months = input.months ?? 6;
  const periods = lastNMonths(months, now);
  const rows: PlayRow[] = [];

  for (const track of input.catalogue) {
    const rand = createRandom(hashSeed(`uprs-ledger:${track.isrc}`));
    const shares = sharesFor(track);
    const nowFactor = Math.max(0.05, campaignFactor(ageDaysOn(track.releaseDate, now.toISOString())));

    for (const period of periods) {
      const periodIso = periodStartIso(period);
      const ageDays = ageDaysOn(track.releaseDate, periodIso);

      // Nothing accrues before release.
      if (ageDays < 0) continue;

      const scale = campaignFactor(ageDays) / nowFactor;

      for (const region of REGIONS) {
        const regional = track.airplay.find((a) => a.region === region);
        if (!regional || regional.spins <= 0) continue;

        const jitter = 0.85 + rand() * 0.3;
        const regionMonthly = regional.spins * WINDOW_MONTHS * scale * jitter;

        const stations = stationsForRegion(region);
        const reachTotal = stations.reduce((s, st) => s + st.reach, 0);
        if (reachTotal === 0) continue;

        for (const station of stations) {
          const stationPlays = Math.round((regionMonthly * station.reach) / reachTotal);
          if (stationPlays <= 0) continue;

          const rate = rateFor(station.reach);

          for (const holder of shares) {
            const plays = Math.round(stationPlays * holder.share);
            if (plays <= 0) continue;

            rows.push({
              id: `${track.isrc}:${station.id}:${period}:${memberIdFor(holder.name)}`,
              memberId: memberIdFor(holder.name),
              artist: holder.name,
              isrc: track.isrc,
              title: track.title,
              stationId: station.id,
              station: station.name,
              tier: rate.tier,
              region,
              period,
              plays,
              share: holder.share,
              ugxPerPlay: rate.ugxPerPlay,
              allocationUgx: plays * rate.ugxPerPlay,
            });
          }
        }
      }
    }
  }

  return rows;
}

/* -------------------------------------------------------------------------- */
/* Filtering                                                                   */
/* -------------------------------------------------------------------------- */

export interface CmoFilters {
  stations: string[];
  regions: Region[];
  periods: string[];
  members: string[];
}

export const EMPTY_FILTERS: CmoFilters = {
  stations: [],
  regions: [],
  periods: [],
  members: [],
};

/** Empty array means "no constraint" — the enterprise-table convention. */
export function applyFilters(rows: PlayRow[], filters: CmoFilters): PlayRow[] {
  return rows.filter((row) => {
    if (filters.stations.length > 0 && !filters.stations.includes(row.stationId)) return false;
    if (filters.regions.length > 0 && !filters.regions.includes(row.region)) return false;
    if (filters.periods.length > 0 && !filters.periods.includes(row.period)) return false;
    if (filters.members.length > 0 && !filters.members.includes(row.memberId)) return false;
    return true;
  });
}

export function countActiveFilters(filters: CmoFilters): number {
  return (
    (filters.stations.length > 0 ? 1 : 0) +
    (filters.regions.length > 0 ? 1 : 0) +
    (filters.periods.length > 0 ? 1 : 0) +
    (filters.members.length > 0 ? 1 : 0)
  );
}

/* -------------------------------------------------------------------------- */
/* Distribution report                                                         */
/* -------------------------------------------------------------------------- */

export interface MemberAllocation {
  memberId: string;
  artist: string;
  plays: number;
  stations: number;
  works: number;
  allocationUgx: number;
  allocationUsd: number;
  shareOfPool: number;
}

export interface DistributionReport {
  generatedAt: string;
  filters: CmoFilters;
  filterSummary: string[];
  rowCount: number;
  totalPlays: number;
  stationCount: number;
  memberCount: number;
  workCount: number;
  periods: string[];
  periodLabel: string;
  royaltyPoolUgx: number;
  royaltyPoolUsd: number;
  byRate: { label: string; tier: StationTier; plays: number; ugxPerPlay: number; amountUgx: number }[];
  byRegion: { region: Region; plays: number; amountUgx: number }[];
  allocations: MemberAllocation[];
}

export function buildReport(
  rows: PlayRow[],
  filters: CmoFilters,
  generatedAt: Date = new Date(),
): DistributionReport {
  const totalPlays = rows.reduce((s, r) => s + r.plays, 0);
  const royaltyPoolUgx = rows.reduce((s, r) => s + r.allocationUgx, 0);

  const stations = new Set(rows.map((r) => r.stationId));
  const works = new Set(rows.map((r) => r.isrc));
  const periods = [...new Set(rows.map((r) => r.period))].sort();

  const rateBuckets = new Map<StationTier, { plays: number; amountUgx: number; ugxPerPlay: number }>();
  for (const row of rows) {
    const bucket = rateBuckets.get(row.tier) ?? { plays: 0, amountUgx: 0, ugxPerPlay: row.ugxPerPlay };
    bucket.plays += row.plays;
    bucket.amountUgx += row.allocationUgx;
    rateBuckets.set(row.tier, bucket);
  }

  const regionBuckets = new Map<Region, { plays: number; amountUgx: number }>();
  for (const row of rows) {
    const bucket = regionBuckets.get(row.region) ?? { plays: 0, amountUgx: 0 };
    bucket.plays += row.plays;
    bucket.amountUgx += row.allocationUgx;
    regionBuckets.set(row.region, bucket);
  }

  const perMember = new Map<string, { artist: string; plays: number; stations: Set<string>; works: Set<string>; amountUgx: number }>();
  for (const row of rows) {
    const bucket =
      perMember.get(row.memberId) ??
      { artist: row.artist, plays: 0, stations: new Set<string>(), works: new Set<string>(), amountUgx: 0 };
    bucket.plays += row.plays;
    bucket.stations.add(row.stationId);
    bucket.works.add(row.isrc);
    bucket.amountUgx += row.allocationUgx;
    perMember.set(row.memberId, bucket);
  }

  const allocations: MemberAllocation[] = [...perMember.entries()]
    .map(([memberId, b]) => ({
      memberId,
      artist: b.artist,
      plays: b.plays,
      stations: b.stations.size,
      works: b.works.size,
      allocationUgx: b.amountUgx,
      allocationUsd: b.amountUgx / UGX_PER_USD,
      shareOfPool: royaltyPoolUgx === 0 ? 0 : b.amountUgx / royaltyPoolUgx,
    }))
    .sort((a, b) => b.allocationUgx - a.allocationUgx);

  const filterSummary: string[] = [];
  filterSummary.push(
    filters.stations.length === 0
      ? "All stations"
      : `${filters.stations.length} station${filters.stations.length === 1 ? "" : "s"}`,
  );
  filterSummary.push(
    filters.regions.length === 0 ? "All regions" : filters.regions.join(", "),
  );
  filterSummary.push(
    filters.periods.length === 0
      ? `All ${periods.length || 0} periods`
      : filters.periods.map(formatPeriod).join(", "),
  );
  filterSummary.push(
    filters.members.length === 0
      ? "All members"
      : `${filters.members.length} member${filters.members.length === 1 ? "" : "s"}`,
  );

  return {
    generatedAt: generatedAt.toISOString(),
    filters,
    filterSummary,
    rowCount: rows.length,
    totalPlays,
    stationCount: stations.size,
    memberCount: perMember.size,
    workCount: works.size,
    periods,
    periodLabel:
      periods.length === 0
        ? "—"
        : periods.length === 1
          ? formatPeriod(periods[0])
          : `${formatPeriod(periods[0])} – ${formatPeriod(periods[periods.length - 1])}`,
    royaltyPoolUgx,
    royaltyPoolUsd: royaltyPoolUgx / UGX_PER_USD,
    byRate: [...rateBuckets.entries()]
      .map(([tier, b]) => ({
        tier,
        label: TARIFF[tier].label,
        ugxPerPlay: b.ugxPerPlay,
        plays: b.plays,
        amountUgx: b.amountUgx,
      }))
      .sort((a, b) => b.amountUgx - a.amountUgx),
    byRegion: REGIONS.map((region) => ({
      region,
      plays: regionBuckets.get(region)?.plays ?? 0,
      amountUgx: regionBuckets.get(region)?.amountUgx ?? 0,
    })),
    allocations,
  };
}

/* -------------------------------------------------------------------------- */
/* CSV export                                                                  */
/* -------------------------------------------------------------------------- */

const CSV_COLUMNS = [
  "Member ID",
  "Artist",
  "Recording (ISRC)",
  "Title",
  "Station",
  "Station tier",
  "Region",
  "Period",
  "Plays",
  "Rights share",
  "Rate (UGX/play)",
  "Allocation (UGX)",
  "Allocation (USD)",
] as const;

function escapeCsv(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function ledgerToCsv(rows: PlayRow[]): string {
  const header = CSV_COLUMNS.join(",");

  const body = rows.map((row) =>
    [
      row.memberId,
      row.artist,
      row.isrc,
      row.title,
      row.station,
      TARIFF[row.tier].label,
      row.region,
      row.period,
      row.plays,
      row.share.toFixed(3),
      row.ugxPerPlay,
      row.allocationUgx,
      (row.allocationUgx / UGX_PER_USD).toFixed(2),
    ]
      .map(escapeCsv)
      .join(","),
  );

  return [header, ...body].join("\r\n");
}

export function reportToCsv(report: DistributionReport): string {
  const lines: string[] = [
    `${CMO_FULL_NAME} (${CMO_NAME}) — Radio Play Distribution Report`,
    `Generated,${escapeCsv(new Date(report.generatedAt).toISOString())}`,
    `Reporting period,${escapeCsv(report.periodLabel)}`,
    `Scope,${escapeCsv(report.filterSummary.join(" | "))}`,
    `Flat-rate basis,${escapeCsv("placeholder tariff — not the published UPRS schedule")}`,
    "",
    "Summary",
    `Total plays,${report.totalPlays}`,
    `Stations,${report.stationCount}`,
    `Members,${report.memberCount}`,
    `Recordings,${report.workCount}`,
    `Royalty pool (UGX),${report.royaltyPoolUgx}`,
    `Royalty pool (USD),${report.royaltyPoolUsd.toFixed(2)}`,
    `Indicative UGX per USD,${UGX_PER_USD}`,
    "",
    "Allocation by member",
    "Member ID,Artist,Plays,Stations,Recordings,Allocation (UGX),Allocation (USD),Share of pool",
    ...report.allocations.map((a) =>
      [
        a.memberId,
        a.artist,
        a.plays,
        a.stations,
        a.works,
        a.allocationUgx,
        a.allocationUsd.toFixed(2),
        a.shareOfPool.toFixed(4),
      ]
        .map(escapeCsv)
        .join(","),
    ),
  ];

  return lines.join("\r\n");
}

export const PANEL_STATIONS = FM_STATIONS;
