import { validateDeliveryParties } from "@/lib/delivery-splits";
import { isValidIsrc } from "@/lib/isrc";
import { csvRows } from "@/lib/csv";
import {
  DEFAULT_WEIGHTING,
  TIME_BANDS,
  TIME_BAND_META,
  timeBandForHour,
  validateWeighting,
  type WeightingPolicy,
} from "@/lib/dayparts";
import { eatDate, eatHour, eatTime, type BroadcastSpin } from "@/lib/playout";
import { FM_STATIONS } from "@/lib/regions";
import type { Track } from "@/lib/types";
import { rateFor, type PlayRow } from "@/lib/uprs";

/** Monthly rows have no captured timestamps; this is an explicit modelled daypart split. */
export function weightPlayLedger(
  rows: PlayRow[],
  policy: WeightingPolicy = DEFAULT_WEIGHTING,
): PlayRow[] {
  if (!validateWeighting(policy))
    throw new RangeError("Multipliers must be finite numbers between 0 and 5.");
  return rows.flatMap((row) => {
    const counts = {
      prime: Math.floor(row.plays * 0.45),
      standard: Math.floor(row.plays * 0.4),
      night: 0,
    };
    counts.night = row.plays - counts.prime - counts.standard;
    return TIME_BANDS.filter((band) => counts[band] > 0).map((band) => ({
      ...row,
      id: `${row.id}:${band}`,
      plays: counts[band],
      timeBand: band,
      multiplier: policy[band],
      allocationUgx: Math.round(counts[band] * row.ugxPerPlay * policy[band]),
    }));
  });
}

export function priceSpin(
  spin: BroadcastSpin,
  policy: WeightingPolicy = DEFAULT_WEIGHTING,
) {
  if (!validateWeighting(policy))
    throw new RangeError("Invalid time-of-day weighting policy.");
  const timeBand = timeBandForHour(eatHour(spin.detectedAt));
  const station = FM_STATIONS.find((entry) => entry.id === spin.stationId);
  const baseRate = rateFor(station?.reach ?? 0, spin.medium).ugxPerPlay;
  const multiplier = policy[timeBand];
  return {
    timeBand,
    baseRate,
    multiplier,
    allocationUgx: spin.isrc ? Math.round(baseRate * multiplier) : 0,
  };
}

export function summariseWeightedSpins(
  spins: BroadcastSpin[],
  policy: WeightingPolicy = DEFAULT_WEIGHTING,
) {
  const bands = TIME_BANDS.map((band) => ({
    band,
    plays: 0,
    allocationUgx: 0,
    multiplier: policy[band],
  }));
  let basePoolUgx = 0;
  for (const spin of spins) {
    if (!spin.isrc) continue;
    const priced = priceSpin(spin, policy);
    const bucket = bands.find((entry) => entry.band === priced.timeBand)!;
    bucket.plays++;
    bucket.allocationUgx += priced.allocationUgx;
    basePoolUgx += priced.baseRate;
  }
  return {
    bands,
    basePoolUgx,
    weightedPoolUgx: bands.reduce((sum, entry) => sum + entry.allocationUgx, 0),
  };
}

export const LOGGING_SHEET_NOTE =
  "Review required: ingester-supplied playout records, illustrative rates and multipliers. Not an official UPRS template or certified compliance report. Verify current UPRS filing requirements before submission.";

