"use client";

import { useMemo, useState } from "react";

import { DisputeAlerts } from "@/components/dispute-alerts";
import { SplitApprovals } from "@/components/split-approvals";
import { SplitPie } from "@/components/split-pie";
import { SHEET_STATUS_LABEL, type RightsDispute, type SplitSheet } from "@/lib/splits";

interface SplitManagerProps {
  sheets: SplitSheet[];
  disputes: RightsDispute[];
}

/**
 * Rights and split-sheet management.
 *
 * Ownership, sign-off and disputes for one recording at a time, with the CMO's
 * open disputes kept visible underneath — a sheet cannot be executed while the
 * underlying registration is contested.
 */
export function SplitManager({ sheets, disputes }: SplitManagerProps) {
  const [selectedIsrc, setSelectedIsrc] = useState(sheets[0]?.isrc ?? "");

  const sheet = useMemo(
    () => sheets.find((s) => s.isrc === selectedIsrc) ?? sheets[0],
    [sheets, selectedIsrc],
  );

  const executed = sheets.filter((s) => s.status === "complete").length;
  const outstanding = sheets.filter((s) => s.status === "awaiting-signatures").length;

  return (
    <div className="flex flex-col gap-4 pb-8">
      <section className="panel p-4">
        <h2 className="text-sm font-semibold tracking-tight">Catalogue split sheets</h2>
        <p className="mt-1 text-xs text-muted">
          {sheets.length} recordings · {executed} fully executed · {outstanding} awaiting signatures ·{" "}
          {disputes.length} open dispute{disputes.length === 1 ? "" : "s"}
        </p>

        <div className="mt-3 flex flex-wrap gap-1" role="tablist" aria-label="Select recording">
          {sheets.map((option) => (
            <button
              key={option.isrc}
              type="button"
              role="tab"
              aria-selected={option.isrc === sheet?.isrc}
              onClick={() => setSelectedIsrc(option.isrc)}
              className={option.isrc === sheet?.isrc ? "btn btn-primary" : "btn btn-ghost"}
            >
              {option.title}
              {option.status === "awaiting-signatures" ? (
                <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />
              ) : null}
            </button>
          ))}
        </div>
      </section>

      {sheet ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <section className="panel p-4" aria-labelledby="ownership-heading">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="ownership-heading" className="text-sm font-semibold tracking-tight">
                  Ownership split
                </h2>
                <p className="mt-1 text-xs text-muted">
                  “{sheet.title}” — {sheet.primaryArtist} ·{" "}
                  <span className="font-mono">{sheet.isrc}</span>
                </p>
              </div>
              <span
                className="chip"
                style={{ color: sheet.status === "complete" ? "var(--accent)" : "var(--brand)" }}
              >
                {SHEET_STATUS_LABEL[sheet.status]}
              </span>
            </div>

            <div className="mt-4">
              <SplitPie parties={sheet.parties} totalPct={sheet.totalPct} />
            </div>
          </section>

          <SplitApprovals parties={sheet.parties} title={sheet.title} isrc={sheet.isrc} />
        </div>
      ) : null}

      <DisputeAlerts
        disputes={disputes}
        heading="CMO dispute queue"
        intro="Overlapping ISRC registrations and unexecutable sheets. Payments on an affected recording are held until the claim is resolved."
      />

      <p className="pb-2 text-center text-[11px] text-muted">
        Split sheets, sign-offs and disputes are simulated fixture data. Shares are illustrative and
        no signature is a real execution.
      </p>
    </div>
  );
}
