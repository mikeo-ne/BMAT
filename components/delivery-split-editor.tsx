"use client";
import { useState } from "react";
import {
  Check,
  CheckCheck,
  PenLine,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { Dialog } from "@/components/dialog";
import { HelpTip } from "@/components/help-tip";
import {
  clearApprovals,
  DELIVERY_ROLES,
  RIGHTS,
  RIGHT_LABELS,
  rightsTotals,
  validateDeliveryParties,
  type DeliveryParty,
  type DeliveryRight,
  type DeliveryRole,
} from "@/lib/delivery-splits";

const COLORS = [
  "#278f73",
  "#8a9e5a",
  "#709ec1",
  "#b69ad3",
  "#d4a455",
  "#bc8293",
];
export function DeliverySplitEditor({
  parties,
  onChange,
  recordingReady,
}: {
  parties: DeliveryParty[];
  onChange: (parties: DeliveryParty[]) => void;
  recordingReady: boolean;
}) {
  const [right, setRight] = useState<DeliveryRight>("master");
  const [signingId, setSigningId] = useState<string | null>(null);
  const [typedName, setTypedName] = useState("");
  const [consent, setConsent] = useState(false);
  const totals = rightsTotals(parties);
  const structuralIssues = validateDeliveryParties(parties, false);
  const approved = parties.filter((party) => party.signature).length;
  const signing = parties.find((party) => party.id === signingId);
  const ready = recordingReady && structuralIssues.length === 0;
  function edit(next: DeliveryParty[]) {
    onChange(clearApprovals(next));
  }
  function patch(id: string, change: Partial<DeliveryParty>) {
    edit(
      parties.map((party) =>
        party.id === id ? { ...party, ...change } : party,
      ),
    );
  }
  function add(role: DeliveryRole) {
    edit([
      ...parties,
      {
        id: crypto.randomUUID(),
        name: "",
        role,
        shares: { master: 0, performance: 0, mechanical: 0 },
        signature: null,
      },
    ]);
  }
  return (
    <section
      className="mt-6 border-t border-line pt-5"
      aria-labelledby="delivery-splits-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4
            id="delivery-splits-heading"
            className="flex items-center gap-2 text-sm font-semibold"
          >
            <Users size={16} className="text-brand" />
            Ownership & approvals
          </h4>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            Agree three separate rights pools before submitting your master.
          </p>
        </div>
        <span
          className={`chip ${approved === parties.length && ready ? "text-brand" : ""}`}
        >
          <CheckCheck size={12} />
          {approved}/{parties.length} approvals
        </span>
      </div>
      <div className="my-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {RIGHTS.map((pool) => (
          <button
            type="button"
            key={pool}
            onClick={() => setRight(pool)}
            aria-pressed={right === pool}
            className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-[10px] ${right === pool ? "border-brand/30 bg-brand/5 font-medium" : "border-line text-muted"}`}
          >
            <span>{RIGHT_LABELS[pool]}</span>
            <span
              className={
                Math.abs(totals[pool] - 100) < 0.001
                  ? "text-brand"
                  : "text-red-400"
              }
            >
              {totals[pool]}%
            </span>
          </button>
        ))}
      </div>
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1 text-[11px] font-medium">
          {RIGHT_LABELS[right]}
          <HelpTip topic={right} />
        </span>
        <span className="text-[10px] text-muted">Must total exactly 100%</span>
      </div>
      <div
        className="mb-4 flex h-2 overflow-hidden rounded-full bg-surface-2"
        aria-label={`${RIGHT_LABELS[right]} allocation ${totals[right]} percent`}
      >
        {parties.map((party, i) => (
          <span
            key={party.id}
            style={{
              width: `${party.shares[right]}%`,
              background: COLORS[i % COLORS.length],
            }}
            title={`${party.name || "Unnamed"}: ${party.shares[right]}%`}
          />
        ))}
      </div>
      <div className="space-y-3">
        {parties.map((party, i) => (
          <div
            key={party.id}
            className="rounded-xl border border-line bg-surface-2/40 p-3"
          >
            <div className="grid grid-cols-[minmax(0,1fr)_82px] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_110px_72px_auto]">
              <label className="min-w-0">
                <span className="mb-1.5 flex items-center gap-1.5 text-[9px] text-muted">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: COLORS[i % COLORS.length] }}
                  />
                  Collaborator {i + 1}
                </span>
                <input
                  className="field !bg-surface !text-xs"
                  aria-label={`Collaborator ${i + 1} name`}
                  placeholder="Full credited name"
                  value={party.name}
                  maxLength={120}
                  onChange={(event) =>
                    patch(party.id, { name: event.target.value })
                  }
                />
              </label>
              <label className="order-3 sm:order-none">
                <span className="label !text-[9px]">Role</span>
                <select
                  className="field !bg-surface !text-[10px]"
                  aria-label={`Collaborator ${i + 1} role`}
                  value={party.role}
                  disabled={party.id === "primary"}
                  onChange={(event) =>
                    patch(party.id, {
                      role: event.target.value as DeliveryRole,
                    })
                  }
                >
                  {DELIVERY_ROLES.map((role) => (
                    <option key={role}>{role}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="label !text-[9px]">Share %</span>
                <input
                  className="field !bg-surface !text-xs"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  aria-label={`${party.name || `Collaborator ${i + 1}`} ${RIGHT_LABELS[right]} percentage`}
                  value={party.shares[right]}
                  onChange={(event) =>
                    patch(party.id, {
                      shares: {
                        ...party.shares,
                        [right]: Number(event.target.value),
                      },
                    })
                  }
                />
              </label>
              <div className="order-4 flex items-center justify-end gap-1">
                <button
                  type="button"
                  className={`btn !px-2.5 !py-2.5 !text-[10px] ${party.signature ? "bg-brand/10 text-brand" : "btn-ghost !bg-surface"}`}
                  disabled={!ready || !!party.signature}
                  onClick={() => {
                    setSigningId(party.id);
                    setTypedName("");
                    setConsent(false);
                  }}
                  aria-label={`${party.signature ? "Approval recorded for" : "Record approval for"} ${party.name || `collaborator ${i + 1}`}`}
                >
                  {party.signature ? (
                    <Check size={12} />
                  ) : (
                    <PenLine size={12} />
                  )}
                  {party.signature ? "Approved" : "Approve"}
                </button>
                {party.id !== "primary" && (
                  <button
                    type="button"
                    className="icon-btn !w-7"
                    aria-label={`Remove ${party.name || `collaborator ${i + 1}`}`}
                    onClick={() =>
                      edit(parties.filter((entry) => entry.id !== party.id))
                    }
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-ghost !py-1.5 !text-[10px]"
          disabled={parties.length >= 30}
          onClick={() => add("Co-writer")}
        >
          <Plus size={12} />
          Add co-writer
        </button>
        <button
          type="button"
          className="btn btn-ghost !py-1.5 !text-[10px]"
          disabled={parties.length >= 30}
          onClick={() => add("Producer")}
        >
          <Plus size={12} />
          Add producer
        </button>
      </div>
      {structuralIssues.length > 0 && (
        <p
          role="status"
          className="mt-3 text-[10px] leading-relaxed text-red-400"
        >
          {structuralIssues.join(" ")}
        </p>
      )}
      {!recordingReady && structuralIssues.length === 0 && (
        <p className="mt-3 text-[10px] text-muted">
          Complete the recording title, artist and ISRC to enable approvals.
        </p>
      )}
      <p className="mt-3 flex gap-2 text-[10px] leading-relaxed text-muted">
        <ShieldCheck size={13} className="mt-0.5 shrink-0" />
        Local typed-name acknowledgements only; collaborator identity is not
        verified. Any edit to the agreement clears all approvals. Use
        authenticated e-signatures and legal review for a binding execution.
      </p>
      {signing && (
        <Dialog
          title={`Approve splits · ${signing.name}`}
          onClose={() => setSigningId(null)}
        >
          <p className="text-xs leading-relaxed text-muted">
            Review all three allocations for{" "}
            <strong className="text-foreground">{signing.name}</strong>. This
            records a local acknowledgement, not an authenticated electronic
            signature.
          </p>
          <dl className="my-5 grid grid-cols-3 gap-2">
            {RIGHTS.map((pool) => (
              <div key={pool} className="rounded-xl border border-line p-3">
                <dt className="text-[10px] text-muted">{RIGHT_LABELS[pool]}</dt>
                <dd className="mt-2 text-xl font-semibold">
                  {signing.shares[pool]}%
                </dd>
              </div>
            ))}
          </dl>
          <label className="label" htmlFor="split-signature-name">
            Type the collaborator’s full name
          </label>
          <input
            id="split-signature-name"
            className="field"
            value={typedName}
            onChange={(event) => setTypedName(event.target.value)}
            autoComplete="off"
            placeholder={signing.name}
          />
          <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-muted">
            <input
              type="checkbox"
              className="mt-1 accent-brand"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            I acknowledge these percentages and have permission to record this
            local approval.
          </label>
          <button
            type="button"
            className="btn btn-primary mt-5 w-full"
            disabled={
              !consent ||
              typedName.trim().toLowerCase() !==
                signing.name.trim().toLowerCase() ||
              !ready
            }
            onClick={() => {
              onChange(
                parties.map((party) =>
                  party.id === signing.id
                    ? {
                        ...party,
                        signature: {
                          typedName: typedName.trim(),
                          signedAt: new Date().toISOString(),
                        },
                      }
                    : party,
                ),
              );
              setSigningId(null);
            }}
          >
            <Check size={15} />
            Record local approval
          </button>
        </Dialog>
      )}
    </section>
  );
}
