"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Logo } from "@/components/site/Logo";
import { getSupabaseBrowser } from "@/lib/supabase/client";

/** Password-recovery landing page. The email link brings the user here with a
 *  one-time `code`; we exchange it for a recovery session, then set a new password. */
export default function ResetPasswordPage() {
  const [stage, setStage] = useState<"checking" | "ready" | "invalid" | "done" | "demo">("checking");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb) {
      setStage("demo");
      return;
    }
    const code = new URLSearchParams(window.location.search).get("code");
    (async () => {
      if (code) {
        const { error: e } = await sb.auth.exchangeCodeForSession(code);
        if (e) return setStage("invalid");
      }
      const { data } = await sb.auth.getSession();
      setStage(data.session ? "ready" : "invalid");
    })().catch(() => setStage("invalid"));
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) return setError("Use at least 8 characters.");
    if (pw !== pw2) return setError("Passwords don't match.");
    const sb = getSupabaseBrowser();
    if (!sb) return;
    setBusy(true);
    const { error: err } = await sb.auth.updateUser({ password: pw });
    setBusy(false);
    if (err) return setError(err.message);
    await sb.auth.signOut();
    setStage("done");
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="glass w-full max-w-md p-7">
        <Logo />
        <h1 className="mt-6 text-xl font-bold text-white">Set a new password</h1>

        {stage === "checking" && <p className="mt-4 text-sm text-slate-400">Verifying your recovery link…</p>}
        {stage === "demo" && <p className="mt-4 text-sm text-amber-200/80">Demo mode — connect Supabase to enable password recovery.</p>}
        {stage === "invalid" && (
          <p className="mt-4 text-sm text-rose-300">
            This link is invalid or has expired.{" "}
            <Link href="/?auth=forgot" className="font-semibold text-emerald-400">Request a new one</Link>.
          </p>
        )}
        {stage === "done" && (
          <p className="mt-4 text-sm text-emerald-200">
            Password updated. <Link href="/?auth=signin" className="font-semibold text-emerald-400">Sign in</Link> with your new password.
          </p>
        )}
        {stage === "ready" && (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <div>
              <label className="label" htmlFor="pw">New password</label>
              <input id="pw" type="password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
            </div>
            <div>
              <label className="label" htmlFor="pw2">Confirm password</label>
              <input id="pw2" type="password" className="input" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
            </div>
            {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
            <button className="btn-primary w-full" disabled={busy}>{busy ? "Saving…" : "Update password"}</button>
          </form>
        )}
      </div>
    </main>
  );
}
