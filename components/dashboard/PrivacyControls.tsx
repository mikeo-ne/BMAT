"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { acceptTerms, cancelDeletion, exportMyData, loadConsent, requestDeletion, TERMS_VERSION, type ConsentState } from "@/lib/legal";
import { DEMO_MODE } from "@/lib/auth-context";

/** Asks people who signed up before the current Terms / Privacy Notice to accept them. */
export function TermsBanner() {
  const [state, setState] = useState<ConsentState | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { loadConsent().then(setState).catch(() => setState(null)); }, []);
  if (DEMO_MODE || !state || state.version === TERMS_VERSION) return null;
  const accept = async () => {
    setBusy(true); setErr(null);
    try { await acceptTerms(); setState({ ...state, version: TERMS_VERSION, acceptedAt: new Date().toISOString() }); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't save. Try again."); }
    finally { setBusy(false); }
  };
  return (
    <div role="region" aria-label="Updated terms" className="glass flex flex-wrap items-center gap-3 border-emerald-400/30 p-4">
      <p className="min-w-0 flex-1 text-sm text-slate-300">
        <b className="text-white">We&apos;ve updated our terms.</b> Please review the <Link href="/legal/terms" className="text-emerald-400 underline">Terms of Use</Link> and{" "}
        <Link href="/legal/privacy" className="text-emerald-400 underline">Privacy Notice</Link>, including how your data is stored on secure servers outside Uganda.
      </p>
      <button type="button" className="btn-primary !py-2" onClick={accept} disabled={busy}>{busy ? "Saving…" : "I agree"}</button>
      {err && <p role="alert" className="w-full text-xs text-rose-300">{err}</p>}
    </div>
  );
}

/** Right of access and erasure: download everything we hold, or ask for the account to be deleted. */
export function YourData() {
  const [state, setState] = useState<ConsentState | null>(null);
  const [busy, setBusy] = useState<"" | "export" | "delete">("");
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { loadConsent().then(setState).catch(() => setState(null)); }, []);

  const download = async () => {
    setBusy("export"); setMsg(null);
    try {
      const data = await exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `east-sound-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      setMsg("Your data has been downloaded.");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Couldn't export. Try again."); }
    finally { setBusy(""); }
  };
  const del = async () => {
    if (!window.confirm("Ask East Sound to delete your account and everything linked to it?\n\nWe complete deletions within 30 days. You can cancel until then. Records we must keep for open disputes, accounting or legal reasons are kept without your login.")) return;
    setBusy("delete"); setMsg(null);
    try { const at = await requestDeletion(); setState((s) => ({ version: s?.version ?? null, acceptedAt: s?.acceptedAt ?? null, deletionRequestedAt: at })); setMsg("Deletion requested. We'll email you when it's done."); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Couldn't send the request."); }
    finally { setBusy(""); }
  };
  const cancel = async () => {
    setBusy("delete"); setMsg(null);
    try { await cancelDeletion(); setState((s) => (s ? { ...s, deletionRequestedAt: null } : s)); setMsg("Deletion cancelled."); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Couldn't cancel."); }
    finally { setBusy(""); }
  };

  return (
    <section id="your-data" className="scroll-mt-20">
      <div className="mb-3">
        <p className="font-mono text-[11px] uppercase tracking-widest text-emerald-400/80">Privacy</p>
        <h2 className="text-lg font-semibold text-white">Your data</h2>
      </div>
      <div className="glass space-y-4 p-4 sm:p-5">
        <p className="text-sm text-slate-400">
          Under Uganda&apos;s Data Protection and Privacy Act you can see what we hold about you and ask us to delete it.
          See the <Link href="/legal/privacy" className="text-emerald-400 underline">Privacy Notice</Link>.
          {state?.acceptedAt && <> You accepted the current terms on {new Date(state.acceptedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.</>}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-ghost !py-2" onClick={download} disabled={busy !== ""}>{busy === "export" ? "Preparing…" : "Download my data"}</button>
          {state?.deletionRequestedAt ? (
            <>
              <span className="text-xs text-amber-200">Deletion requested on {new Date(state.deletionRequestedAt).toLocaleDateString("en-GB")}.</span>
              <button type="button" className="text-xs text-slate-400 underline hover:text-white" onClick={cancel} disabled={busy !== ""}>Cancel request</button>
            </>
          ) : (
            <button type="button" className="rounded-lg border border-rose-500/40 px-3 py-2 text-sm font-semibold text-rose-300 hover:bg-rose-500/10" onClick={del} disabled={busy !== "" || DEMO_MODE}>
              Delete my account
            </button>
          )}
        </div>
        {msg && <p role="status" className="text-xs text-slate-300">{msg}</p>}
      </div>
    </section>
  );
}