/** Event-level logging fields. Unknown metadata stays blank, never invented. */
export function complianceLoggingCsv(
  spins: BroadcastSpin[],
  catalogue: Track[],
  policy: WeightingPolicy = DEFAULT_WEIGHTING,
  generatedAt: Date = new Date(),
): string {
  const byId = new Map(catalogue.map((track) => [track.id, track]));
  return csvRows([
    ["East Sound — UPRS review logging sheet"],
    [LOGGING_SHEET_NOTE],
    ["Generated (UTC)", generatedAt.toISOString()],
    ["Timezone", "Africa/Kampala (UTC+03:00)"],
    [
      "Weighting policy",
      `Prime ${policy.prime}x; Standard ${policy.standard}x; Night ${policy.night}x`,
    ],
    [],
    [
      "Log ID",
      "Station",
      "Medium",
      "Region",
      "Broadcast date (EAT)",
      "Start time (EAT)",
      "Duration (seconds)",
      "Recording title",
      "Performing artist",
      "Co-writers / composers",
      "Publisher",
      "ISRC",
      "ISWC",
      "Use type",
      "Time band",
      "Base rate (UGX/play)",
      "Multiplier",
      "Estimated allocation (UGX)",
      "Match confidence",
      "Evidence status",
      "Review status",
    ],
    ...spins.map((spin) => {
      const track = spin.trackId ? byId.get(spin.trackId) : undefined;
      const writers =
        track?.ownership?.parties
          .filter((party) => party.role === "Co-writer")
          .map((party) => party.name)
          .join("; ") ?? "";
      const publishers =
        track?.ownership?.parties
          .filter((party) => party.role === "Publisher")
          .map((party) => party.name)
          .join("; ") ?? "";
      const priced = priceSpin(spin, policy);
      return [
        spin.id,
        spin.stationName,
        spin.medium,
        spin.region,
        eatDate(spin.detectedAt),
        eatTime(spin.detectedAt),
        spin.durationSec,
        spin.title ?? "",
        spin.primaryArtist ?? "",
        writers,
        publishers,
        spin.isrc ?? "",
        "",
        "Music playout",
        TIME_BAND_META[priced.timeBand].label,
        priced.baseRate,
        priced.multiplier,
        priced.allocationUgx,
        `${(spin.confidence * 100).toFixed(1)}%`,
        spin.evidence
          ? "Capture attached — verify provenance"
          : "No captured evidence attached",
        !spin.trackId
          ? "Unmatched audio — identify before filing"
          : !spin.isrc
            ? "Matched recording; supplied ISRC missing — review before filing"
            : "Review composition identifiers, publisher and station programme metadata before filing",
      ];
    }),
  ]);
}

/** Timestamp-based ledger. No inferred ownership, fake society membership or retrospective monthly modelling. */
export function capturedPlayLedger(
  spins: BroadcastSpin[],
  catalogue: Track[],
  policy: WeightingPolicy = DEFAULT_WEIGHTING,
): PlayRow[] {
  if (!validateWeighting(policy))
    throw new RangeError("Invalid weighting policy.");
  const rows = new Map<string, PlayRow>();
  const seen = new Set<string>();
  for (const spin of spins) {
    if (spin.source !== "captured" || !spin.trackId || seen.has(spin.id))
      continue;
    seen.add(spin.id);
    const track = catalogue.find((entry) => entry.id === spin.trackId);
    if (
      !track ||
      !track.ownership ||
      track.ownership.approvalMethod !== "local-acknowledgement" ||
      validateDeliveryParties(track.ownership.parties).length
    )
      continue;
    const parties = track.ownership.parties.filter(
      (party) => party.shares.performance > 0,
    );
    const isrc = spin.isrc || track?.isrc;
    if (
      !track ||
      !isrc ||
      !isValidIsrc(isrc) ||
      !parties?.length ||
      Math.abs(
        parties.reduce((sum, party) => sum + party.shares.performance, 0) - 100,
      ) > 0.001 ||
      parties.some(
        (party) =>
          !party.signature ||
          party.signature.typedName.trim().toLowerCase() !==
            party.name.trim().toLowerCase(),
      )
    )
      continue;
    const priced = priceSpin({ ...spin, isrc }, policy);
    const station = FM_STATIONS.find((entry) => entry.id === spin.stationId);
    const rate = rateFor(station?.reach ?? 0, spin.medium);
    const allocations = parties.map((party, index) => {
      const exact = (priced.allocationUgx * party.shares.performance) / 100;
      return {
        index,
        amount: Math.floor(exact),
        remainder: exact - Math.floor(exact),
      };
    });
    let remainder =
      priced.allocationUgx -
      allocations.reduce((sum, row) => sum + row.amount, 0);
    for (const row of [...allocations].sort(
      (a, b) => b.remainder - a.remainder || a.index - b.index,
    ))
      if (remainder-- > 0) row.amount++;
    for (const [index, party] of parties.entries()) {
      const memberId = `ES-${party.id}`;
      const period = eatDate(spin.detectedAt).slice(0, 7);
      const id = `${track.id}:${spin.stationId}:${period}:${priced.timeBand}:${party.id}`;
      const row = rows.get(id) ?? {
        id,
        memberId,
        artist: party.name,
        isrc,
        title: track.title,
        stationId: spin.stationId,
        station: spin.stationName,
        tier: rate.tier,
        region: spin.region,
        period,
        plays: 0,
        share: party.shares.performance / 100,
        ugxPerPlay: rate.ugxPerPlay,
        allocationUgx: 0,
        timeBand: priced.timeBand,
        multiplier: priced.multiplier,
      };
      row.plays += party.shares.performance / 100;
      row.allocationUgx += allocations[index].amount;
      rows.set(id, row);
    }
  }
  return [...rows.values()];
}
