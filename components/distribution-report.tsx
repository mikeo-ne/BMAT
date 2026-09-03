"use client";

import { formatCompact, formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import { DISTRIBUTION_POLICY, TARIFF, UGX_PER_USD, type DistributionReport as Report } from "@/lib/uprs";

interface DistributionReportProps {
  report: Report;
  onExportLedger: () => void;
  onExportReport: () => void;
}

export function DistributionReport({
  report,
  onExportLedger,
  onExportReport,
}: DistributionReportProps) {
  const empty = report.rowCount === 0;
  const maxRegion = Math.max(1, ...report.byRegion.map((r) => r.amountUgx));
  const tariffSummary = Object.values(TARIFF)
    .map((rate) => `${rate.label} ${rate.ugxPerPlay}`)
    .join(" · ");

  return (
    <section className="panel overflow-hidden" aria-labelledby="report-heading">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
        <div>
          <h2 id="report-heading" className="text-sm font-semibold tracking-tight">
            Distribution report
          </h2>
          <p className="text-xs text-muted">
            {empty ? (
              "Generate a report from the filtered ledger."
            ) : (
              <>
                {report.periodLabel} · {report.filterSummary.join(" · ")} ·{" "}
                {formatDateTime(report.generatedAt)}
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onExportLedger}
            disabled={empty}
            title="Download every ledger row behind this report"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Export ledger CSV
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onExportReport}
            disabled={empty}
            title="Download the summary and per-member allocation"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Export report CSV
          </button>
        </div>
      </header>

      {empty ? (
        <div className="px-5 py-14 text-center">
          <p className="text-sm font-medium">No report generated</p>
          <p className="mt-1 text-xs text-muted">
            Adjust the filters and press <span className="text-foreground">Generate Distribution Report</span>.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5 p-4 sm:p-5">
          {/* Headline figures */}
          <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              {
                label: "Total play count",
                value: formatNumber(report.totalPlays),
                hint: `${formatNumber(report.rowCount)} ledger rows · ${report.stationCount} stations`,
              },
              {
                label: "Royalty pool (est.)",
                value: `UGX ${formatCompact(report.royaltyPoolUgx)}`,
                hint: `UGX ${formatCurrency(report.royaltyPoolUgx)} at flat per-play rates`,
              },
              {
                label: "Indicative USD",
                value: `$${formatCurrency(report.royaltyPoolUsd, 2)}`,
                hint: `at UGX ${formatNumber(UGX_PER_USD)} / USD`,
              },
              {
                label: "Members payable",
                value: formatNumber(report.memberCount),
                hint: `${report.workCount} recordings · split ${DISTRIBUTION_POLICY.primaryShare * 100}/${DISTRIBUTION_POLICY.featuredShare * 100}`,
              },
            ].map((card) => (
              <div key={card.label} className="rounded-lg border border-line bg-surface-2/60 p-3.5">
                <dt className="text-[11px] text-muted">{card.label}</dt>
                <dd className="mt-1 text-xl font-semibold tracking-tight tabular-nums">
                  {card.value}
                </dd>
                <p className="mt-1 text-[11px] leading-snug text-muted">{card.hint}</p>
              </div>
            ))}
          </dl>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            {/* Flat-rate basis */}
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                Royalty estimation — flat rate basis
              </h3>
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-line text-[10px] uppercase tracking-wider text-muted">
                    <th scope="col" className="py-1.5 font-medium">
                      Station tier
                    </th>
                    <th scope="col" className="py-1.5 text-right font-medium">
                      Rate
                    </th>
                    <th scope="col" className="py-1.5 text-right font-medium">
                      Plays
                    </th>
                    <th scope="col" className="py-1.5 text-right font-medium">
                      Allocation
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.byRate.map((rate) => (
                    <tr key={rate.tier} className="border-b border-line/50 last:border-0">
                      <td className="py-1.5">{rate.label}</td>
                      <td className="py-1.5 text-right font-mono text-muted tabular-nums">
                        {formatNumber(rate.ugxPerPlay)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{formatNumber(rate.plays)}</td>
                      <td className="py-1.5 text-right font-medium tabular-nums">
                        {formatCurrency(rate.amountUgx)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line text-foreground">
                    <td className="py-1.5 font-medium" colSpan={2}>
                      Pool
                    </td>
                    <td className="py-1.5 text-right font-medium tabular-nums">
                      {formatNumber(report.totalPlays)}
                    </td>
                    <td className="py-1.5 text-right font-semibold tabular-nums">
                      {formatCurrency(report.royaltyPoolUgx)}
                    </td>
                  </tr>
                </tfoot>
              </table>

              <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-muted">
                By region
              </h3>
              <ul className="flex flex-col gap-1.5">
                {report.byRegion.map((entry) => (
                  <li key={entry.region} className="flex items-center gap-2.5 text-xs">
                    <span className="w-20 shrink-0 text-muted">{entry.region}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <span
                        className="block h-full rounded-full bg-brand/70"
                        style={{ width: `${(entry.amountUgx / maxRegion) * 100}%` }}
                      />
                    </span>
                    <span className="w-24 shrink-0 text-right tabular-nums">
                      {formatCurrency(entry.amountUgx)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Per-member allocation */}
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                Allocation by member
              </h3>
              <div className="max-h-80 overflow-y-auto rounded-lg border border-line">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="sticky top-0">
                    <tr className="border-b border-line bg-surface-2 text-[10px] uppercase tracking-wider text-muted">
                      <th scope="col" className="px-2.5 py-1.5 font-medium">
                        Member
                      </th>
                      <th scope="col" className="px-2.5 py-1.5 text-right font-medium">
                        Plays
                      </th>
                      <th scope="col" className="px-2.5 py-1.5 text-right font-medium">
                        Share
                      </th>
                      <th scope="col" className="px-2.5 py-1.5 text-right font-medium">
                        UGX
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.allocations.map((allocation) => (
                      <tr
                        key={allocation.memberId}
                        className="border-b border-line/50 last:border-0 hover:bg-surface-2/50"
                      >
                        <td className="px-2.5 py-1.5">
                          <span className="block truncate font-medium">{allocation.artist}</span>
                          <span className="block font-mono text-[10px] text-muted">
                            {allocation.memberId} · {allocation.works} work
                            {allocation.works === 1 ? "" : "s"} · {allocation.stations} stations
                          </span>
                        </td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums">
                          {formatNumber(allocation.plays)}
                        </td>
                        <td className="px-2.5 py-1.5 text-right font-mono text-muted tabular-nums">
                          {(allocation.shareOfPool * 100).toFixed(1)}%
                        </td>
                        <td className="px-2.5 py-1.5 text-right font-medium tabular-nums">
                          {formatCurrency(allocation.allocationUgx)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <p className="rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 text-[11px] leading-relaxed text-brand">
            <strong className="font-semibold">Estimate only.</strong> Figures apply a placeholder flat
            tariff ({tariffSummary} UGX/play) and an indicative UGX {formatNumber(UGX_PER_USD)}/USD
            rate. Neither is the published UPRS schedule — swap the constants in{" "}
            <code className="font-mono">lib/uprs.ts</code> before circulating to members or
            licensees.
          </p>
        </div>
      )}
    </section>
  );
}
