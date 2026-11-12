"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { DEMO_MODE, useAuth, type AuthMode } from "@/lib/auth-context";
import { isRole, ROLE_META, ROLES, type Role } from "@/lib/roles";
import { cx } from "@/lib/safe";
import { PasswordInput } from "./PasswordInput";

const TITLES: Record<AuthMode, string> = {
  signin: "Sign in to your workspace",
  signup: "Create your workspace",
  forgot: "Recover your password",
};

export function AuthModal() {
  const { modal, closeAuth, openAuth, signIn, signUp, requestPasswordReset, verifySignupCode, resendSignupCode } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // After sign-up: waiting for the code from the confirmation email.
  const [verifying, setVerifying] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!modal) return;
    setError(null);
    setNotice(null);
    setVerifying(null);
    setCode("");
    const id = window.setTimeout(() => firstField.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeAuth();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [modal, closeAuth]);

  if (!modal) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (modal !== "forgot" && !isRole(role)) {
      setError("Select your use case / role to continue.");
      return;
    }
    if (modal === "signup" && !agreed) {
      setError("Please confirm you're 18 or older and agree to the Terms and Privacy Notice.");
      return;
    }
    setBusy(true);
    try {
      if (modal === "forgot") {
        const r = await requestPasswordReset(email.trim());
        r.ok ? setNotice(r.message ?? "Check your inbox.") : setError(r.error);
        return;
      }
      const r =
        modal === "signin"
          ? await signIn(email.trim(), password, role as Role)
          : await signUp(email.trim(), password, role as Role, name.trim());
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (r.message === "verify" && modal === "signup") {
        setVerifying(email.trim());
        return;
      }
      if (r.message && modal === "signup" && !DEMO_MODE) {
        setNotice(r.message);
        return;
      }
      closeAuth();
      router.push(ROLE_META[role as Role].path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e: FormEvent) => {
    e.preventDefault();
    if (!verifying || !isRole(role)) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const r = await verifySignupCode(verifying, code, role);
      if (!r.ok) return setError(r.error);
      closeAuth();
      router.push(ROLE_META[role].path);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (!verifying) return;
    setError(null);
    setNotice(null);
    const r = await resendSignupCode(verifying);
    r.ok ? setNotice(r.message ?? "Sent.") : setError(r.error);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={closeAuth} />
      <div className="glass relative w-full max-w-md animate-fade-in border-emerald-400/20 p-6 shadow-2xl shadow-emerald-950/40 sm:p-7">
        <button type="button" onClick={closeAuth} className="absolute right-4 top-4 text-slate-500 hover:text-white" aria-label="Close">
          ✕
        </button>

        {modal !== "forgot" && (
          <div className="mb-5 grid grid-cols-2 rounded-xl border border-slate-800 p-1">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => openAuth(m)}
                className={cx("rounded-lg py-2 text-sm font-semibold transition", modal === m ? "bg-emerald-400 text-slate-950" : "text-slate-400 hover:text-white")}
              >
                {m === "signin" ? "Sign In" : "Sign Up"}
              </button>
            ))}
          </div>
        )}

        <h2 id="auth-title" className="text-xl font-bold text-white">
          {verifying ? "Check your email" : TITLES[modal]}
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          {modal === "forgot"
            ? "We'll email you a secure link to set a new password."
            : "Your use case decides which dashboard you get. Data never crosses between roles."}
        </p>

        {verifying ? (
          <form onSubmit={submitCode} className="mt-5 space-y-4" noValidate>
            <p className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100">
              We sent a verification code to <b className="break-all">{verifying}</b>. Enter it below to finish creating your account.
            </p>
            <div>
              <label htmlFor="code" className="label">Verification code</label>
              <input
                id="code"
                className="input text-center font-mono text-2xl tracking-[0.5em]"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={10}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                autoFocus
                required
              />
              <p className="mt-1.5 text-xs text-slate-500">Can&apos;t see it? Check spam or promotions. You can also click the link in the same email.</p>
            </div>
            {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}
            {notice && <p role="status" className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">{notice}</p>}
            <button type="submit" className="btn-primary w-full" disabled={busy || code.length < 6}>
              {busy ? "Checking…" : "Verify and continue"}
            </button>
            <div className="flex justify-between text-sm">
              <button type="button" onClick={resend} className="text-emerald-400 hover:text-emerald-300">Send a new code</button>
              <button type="button" onClick={() => { setVerifying(null); setCode(""); setError(null); setNotice(null); }} className="text-slate-400 hover:text-white">Use a different email</button>
            </div>
          </form>
        ) : (
        <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
          {modal !== "forgot" && (
            <div>
              <label htmlFor="role" className="label">
                Select your use case / role
              </label>
              <select id="role" className="input" value={role} onChange={(e) => setRole(isRole(e.target.value) ? e.target.value : "")} required>
                <option value="" disabled>
                  Choose one…
                </option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_META[r].label}
                  </option>
                ))}
              </select>
              {role && <p className="mt-1.5 text-xs text-slate-500">{ROLE_META[role].blurb}</p>}
            </div>
          )}

          {modal === "signup" && (
            <div>
              <label htmlFor="name" className="label">
                Organisation or artist name
              </label>
              <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="organization" />
            </div>
          )}

          <div>
            <label htmlFor="email" className="label">
              Email
            </label>
            <input
              ref={firstField}
              id="email"
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          {modal !== "forgot" && (
            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="label">
                  Password
                </label>
                {modal === "signin" && (
                  <button type="button" onClick={() => openAuth("forgot")} className="mb-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300">
                    Forgot password?
                  </button>
                )}
              </div>
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={modal === "signup" ? "new-password" : "current-password"}
                minLength={modal === "signup" ? 8 : 6}
                required
              />
            </div>
          )}

          {modal === "signup" && (
            <label className="flex items-start gap-2.5 text-xs leading-5 text-slate-400">
              <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-400" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} required />
              <span>
                I&apos;m 18 or older and I agree to the{" "}
                <a href="/legal/terms" target="_blank" rel="noopener" className="text-emerald-400 underline">Terms of Use</a> and{" "}
                <a href="/legal/privacy" target="_blank" rel="noopener" className="text-emerald-400 underline">Privacy Notice</a>, including my
                details being stored on secure servers outside Uganda.
              </span>
            </label>
          )}

          {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}
          {notice && <p role="status" className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">{notice}</p>}

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? "Please wait…" : modal === "signin" ? "Sign In" : modal === "signup" ? "Create Account" : "Send Recovery Link"}
          </button>

          {modal === "forgot" && (
            <button type="button" onClick={() => openAuth("signin")} className="w-full text-center text-sm text-slate-400 hover:text-white">
              ← Back to sign in
            </button>
          )}
        </form>
        )}

        {DEMO_MODE && (
          <p className="mt-5 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-amber-200/80">
            Demo mode — Supabase isn&apos;t configured, so any email + 6-character password signs you in to the selected role with sample data.
          </p>
        )}
      </div>
    </div>
  );
}
