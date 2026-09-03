"use client";

import { useMemo, useState } from "react";

import { OUTCOME_LABEL, type AirtimeAlert, type SlotOutcome } from "@/lib/advertising";
import { formatDate } from "@/lib/format";

interface AirtimeAlertsProps {
  alerts: AirtimeAlert[];
}

type SeverityFilter = "all" | "critical" | "warn";

const FILTERS: { id: SeverityFilter; label: string }[] = [
  { id: "all", label: "All breaches" },
  { id: "critical", label: "Never aired" },
  { id: "warn", label: "Aired, not as booked" },
];

const OUTCOME_TONE: Record<SlotOutcome, string> = {
  fulfilled: "text-accent",
  unverified: "text-brand",
  "off-window": "text-brand",
  missed: "text-[#f0544f]",
};

/**
 * Fraud and missed-airtime queue.
 *
 * Sorted worst first: a spot that never aired is a hard breach, while an
 * off-window or unverified spot ran but cannot be billed as booked. Advertisers
 * dispute both, so both stay visible rather than being collapsed away.
 */
export function AirtimeAlerts({ alerts }: AirtimeAlertsProps) {
  const [filter, setFilter] = useState<SeverityFilter>("all");

  const visible = useMemo(
    () => (filter === "all" ? alerts : alerts.filter((a) => a.severity === filter)),
    [alerts, filter],
  );

  const critical = alerts.filter((a) => a.severity === "critical").length;

  return (
    <section className="panel p-4" aria-labelledby="airtime-alerts-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="airtime-alerts-heading" className="text-sm font-semibold tracking-tight">
            Fraud &amp; missed airtime
          </h2>
          <p className="mt-1 text-xs text-muted">
            {critical} booked spot{critical === 1 ? "" : "s"} never aired across all campaigns.
          </p>
        </div>

        <div className="flex gap-1" role="group" aria-label="Filter breaches">
          {FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setFilter(option.id)}
              aria-pressed={filter === option.id}
              className={filter === option.id ? "btn btn-primary" : "btn btn-ghost"}
            >
              {option.label}
              <span className="ml-1.5 font-mono text-[10px] opacity-80">
                {option.id === "all"
                  ? alerts.length
                  : alerts.filter((a) => a.severity === option.id).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="mt-4 rounded border border-dashed border-line px-4 py-8 text-center text-xs text-muted">
          No breaches in this view. Every contracted spot ran as booked.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {visible.map((alert) => (
            <li
              key={alert.id}
              className="flex flex-wrap items-start gap-3 rounded-lg border border-line bg-surface-2 p-3"
            >
              <span
                aria-hidden
                className="mt-0.5 h-8 w-1 shrink-0 rounded-full"
                style={{
                  background: alert.severity === "critical" ? "#f0544f" : "var(--brand)",
                }}
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-sm font-medium">{alert.brand}</span>
                  <span className="text-xs text-muted">
                    {alert.stationName} · {formatDate(`${alert.dayIso}T00:00:00Z`)} · slot{" "}
                    {alert.slotIndex}
                  </span>
                </div>

                <p className="mt-1 text-xs leading-relaxed text-muted">{alert.detail}</p>
              </div>

              <span className={`chip ${OUTCOME_TONE[alert.outcome]}`}>
                {OUTCOME_LABEL[alert.outcome]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
