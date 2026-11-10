"use client";

import { useState } from "react";

import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/db/core";
import { formatUgx, normaliseMsisdn, planAmount, planReference, type Billing, type Plan } from "@/lib/plans";

/**
 * "Start this plan" — a request a human can bill, not a fake checkout.
 *
 * Mobile money is how Uganda pays, and until a collection account is live we do
 * not pretend to charge a card. The row lands in `plan_requests` with a
 * reference the person can quote on the phone; RLS only lets them create their
 * own request and only a CMO/admin can move it to active.
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
    const phone = normaliseMsisdn(msisdn);
    if (!phone) {
      setError("Enter a Ugandan mobile number, e.g. 0772 123 456.");
      return;
    }
    setBusy(true);
    const reference = planReference(plan.id);
    const { error: err } = await sb.from("plan_requests").insert({
      reference,
      profile_id: session.userId,
      plan: plan.id,
      billing,
      amount_ugx: plan.custom ? 0 : amount,
      msisdn: phone,
      note: note.trim().slice(0, 500) || null,
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
        <p className="text-sm font-semibold text-emerald-300">Request received — {done}</p>
        <p className="mt-1 text-xs text-slate-400">
          We will call {normaliseMsisdn(msisdn) ?? msisdn} to arrange payment and switch the plan on. Quote the
          reference above if you ring us first.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
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
              {b === "monthly" ? formatUgx(plan.monthlyUgx) + " / month" : `${formatUgx(planAmount(plan, "annual"))} / year`}
            </button>
          ))}
        </div>
      )}
      <label className="block">
        <span className="label">Mobile money number</span>
        <input
          className="input"
          inputMode="tel"
          placeholder="0772 123 456"
          value={msisdn}
          onChange={(e) => setMsisdn(e.target.value)}
          aria-label={`Mobile money number for the ${plan.name} plan`}
        />
      </label>
      <label className="block">
        <span className="label">Anything we should know? (optional)</span>
        <input className="input" placeholder="Label name, catalogue size, station…" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
      <button type="button" className="btn-primary w-full !py-2" onClick={submit} disabled={busy}>
        {busy ? "Sending…" : session ? (plan.custom ? "Request a quote" : `Start ${plan.name} · ${formatUgx(amount)}`) : "Create an account to start"}
      </button>
      <p className="text-[11px] text-slate-500">
        {plan.custom
          ? "Quoted plans are agreed on a call; nothing is charged automatically."
          : "Paid by MTN or Airtel mobile money. No card, no automatic renewal until you confirm."}
      </p>
    </div>
  );
}
