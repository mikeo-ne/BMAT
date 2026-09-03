import { createRandom, hashSeed } from "@/lib/airplay";
import { formatPeriod } from "@/lib/format";
import {
  buildMembers,
  buildPlayLedger,
  buildReport,
  EMPTY_FILTERS,
  UGX_PER_USD,
  type DistributionReport,
  type PlayRow,
} from "@/lib/uprs";
import type { Track } from "@/lib/types";

/**
 * Royalties: distribution and payouts.
 *
 * The CMO & Regulatory Audit page owns the play ledger and the flat-rate
 * arithmetic. This module turns that ledger into the thing member services
 * actually operates: a per-member statement per reporting period, and the
 * payout batches that carry those statements to payment.
 *
 * Status is deterministic demo state — a real installation would source it from
 * the accounting system. The functions here stay pure, seeded and injectable so
 * the page renders the same batch on every server render.
 */

export type StatementStatus = "pending" | "approved" | "blocked" | "paid";
export type PayoutStatus = "draft" | "approved" | "paid" | "blocked";

export interface RoyaltyStatement {
  id: string;
  memberId: string;
  artist: string;
  /** "YYYY-MM" */
  period: string;
  periodLabel: string;
  plays: number;
  stations: number;
  works: number;
  allocationUgx: number;
  allocationUsd: number;
  shareOfPool: number;
  status: StatementStatus;
  approvedAt: string | null;
  paidAt: string | null;
  paymentReference: string | null;
}

export interface PayoutBatch {
  id: string;
  period: string;
  periodLabel: string;
  status: PayoutStatus;
  members: number;
  plays: number;
  allocationUgx: number;
  allocationUsd: number;
  paidAt: string | null;
  statements: RoyaltyStatement[];
}

export interface RoyaltiesModel {
  report: DistributionReport;
  members: ReturnType<typeof buildMembers>;
  statements: RoyaltyStatement[];
  batches: PayoutBatch[];
  months: string[];
}

/* -------------------------------------------------------------------------- */
/* Status helpers                                                              */
/* -------------------------------------------------------------------------- */

/** Statement id used by the file-backed prototype. */
export function statementId(memberId: string, period: string): string {
  return `stmt_${memberId}_${period.replace("-", "")}`;
}

/**
 * Demo status ladder: the newest two periods are pending, the previous two are
 * approved, older periods are paid, and a small deterministic slice is blocked
 * because the split sheet or member record still needs clearing.
 */
export function statusFor(
  memberId: string,
  period: string,
  months: string[],
  now: Date,
): { status: StatementStatus; approvedAt: string | null; paidAt: string | null } {
  const year = now.getUTCFullYear();
  const index = months.indexOf(period);

  const rand = createRandom(hashSeed(`royalty:${memberId}:${period}`));
  const blocked = index >= 0 && index <= months.length - 1 && rand() < 0.08;

  const monthIndex = new Date(`${period}-01T00:00:00Z`).getUTCMonth();
  const approval = new Date(Date.UTC(year, monthIndex, 1));
  approval.setUTCMonth(approval.getUTCMonth() + 1);
  approval.setUTCDate(15);
  const payment = new Date(approval);
  payment.setUTCMonth(payment.getUTCMonth() + 1);
  payment.setUTCDate(15);

  if (blocked) {
    return { status: "blocked", approvedAt: null, paidAt: null };
  }

  const ageInPeriods = months.length - 1 - index;
  if (ageInPeriods >= 3 && payment.getTime() <= now.getTime()) {
    return { status: "paid", approvedAt: approval.toISOString(), paidAt: payment.toISOString() };
  }
  if (ageInPeriods >= 1) {
    return { status: "approved", approvedAt: approval.toISOString(), paidAt: null };
  }

  return { status: "pending", approvedAt: null, paidAt: null };
}

