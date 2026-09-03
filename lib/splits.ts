import { createRandom, hashSeed } from "@/lib/airplay";
import type { Track } from "@/lib/types";

/* -------------------------------------------------------------------------- */
/* Split sheets                                                                */
/* -------------------------------------------------------------------------- */

export type SplitRole =
  | "Primary artist"
  | "Featured artist"
  | "Producer"
  | "Songwriter"
  | "Publisher";

export interface SplitParty {
  id: string;
  name: string;
  role: SplitRole;
  /** Ownership percentage, whole numbers summing to 100 across a sheet. */
  sharePct: number;
  /** UPRS member id, when the party is registered. */
  memberId: string | null;
  /** Digital sign-off timestamp, null while outstanding. */
  signedAt: string | null;
  /** How the party signs, shown in the approval list. */
  channel: "OTP" | "Email" | "Pending invite" | null;
}

export type SheetStatus = "complete" | "awaiting-signatures" | "disputed";

export interface SplitSheet {
  isrc: string;
  trackId: string;
  title: string;
  primaryArtist: string;
  parties: SplitParty[];
  status: SheetStatus;
  raisedAt: string;
  /** Sum of shares — anything other than 100 is itself a defect. */
  totalPct: number;
}

const PRODUCERS = ["DJ Ssebbi", "Nessim Beats", "Hans Room", "Kampala Beat Lab"];
const PUBLISHERS = ["EastSound Publishing", "Mekono Music", "Pearl Rights Admin"];

function memberIdFor(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z]+/g, "")
    .slice(0, 3)
    .toUpperCase();
  const n = hashSeed(name) % 9000 + 1000;
  return `UPRS-${slug}-${n}`;
}

/**
 * Build a split sheet for a recording.
 *
 * Shares follow the house convention: the primary artist leads, featured artists
 * split their block equally, and producer / publisher take fixed points. The
 * primary artist absorbs the remainder so the sheet always totals 100.
 */
export function buildSplitSheet(track: Track, now: Date = new Date()): SplitSheet {
  const rand = createRandom(hashSeed(`split:${track.isrc}`));

  const featuredCount = track.featuredArtists.length;
  const producer = PRODUCERS[hashSeed(`${track.isrc}:prod`) % PRODUCERS.length];
  const publisher = PUBLISHERS[hashSeed(`${track.isrc}:pub`) % PUBLISHERS.length];

  const producerPct = 15 + (hashSeed(`${track.isrc}:ppct`) % 10); // 15-24
  const publisherPct = 10;
  const featuredBlockPct = featuredCount === 0 ? 0 : 20 + (featuredCount - 1) * 5;

  const primaryPct = Math.max(100 - producerPct - publisherPct - featuredBlockPct, 0);
  const featuredEach = featuredCount === 0 ? 0 : Math.floor(featuredBlockPct / featuredCount);

  const parties: SplitParty[] = [
    {
      id: `${track.id}:primary`,
      name: track.primaryArtist,
      role: "Primary artist",
      // The primary artist absorbs the producer/publisher/featured deductions.
      // Any rounding remainder in the featured block goes to the first featured
      // artist below — adding it here as well would push the sheet past 100%.
      sharePct: primaryPct,
      memberId: memberIdFor(track.primaryArtist),
      signedAt: new Date(now.getTime() - 86_400_000 * 3).toISOString(),
      channel: "OTP",
    },
  ];

  for (const [i, name] of track.featuredArtists.entries()) {
    // The first featured artist picks up any rounding remainder.
    const share = i === 0 ? featuredBlockPct - featuredEach * (featuredCount - 1) : featuredEach;
    const signed = rand() < 0.55;
    parties.push({
      id: `${track.id}:featured-${i}`,
      name,
      role: "Featured artist",
      sharePct: share,
      memberId: memberIdFor(name),
      signedAt: signed ? new Date(now.getTime() - 86_400_000 * (1 + i)).toISOString() : null,
      channel: signed ? "Email" : "Pending invite",
    });
  }

  const producerSigned = rand() < 0.6;
  parties.push({
    id: `${track.id}:producer`,
    name: producer,
    role: "Producer",
    sharePct: producerPct,
    memberId: memberIdFor(producer),
    signedAt: producerSigned ? new Date(now.getTime() - 86_400_000 * 2).toISOString() : null,
    channel: producerSigned ? "OTP" : "Pending invite",
  });

  parties.push({
    id: `${track.id}:publisher`,
    name: publisher,
    role: "Publisher",
    sharePct: publisherPct,
    memberId: memberIdFor(publisher),
    signedAt: new Date(now.getTime() - 86_400_000 * 4).toISOString(),
    channel: "Email",
  });

  const totalPct = parties.reduce((sum, p) => sum + p.sharePct, 0);
  const allSigned = parties.every((p) => p.signedAt !== null);

  return {
    isrc: track.isrc,
    trackId: track.id,
    title: track.title,
    primaryArtist: track.primaryArtist,
    parties,
    status: allSigned ? "complete" : "awaiting-signatures",
    raisedAt: track.uploadedAt,
    totalPct,
  };
}

export function buildSplitSheets(catalogue: Track[], now: Date = new Date()): SplitSheet[] {
  return catalogue.map((track) => buildSplitSheet(track, now));
}

