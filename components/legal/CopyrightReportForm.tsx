"use client";

import { useState, type FormEvent } from "react";
import { submitCopyrightReport, type CopyrightReport } from "@/lib/legal";

const EMPTY: CopyrightReport = { reporter_name: "", reporter_email: "", reporter_role: "owner", work_title: "", where_on_east_sound: "", details: "", good_faith: false };

export function CopyrightReportForm() {
  const [f, setF] = useState<CopyrightReport>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof CopyrightReport>(k: K, v: CopyrightReport[K]) => setF((x) => ({ ...x, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!f.reporter_name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.reporter_email) || !f.work_title.trim() || !f.where_on_east_sound.trim() || f.details.trim().length < 10) {
      return setErr("Please complete every field — details need at least 10 characters.");
    }
    if (!f.good_faith) return setErr("Please confirm the statement at the bottom.");
    setBusy(true);
    try {
      await submitCopyrightReport({ ...f, reporter_name: f.reporter_name.trim(), reporter_email: f.reporter_email.trim(), work_title: f.work_title.trim(), where_on_east_sound: f.where_on_east_sound.trim(), details: f.details.trim() });
      setDone(true);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Couldn't send. Try again or email us.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return <p role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-emerald-100">Thank you — your report has been received. We&apos;ll reply to {f.reporter_email} within 3 working days.</p>;
  }
  return (
    <form onSubmit={submit} noValidate className="not-prose space-y-4 rounded-xl border border-slate-800 bg-slate-950/40 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label" htmlFor="cr-name">Your full name</label><input id="cr-name" className="input" value={f.reporter_name} onChange={(e) => set("reporter_name", e.target.value)} maxLength={120} autoComplete="name" /></div>
        <div><label className="label" htmlFor="cr-email">Email</label><input id="cr-email" type="email" className="input" value={f.reporter_email} onChange={(e) => set("reporter_email", e.target.value)} maxLength={200} autoComplete="email" /></div>
      </div>
      <div>
        <label className="label" htmlFor="cr-role">You are</label>
        <select id="cr-role" className="input" value={f.reporter_role} onChange={(e) => set("reporter_role", e.target.value as CopyrightReport["reporter_role"])}>
          <option value="owner">The rights holder (artist, songwriter, label or publisher)</option>
          <option value="authorised_agent">Acting for the rights holder (manager, lawyer, distributor)</option>
          <option value="other">Other (for example a broadcaster)</option>
        </select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label" htmlFor="cr-work">Song title and artist</label><input id="cr-work" className="input" value={f.work_title} onChange={(e) => set("work_title", e.target.value)} maxLength={200} /></div>
        <div><label className="label" htmlFor="cr-where">Where you saw it on East Sound</label><input id="cr-where" className="input" placeholder="Proof link, chart, or account name" value={f.where_on_east_sound} onChange={(e) => set("where_on_east_sound", e.target.value)} maxLength={500} /></div>
      </div>
      <div>
        <label className="label" htmlFor="cr-details">What is wrong, and how you hold the rights</label>
        <textarea id="cr-details" rows={5} className="input" value={f.details} onChange={(e) => set("details", e.target.value)} maxLength={4000}
          placeholder="E.g. I wrote and released this song through my distributor (ISRC …). The account that uploaded it has no agreement with me." />
      </div>
      <label className="flex items-start gap-2.5 text-sm text-slate-300">
        <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-emerald-400" checked={f.good_faith} onChange={(e) => set("good_faith", e.target.checked)} />
        <span>I believe in good faith that this use is not authorised, and the information in this report is accurate.</span>
      </label>
      {err && <p role="alert" className="text-sm text-rose-300">{err}</p>}
      <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Sending…" : "Send report"}</button>
    </form>
  );
}
