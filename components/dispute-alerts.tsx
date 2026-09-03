import { formatDateTime } from "@/lib/format";
import { DISPUTE_KIND_LABEL, rightTypeLabel, type RightsDispute } from "@/lib/splits";

interface DisputeAlertsProps {
  disputes: RightsDispute[];
  /** Heading level, so the box can sit inside the CMO view or on the splits page. */
  heading?: string;
  intro?: string;
}

/**
 * Rights disputes the CMO has to clear before it can pay anyone.
 *
 * Three shapes turn up in practice: two parties each claiming the whole of the
 * same right on one ISRC, a split sheet whose shares total more than 100, and a
 * claim against an ISRC the CMO has no delivered recording for — which cannot be
 * verified at all until the work is delivered and matched.
 */
export function DisputeAlerts({
  disputes,
  heading = "Dispute resolution",
  intro = "Overlapping registrations and unexecutable split sheets, worst first.",
}: DisputeAlertsProps) {
  if (disputes.length === 0) {
    return (
      <section className="panel p-4" aria-labelledby="disputes-heading">
        <h2 id="disputes-heading" className="text-sm font-semibold tracking-tight">
          {heading}
        </h2>
        <p className="mt-3 rounded border border-dashed border-line px-4 py-8 text-center text-xs text-muted">
          No open disputes. Every registered claim reconciles against a delivered recording.
        </p>
      </section>
    );
  }

  const critical = disputes.filter((d) => d.severity === "critical").length;

  return (
    <section className="panel p-4" aria-labelledby="disputes-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="disputes-heading" className="text-sm font-semibold tracking-tight">
            {heading}
          </h2>
          <p className="mt-1 text-xs text-muted">{intro}</p>
        </div>
        <span className="chip" style={{ color: critical > 0 ? "#f0544f" : undefined }}>
          {critical} critical · {disputes.length} open
        </span>
      </div>

      <ul className="mt-4 space-y-2.5">
        {disputes.map((dispute) => (
          <li
            key={dispute.id}
            className="rounded-lg border border-line bg-surface-2 p-3"
            style={{
              borderLeft: `3px solid ${dispute.severity === "critical" ? "#f0544f" : "var(--brand)"}`,
            }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{dispute.headline}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{dispute.detail}</p>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="chip">{DISPUTE_KIND_LABEL[dispute.kind]}</span>
                <span
                  className="chip"
                  style={{ color: dispute.severity === "critical" ? "#f0544f" : "var(--brand)" }}
                >
                  {dispute.severity}
                </span>
              </div>
            </div>

            <ul className="mt-3 space-y-1 border-t border-line pt-2 text-xs">
              {dispute.claimants.map((claimant) => (
                <li key={`${dispute.id}-${claimant.name}`} className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>
                    <span className="font-medium">{claimant.name}</span>{" "}
                    <span className="text-muted">
                      claims {claimant.claimPct}% of {rightTypeLabel(claimant.rightType)}
                    </span>
                  </span>
                  <span className="font-mono text-[11px] text-muted">
                    filed {formatDateTime(claimant.registeredOn)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
              <span className="font-mono">{dispute.isrc}</span>
              {dispute.external ? (
                <span className="chip text-brand">no delivered recording on file</span>
              ) : null}
              <span>Raised {formatDateTime(dispute.raisedAt)}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