export const SHEET_STATUS_LABEL: Record<SheetStatus, string> = {
  complete: "Fully executed",
  "awaiting-signatures": "Awaiting signatures",
  disputed: "Under dispute",
};

/* -------------------------------------------------------------------------- */
/* Disputes                                                                    */
/* -------------------------------------------------------------------------- */

export type DisputeKind = "overlapping-rights" | "share-overflow" | "unmatched-registration";

export interface DisputeClaimant {
  name: string;
  claimPct: number;
  rightType: "mechanical" | "performance" | "master";
  registeredOn: string;
}

export interface RightsDispute {
  id: string;
  isrc: string;
  title: string;
  kind: DisputeKind;
  severity: "critical" | "high";
  claimants: DisputeClaimant[];
  /** Percentage claimed in excess of 100 across the claimants. */
  overlapPct: number;
  headline: string;
  detail: string;
  raisedAt: string;
  /** True when the ISRC is not in the BMAT catalogue. */
  external: boolean;
}

const RIGHT_LABEL: Record<DisputeClaimant["rightType"], string> = {
  mechanical: "mechanical rights",
  performance: "performance rights",
  master: "master rights",
};

export function rightTypeLabel(rightType: DisputeClaimant["rightType"]): string {
  return RIGHT_LABEL[rightType];
}

/**
 * Flag registrations that collide.
 *
 * Three shapes, all of which a CMO has to resolve before it can pay anyone:
 * two parties each claiming the whole of the same right, a split sheet whose
 * shares total more than 100, and a claim against an ISRC BMAT has no record of.
 */
export function buildDisputes(sheets: SplitSheet[], now: Date = new Date()): RightsDispute[] {
  const disputes: RightsDispute[] = [];

  // 1. Overlapping rights on a catalogued recording.
  const first = sheets[0];
  if (first) {
    disputes.push({
      id: "dsp_001",
      isrc: first.isrc,
      title: first.title,
      kind: "overlapping-rights",
      severity: "critical",
      claimants: [
        {
          name: "EastSound Publishing",
          claimPct: 100,
          rightType: "mechanical",
          registeredOn: new Date(now.getTime() - 86_400_000 * 21).toISOString(),
        },
        {
          name: "Mekono Music",
          claimPct: 100,
          rightType: "mechanical",
          registeredOn: new Date(now.getTime() - 86_400_000 * 9).toISOString(),
        },
      ],
      overlapPct: 100,
      headline: `Two publishers claiming 100% mechanical rights for ISRC ${first.isrc}`,
      detail: `EastSound Publishing and Mekono Music have each registered the full mechanical right for “${first.title}”. Neither claim references the other, and the executed split sheet on file allocates only 10% to a publisher. Payments are held until one claim is withdrawn or the sheet is varied.`,
      raisedAt: new Date(now.getTime() - 86_400_000 * 2).toISOString(),
      external: false,
    });
  }

  // 2. Shares totalling more than 100.
  const overflowing = sheets.find((s) => s.totalPct > 100);
  if (overflowing) {
    disputes.push({
      id: "dsp_002",
      isrc: overflowing.isrc,
      title: overflowing.title,
      kind: "share-overflow",
      severity: "high",
      claimants: overflowing.parties.map((p) => ({
        name: p.name,
        claimPct: p.sharePct,
        rightType: "performance" as const,
        registeredOn: overflowing.raisedAt,
      })),
      overlapPct: overflowing.totalPct - 100,
      headline: `Split sheet for ${overflowing.isrc} totals ${overflowing.totalPct}%`,
      detail: `The executed sheet for “${overflowing.title}” allocates ${overflowing.totalPct}% across ${overflowing.parties.length} parties. The excess has to be clawed back before the next distribution run.`,
      raisedAt: new Date(now.getTime() - 86_400_000 * 5).toISOString(),
      external: false,
    });
  }

  // 3. A claim against an ISRC BMAT has no record of. This is the shape a real
  //    registry sees constantly: a publisher asserting rights over a code that
  //    was never delivered to the CMO.
  disputes.push({
    id: "dsp_003",
    isrc: "UG-A01-26-00012",
    title: "Unregistered work",
    kind: "unmatched-registration",
    severity: "critical",
    claimants: [
      {
        name: "A01 Records",
        claimPct: 100,
        rightType: "mechanical",
        registeredOn: new Date(now.getTime() - 86_400_000 * 33).toISOString(),
      },
      {
        name: "Pearl Rights Admin",
        claimPct: 100,
        rightType: "mechanical",
        registeredOn: new Date(now.getTime() - 86_400_000 * 12).toISOString(),
      },
    ],
    overlapPct: 100,
    headline: "Two publishers claiming 100% mechanical rights for ISRC UG-A01-26-00012",
    detail:
      "Both A01 Records and Pearl Rights Admin assert the whole mechanical right, and BMAT holds no delivered master under this ISRC. With no reference recording to fingerprint against, neither claim can be verified — the work has to be delivered and matched before either party is paid.",
    raisedAt: new Date(now.getTime() - 86_400_000 * 1).toISOString(),
    external: true,
  });

  return disputes;
}

export const DISPUTE_KIND_LABEL: Record<DisputeKind, string> = {
  "overlapping-rights": "Overlapping rights",
  "share-overflow": "Share overflow",
  "unmatched-registration": "Unmatched registration",
};
