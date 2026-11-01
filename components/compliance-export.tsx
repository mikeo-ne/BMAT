"use client";
import { Download, FileCheck2, Info } from "lucide-react";
import {
  complianceLoggingCsv,
  LOGGING_SHEET_NOTE,
  summariseWeightedSpins,
} from "@/lib/compliance";
import { downloadCsv } from "@/lib/csv";
import type { WeightingPolicy } from "@/lib/dayparts";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { BroadcastSpin } from "@/lib/playout";
import type { Track } from "@/lib/types";

export function ComplianceExport({
  events,
  catalogue,
  policy,
  onExport,
}: {
  events: BroadcastSpin[];
  catalogue: Track[];
  policy: WeightingPolicy;
  onExport?: () => void;
}) {
  const pricing = summariseWeightedSpins(events, policy);
  const unknown = events.filter((event) => !event.trackId).length;
  const missingIsrc = events.filter(
    (event) => event.trackId && !event.isrc,
  ).length;
  return (
    <section
      className="panel overflow-hidden"
      aria-labelledby="compliance-export-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
            <FileCheck2 size={22} />
          </span>
          <div>
            <p className="eyebrow">STATION MANAGER’S DESK</p>
            <h3
              id="compliance-export-heading"
              className="mt-1 text-sm font-semibold"
            >
              UPRS review logging sheet
            </h3>
            <p className="mt-1 text-[10px] leading-relaxed text-muted">
              {formatNumber(events.length)} selected event logs · {unknown}{" "}
              unmatched · {missingIsrc} missing ISRC · UGX{" "}
              {formatCurrency(pricing.weightedPoolUgx)} illustrative estimate
            </p>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary !text-xs"
          disabled={!events.length}
          onClick={() => {
            downloadCsv(
              `east-sound-uprs-logging-${new Date().toISOString().slice(0, 10)}.csv`,
              complianceLoggingCsv(events, catalogue, policy),
            );
            onExport?.();
          }}
        >
          <Download size={14} />
          Export UPRS logging sheet
        </button>
      </div>
      <div className="flex gap-2 border-t border-line bg-surface-2/50 px-5 py-3 text-[10px] leading-relaxed text-muted">
        <Info size={13} className="mt-0.5 shrink-0" />
        <span>
          {LOGGING_SHEET_NOTE} Unavailable ISWCs, writers and programme details
          are not invented.{" "}
          {!events.length &&
            "No event logs match this selection; broaden the station, period or region filters."}
        </span>
      </div>
    </section>
  );
}