/** Batch status is driven by its member statements. */
export function batchStatusFor(statements: RoyaltyStatement[]): PayoutStatus {
  if (statements.some((s) => s.status === "blocked")) return "blocked";
  if (statements.length > 0 && statements.every((s) => s.status === "paid")) return "paid";
  if (statements.length > 0 && statements.every((s) => s.status === "approved")) return "approved";
  return "draft";
}

export function paymentReferenceFor(memberId: string, period: string): string {
  return `UPRS-${period.replace("-", "")}-${memberId.slice(-4)}`;
}

/* -------------------------------------------------------------------------- */
/* Builders                                                                    */
/* -------------------------------------------------------------------------- */

/** Group ledger rows into per-member per-period statements. */
export function buildStatements(
  rows: PlayRow[],
  months: string[],
  now: Date,
): RoyaltyStatement[] {
  const byMemberPeriod = new Map<string, { memberId: string; artist: string; plays: number; stations: Set<string>; works: Set<string>; amountUgx: number }>();

  for (const row of rows) {
    const key = `${row.memberId}:${row.period}`;
    const bucket =
      byMemberPeriod.get(key) ??
      {
        memberId: row.memberId,
        artist: row.artist,
        plays: 0,
        stations: new Set<string>(),
        works: new Set<string>(),
        amountUgx: 0,
      };
    bucket.plays += row.plays;
    bucket.stations.add(row.stationId);
    bucket.works.add(row.isrc);
    bucket.amountUgx += row.allocationUgx;
    byMemberPeriod.set(key, bucket);
  }

  const totalPool = [...byMemberPeriod.values()].reduce((a, b) => a + b.amountUgx, 0);

  const statements = [...byMemberPeriod.entries()]
    .map(([key, bucket]) => {
      const [memberId, period] = key.split(":");
      const timing = statusFor(memberId, period, months, now);
      const amountUgx = bucket.amountUgx;

      return {
        id: statementId(memberId, period),
        memberId,
        artist: bucket.artist,
        period,
        periodLabel: formatPeriod(period),
        plays: bucket.plays,
        stations: bucket.stations.size,
        works: bucket.works.size,
        allocationUgx: amountUgx,
        allocationUsd: amountUgx / UGX_PER_USD,
        shareOfPool: totalPool === 0 ? 0 : amountUgx / totalPool,
        status: timing.status,
        approvedAt: timing.approvedAt,
        paidAt: timing.paidAt,
        paymentReference:
          timing.status === "paid" ? paymentReferenceFor(memberId, period) : null,
      } satisfies RoyaltyStatement;
    })
    .sort((a, b) => b.allocationUgx - a.allocationUgx);

  return statements;
}

/** Group statements into one payout batch per period. */
export function buildPayoutBatches(statements: RoyaltyStatement[]): PayoutBatch[] {
  const byPeriod = new Map<string, RoyaltyStatement[]>();

  for (const statement of statements) {
    const list = byPeriod.get(statement.period) ?? [];
    list.push(statement);
    byPeriod.set(statement.period, list);
  }

  return [...byPeriod.entries()]
    .map(([period, list]) => {
      const amountUgx = list.reduce((a, s) => a + s.allocationUgx, 0);

      return {
        id: `batch_${period.replace("-", "")}`,
        period,
        periodLabel: formatPeriod(period),
        status: batchStatusFor(list),
        members: new Set(list.map((s) => s.memberId)).size,
        plays: list.reduce((a, s) => a + s.plays, 0),
        allocationUgx: amountUgx,
        allocationUsd: amountUgx / UGX_PER_USD,
        paidAt: list.find((s) => s.paidAt)?.paidAt ?? null,
        statements: list,
      } satisfies PayoutBatch;
    })
    .sort((a, b) => b.period.localeCompare(a.period));
}

/** The whole royalties view: report + member statements + payout batches. */
export function buildRoyaltiesModel(
  catalogue: Track[],
  now: Date = new Date(),
  months = 6,
): RoyaltiesModel {
  const periodList = Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });

  const ledger = buildPlayLedger({ catalogue, now, months });
  const report = buildReport(ledger, EMPTY_FILTERS, now);
  const statements = buildStatements(ledger, periodList, now);
  const batches = buildPayoutBatches(statements);

  return {
    report,
    members: buildMembers(catalogue),
    statements,
    batches,
    months: periodList,
  };
}

