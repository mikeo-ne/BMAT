"use client";

import { useMemo, useState } from "react";

import { formatCurrency, formatShare } from "@/lib/format";
import {
  batchesToCsv,
  buildPayoutBatches,
  PAYOUT_STATUS_LABEL,
  paymentReferenceFor,
  statementsToCsv,
  STATUS_LABEL,
  totals,
  type PayoutBatch,
  type PayoutStatus,
  type RoyaltiesModel,
  type RoyaltyStatement,
  type StatementStatus,
} from "@/lib/royalties";

interface RoyaltiesDashboardProps {
  model: RoyaltiesModel;
}

const STATUS_CLASS: Record<StatementStatus, string> = {
  pending: "text-muted",
  approved: "text-accent",
  blocked: "text-red-400",
  paid: "text-foreground",
};

const PAYOUT_CLASS: Record<PayoutStatus, string> = {
  draft: "text-muted",
  approved: "text-accent",
  paid: "text-foreground",
  blocked: "text-red-400",
};

function downloadCsv(fileName: string, csv: string): void {
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

/**
 * Member royalty statements and payout batches.
 *
 * The ledger arithmetic lives in lib/uprs.ts; this page turns it into the
 * monthly statements member services operates on. Status transitions are
 * local simulation state for the prototype — a production build would POST to
 * /api/royalties and persist through prisma/schema.prisma.
 */
export function RoyaltiesDashboard({ model }: RoyaltiesDashboardProps) {
  const [statements, setStatements] = useState<RoyaltyStatement[]>(model.statements);
  const [batches, setBatches] = useState<PayoutBatch[]>(model.batches);
  const [statusFilter, setStatusFilter] = useState<StatementStatus | "all">("all");
  const [periodFilter, setPeriodFilter] = useState<string>("all");

  const summary = useMemo(() => totals({ ...model, statements, batches }), [model, statements, batches]);
  const periods = useMemo(() => [...new Set(statements.map((s) => s.period))].sort().reverse(), [statements]);

  const filtered = useMemo(
    () =>
      statements.filter(
        (s) =>
          (statusFilter === "all" || s.status === statusFilter) &&
          (periodFilter === "all" || s.period === periodFilter),
      ),
    [statements, statusFilter, periodFilter],
  );

  function refreshPayoutBatches(next: RoyaltyStatement[]) {
    setBatches(buildPayoutBatches(next));
  }

  function approve(id: string) {
    const next = statements.map((s) =>
      s.id === id && s.status === "pending"
        ? { ...s, status: "approved" as const, approvedAt: new Date().toISOString() }
        : s,
    );
    setStatements(next);
    refreshPayoutBatches(next);
  }

  function pay(id: string) {
    const now = new Date().toISOString();
    const next = statements.map((s) =>
      s.id === id
        ? {
            ...s,
            status: "paid" as const,
            approvedAt: s.approvedAt ?? now,
            paidAt: now,
            paymentReference: paymentReferenceFor(s.memberId, s.period),
          }
        : s,
    );
    setStatements(next);
    refreshPayoutBatches(next);
  }

  function block(id: string) {
    const next = statements.map((s) =>
      s.id === id ? { ...s, status: "blocked" as const, paidAt: null } : s,
    );
    setStatements(next);
    refreshPayoutBatches(next);
  }

  const cards = [
    {
      label: "Royalty pool",
      value: formatCurrency(summary.poolUgx),
      hint: `${model.months.length} reporting periods · ≈ $${summary.poolUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
      tone: "",
    },
    {
      label: "Paid",
      value: formatCurrency(summary.paidUgx),
      hint: `${summary.paidCount} statements batched out`,
      tone: "text-accent",
    },
    {
      label: "Pending / approved",
      value: formatCurrency(summary.pendingUgx),
      hint: `${summary.pendingCount} statements awaiting payment`,
      tone: "text-foreground",
    },
    {
      label: "Blocked",
      value: formatCurrency(summary.blockedUgx),
      hint: `${summary.blockedCount} statements on hold`,
      tone: "text-red-400",
    },
  ];

  return (
    <div className="flex flex-col gap-4 pb-8">
      <section className="panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Distribution & payouts</h2>
            <p className="mt-1 max-w-2xl text-xs text-muted">
              {model.report.periodLabel} · {model.report.memberCount} members ·{" "}
              {model.report.workCount} recordings · {model.report.stationCount} reporting stations ·
              flat-rate basis, placeholder tariff until the published UPRS schedule is loaded.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() =>
                downloadCsv(`bmat-royalty-statements-${stamp()}.csv`, statementsToCsv(statements))
              }
            >
              Download statements
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => downloadCsv(`bmat-payout-batches-${stamp()}.csv`, batchesToCsv(batches))}
            >
              Download batches
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Royalty totals">
        {cards.map((card) => (
          <div key={card.label} className="panel p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted">{card.label}</p>
            <p className={`mt-1 font-mono text-xl font-semibold ${card.tone}`}>{card.value}</p>
            <p className="mt-1 text-[11px] text-muted">{card.hint}</p>
          </div>
        ))}
      </section>

      <section className="panel p-4" aria-labelledby="batches-heading">
        <h2 id="batches-heading" className="text-sm font-semibold tracking-tight">
          Payout batches
        </h2>
        <p className="mt-1 text-xs text-muted">
          One batch per reporting period. A batch stays draft until every statement is approved,
          then moves to paid when the statements in it have been settled.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-xs">
            <thead>
              <tr className="text-left text-muted">
                <th scope="col" className="px-2 py-2 font-medium">Period</th>
                <th scope="col" className="px-2 py-2 font-medium">Status</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Members</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Plays</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Covered (UGX)</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Covered (USD)</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Paid</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => (
                <tr key={batch.id} className="border-t border-line">
                  <td className="px-2 py-2 font-medium text-foreground">{batch.periodLabel}</td>
                  <td className="px-2 py-2">
                    <span className={`chip ${PAYOUT_CLASS[batch.status]}`}>
                      {PAYOUT_STATUS_LABEL[batch.status]}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right font-mono">{batch.members}</td>
                  <td className="px-2 py-2 text-right font-mono">
                    {batch.plays.toLocaleString("en-US")}
                  </td>
                  <td className="px-2 py-2 text-right font-mono">
                    {batch.allocationUgx.toLocaleString("en-US")}
                  </td>
                  <td className="px-2 py-2 text-right font-mono">
                    {batch.allocationUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-muted">
                    {batch.paidAt ? batch.paidAt.slice(0, 10) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel p-4" aria-labelledby="statements-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="statements-heading" className="text-sm font-semibold tracking-tight">
              Member statements
            </h2>
            <p className="mt-1 text-xs text-muted">
              {filtered.length} of {statements.length} statements shown.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-2 text-xs text-muted">
              <span className="hidden sm:inline">Period</span>
              <select
                value={periodFilter}
                onChange={(event) => setPeriodFilter(event.target.value)}
                className="field w-auto"
              >
                <option value="all">All periods</option>
                {periods.map((period) => (
                  <option key={period} value={period}>
                    {period}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-muted">
              <span className="hidden sm:inline">Status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatementStatus | "all")}
                className="field w-auto"
              >
                <option value="all">All statuses</option>
                {(["pending", "approved", "paid", "blocked"] as const).map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABEL[status]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="mt-4 rounded border border-dashed border-line px-4 py-8 text-center text-xs text-muted">
            No statements match those filters.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-xs">
              <thead>
                <tr className="text-left text-muted">
                  <th scope="col" className="px-2 py-2 font-medium">Member</th>
                  <th scope="col" className="px-2 py-2 font-medium">Period</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Plays</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Stations</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Recordings</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">UGX</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">USD</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Share</th>
                  <th scope="col" className="px-2 py-2 font-medium">Status</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((statement) => (
                  <tr key={statement.id} className="border-t border-line">
                    <td className="px-2 py-2">
                      <span className="font-medium text-foreground">{statement.artist}</span>
                      <span className="ml-2 font-mono text-[10px] text-muted">
                        {statement.memberId}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-muted">{statement.periodLabel}</td>
                    <td className="px-2 py-2 text-right font-mono">
                      {statement.plays.toLocaleString("en-US")}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">{statement.stations}</td>
                    <td className="px-2 py-2 text-right font-mono">{statement.works}</td>
                    <td className="px-2 py-2 text-right font-mono">
                      {statement.allocationUgx.toLocaleString("en-US")}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {statement.allocationUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-muted">
                      {formatShare(statement.shareOfPool, 2)}
                    </td>
                    <td className="px-2 py-2">
                      <span className={`chip ${STATUS_CLASS[statement.status]}`}>
                        {STATUS_LABEL[statement.status]}
                      </span>
                      {statement.paymentReference ? (
                        <div className="mt-1 font-mono text-[10px] text-muted">
                          {statement.paymentReference}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex justify-end gap-1">
                        {statement.status === "pending" ? (
                          <button
                            type="button"
                            className="btn btn-ghost px-2 py-1 text-[10px]"
                            onClick={() => approve(statement.id)}
                          >
                            Approve
                          </button>
                        ) : null}
                        {statement.status === "approved" ? (
                          <button
                            type="button"
                            className="btn btn-primary px-2 py-1 text-[10px]"
                            onClick={() => pay(statement.id)}
                          >
                            Mark paid
                          </button>
                        ) : null}
                        {statement.status !== "blocked" && statement.status !== "paid" ? (
                          <button
                            type="button"
                            className="btn btn-ghost px-2 py-1 text-[10px]"
                            onClick={() => block(statement.id)}
                          >
                            Block
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
