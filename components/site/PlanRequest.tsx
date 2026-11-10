"use client";

import { useState } from "react";

import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/db/core";
import {
  EARLY_ACCESS,
  PAYMENTS_ENABLED,
  formatUgx,
  normaliseMsisdn,
  planAmount,
  planReference,
  type Billing,
  type Plan,
} from "@/lib/plans";

/**
 * "Join" — during early access this is a signup, not a checkout.
 *
 * Payments are deliberately off while the panel grows: the request records who
 * wants which plan and how to reach them, stores zero shillings due, and tells
 * the person plainly that nothing will be charged. Turning
 * NEXT_PUBLIC_PAYMENTS_ENABLED on switches the same component to a paid request
 * with a mobile-money number and an amount.
 */
export function PlanRequest({ plan }: { plan: Plan }) {
  const { session, openAuth } = useAuth();
  const [billing, setBilling] = useState<Billing>("monthly");
  const [msisdn, setMsisdn] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const amount = planAmount(plan, billing);

  const submit = async () => {
    setError(null);
    const sb = db();
    if (!sb || !session) {
      openAuth("signup");
      return;
    }
    const phone = msisdn.trim() ? normaliseMsisdn(msisdn) : null;
    if (msisdn.trim() && !phone) {
      setError("That does not look like a Ugandan mobile number — check it, or leave it blank.");
      return;
    }
    setBusy(true);
    const reference = planReference(plan.id);
    const { error: err } = await sb.from("plan_requests").insert({
      reference,
      profile_id: session.userId,
      plan: plan.id,
      billing,
      amount_ugx: PAYMENTS_ENABLED ? amount : 0,
      msisdn: phone,
      note:
        [PAYMENTS_ENABLED ? null : "[early access]", note.trim()]
          .filter(Boolean)
          .join(" ")
          .slice(0, 500) || null,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDone(reference);
  };

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-4">
        <p className="text-sm font-semibold text-emerald-300">
          {PAYMENTS_ENABLED ? `Request received — ${done}` : `You're on the list — ${done}`}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          {PAYMENTS_ENABLED
            ? "We will call to arrange payment and switch the plan on. Quote the reference above if you ring us first."
            : "Nothing has been charged and no card details were taken. Your account already has the whole panel; we will contact you before any price applies."}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {EARLY_ACCESS.active && (
        <p className="rounded-lg border border-emerald-400/25 bg-emerald-400/5 px-3 py-2 text-xs text-emerald-200">
          {EARLY_ACCESS.badge} — {plan.custom ? "quoted plans are agreed later" : `${formatUgx(amount)} is the price after early access, not today`}.
        </p>
      )}

      {!plan.custom && (
        <div className="flex gap-2" role="group" aria-label="Billing period">
          {(["monthly", "annual"] as Billing[]).map((b) => (
            <button
              key={b}
              type="button"
              aria-pressed={billing === b}
              onClick={() => setBilling(b)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                billing === b ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-300" : "border-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              {b === "monthly" ? `${formatUgx(plan.monthlyUgx)} / month` : `${formatUgx(planAmount(plan, "annual"))} / year`}
            </button>
          ))}
        </div>
      )}

      <label className="block">
        <span className="label">{PAYMENTS_ENABLED ? "Mobile money number" : "Phone or WhatsApp (optional)"}</span>
        <input
          className="input"
          inputMode="tel"
          placeholder="0772 123 456"
          value={msisdn}
          onChange={(e) => setMsisdn(e.target.value)}
          aria-label={`Contact number for the ${plan.name} plan`}
        />
      </label>
      <label className="block">
        <span className="label">Anything we should know? (optional)</span>
        <input className="input" placeholder="Label name, catalogue size, station…" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>

      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}

      <button type="button" className="btn-primary w-full !py-2" onClick={submit} disabled={busy}>
        {busy
          ? "Sending…"
          : !session
            ? PAYMENTS_ENABLED
              ? "Create an account to join"
              : `Join ${plan.name} free — create an account`
            : PAYMENTS_ENABLED
              ? plan.custom
                ? "Request a quote"
                : `Start ${plan.name} · ${formatUgx(amount)}`
              : plan.custom
                ? "Request early access"
                : `Join ${plan.name} — free for now`}
      </button>

      <p className="text-[11px] text-slate-500">
        {PAYMENTS_ENABLED
          ? plan.custom
            ? "Quoted plans are agreed on a call; nothing is charged automatically."
            : "Paid by MTN or Airtel mobile money. No card, no automatic renewal until you confirm."
          : "No card, no mobile money, no invoice. Early access is free while we build the panel — you will hear from us before that changes."}
      </p>
    </div>
  );
}