/* -------------------------------------------------------------------------- */
/* Totals                                                                      */
/* -------------------------------------------------------------------------- */

export interface RoyaltyTotals {
  poolUgx: number;
  poolUsd: number;
  paidUgx: number;
  paidUsd: number;
  pendingUgx: number;
  pendingUsd: number;
  blockedUgx: number;
  blockedUsd: number;
  approvedUgx: number;
  approvedUsd: number;
  paidCount: number;
  pendingCount: number;
  blockedCount: number;
}

export function totals(model: RoyaltiesModel): RoyaltyTotals {
  const sum = (list: RoyaltyStatement[]) => list.reduce((a, s) => a + s.allocationUgx, 0);

  const paid = model.statements.filter((s) => s.status === "paid");
  const pending = model.statements.filter((s) => s.status === "pending" || s.status === "approved");
  const blocked = model.statements.filter((s) => s.status === "blocked");

  return {
    poolUgx: model.report.royaltyPoolUgx,
    poolUsd: model.report.royaltyPoolUsd,
    paidUgx: sum(paid),
    paidUsd: sum(paid) / UGX_PER_USD,
    pendingUgx: sum(pending),
    pendingUsd: sum(pending) / UGX_PER_USD,
    blockedUgx: sum(blocked),
    blockedUsd: sum(blocked) / UGX_PER_USD,
    approvedUgx: sum(model.statements.filter((s) => s.status === "approved")),
    approvedUsd: sum(model.statements.filter((s) => s.status === "approved")) / UGX_PER_USD,
    paidCount: paid.length,
    pendingCount: pending.length,
    blockedCount: blocked.length,
  };
}

/* -------------------------------------------------------------------------- */
/* CSV export                                                                  */
/* -------------------------------------------------------------------------- */

function escapeCsv(value: string | number): string {
  const text = String(value);
  return /[\",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const STATEMENT_COLUMNS = [
  "Member ID",
  "Artist",
  "Period",
  "Plays",
  "Stations",
  "Recordings",
  "Allocation (UGX)",
  "Allocation (USD)",
  "Share of pool",
  "Status",
  "Approved",
  "Paid",
  "Payment reference",
] as const;

export function statementsToCsv(statements: RoyaltyStatement[]): string {
  const header = STATEMENT_COLUMNS.join(",");
  const body = statements.map((s) =>
    [
      s.memberId,
      s.artist,
      s.period,
      s.plays,
      s.stations,
      s.works,
      s.allocationUgx,
      s.allocationUsd.toFixed(2),
      s.shareOfPool.toFixed(4),
      s.status,
      s.approvedAt ?? "",
      s.paidAt ?? "",
      s.paymentReference ?? "",
    ]
      .map(escapeCsv)
      .join(","),
  );

  return [header, ...body].join("\r\n");
}

export function batchesToCsv(batches: PayoutBatch[]): string {
  const header = [
    "Batch",
    "Period",
    "Status",
    "Members",
    "Plays",
    "Covered (UGX)",
    "Covered (USD)",
    "Paid",
  ].join(",");
  const body = batches.map((b) =>
    [
      b.id,
      b.period,
      b.status,
      b.members,
      b.plays,
      b.allocationUgx,
      b.allocationUsd.toFixed(2),
      b.paidAt ?? "",
    ]
      .map(escapeCsv)
      .join(","),
  );

  return [header, ...body].join("\r\n");
}

export const STATUS_LABEL: Record<StatementStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  blocked: "Blocked",
  paid: "Paid",
};

export const PAYOUT_STATUS_LABEL: Record<PayoutStatus, string> = {
  draft: "Draft",
  approved: "Approved",
  paid: "Paid",
  blocked: "Blocked",
};
