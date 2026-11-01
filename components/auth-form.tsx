"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
export function AuthForm({
  next,
  mockEnabled,
  available,
}: {
  next: string;
  mockEnabled: boolean;
  available: boolean;
}) {
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const router = useRouter(),
    auth = useAuth();
  async function send(path: string, body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/" + path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, next }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Sign-in failed.");
      await auth.update(data);
      router.replace(data.next);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <Link
          href="/dashboard/charts"
          className="mb-8 flex items-center justify-center gap-3"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-400 to-cyan-400 font-bold text-slate-950">
            ES
          </span>
          <span className="text-xl font-semibold">
            East Sound<span className="text-brand">.</span>
          </span>
        </Link>
        <section className="panel p-6 sm:p-8">
          <p className="eyebrow">YOUR MUSIC. YOUR WORKSPACE.</p>
          <h1 className="mt-3 text-2xl font-semibold">
            {register ? "Create an artist account" : "Welcome back"}
          </h1>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            {register
              ? "Your account is created as Artist / Label Manager. Station-manager and CMO roles are provisioned by the platform operator."
              : "Sign in to your assigned workspace. Permissions are checked by the server, not your browser's view settings."}
          </p>
          {!available && (
            <p
              role="status"
              className="mt-5 rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-xs text-amber-200"
            >
              This static/reference deployment has no identity datastore. Use a
              configured Node or PostgreSQL deployment to sign in.
            </p>
          )}
          <form
            className="mt-6 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void send(register ? "register" : "login", {
                name: form.get("name"),
                email: form.get("email"),
                password: form.get("password"),
                remember: form.get("remember") === "on",
              });
            }}
          >
            {register && (
              <label className="block">
                <span className="label">Your name</span>
                <input
                  className="field"
                  name="name"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={120}
                />
              </label>
            )}
            <label className="block">
              <span className="label">Email address</span>
              <input
                className="field"
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
              />
            </label>
            <div>
              <label className="label" htmlFor="auth-password">
                Password
              </label>
              <input
                id="auth-password"
                className="field"
                name="password"
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                aria-describedby={register ? "auth-password-help" : undefined}
                required
                minLength={register ? 12 : 1}
                maxLength={128}
              />
              {register && (
                <p
                  id="auth-password-help"
                  className="mt-1 text-[10px] text-muted"
                >
                  12–128 characters. Passwords are stored only as salted scrypt
                  verifiers.
                </p>
              )}
            </div>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" name="remember" defaultChecked />
              Keep me signed in for seven days
            </label>
            {error && (
              <p
                role="alert"
                className="rounded-lg border border-red-400/30 bg-red-400/5 p-3 text-xs text-red-200"
              >
                {error}
              </p>
            )}
            <button
              className="btn btn-primary w-full"
              disabled={busy || !available}
            >
              <LockKeyhole size={15} />
              {busy
                ? "Please wait…"
                : register
                  ? "Create artist account"
                  : "Sign in"}
              <ArrowRight size={14} />
            </button>
          </form>
          <button
            type="button"
            className="mt-5 w-full text-xs text-brand"
            disabled={busy}
            onClick={() => {
              setRegister(!register);
              setError("");
            }}
          >
            {register
              ? "Already have an account? Sign in"
              : "New artist or label? Create an account"}
          </button>
          {mockEnabled && (
            <div className="mt-6 border-t border-line pt-5">
              <p className="mb-3 text-[10px] text-muted">
                Development-only OAuth simulation. No external identity
                verification.
              </p>
              <div className="flex gap-2">
                {["google", "microsoft"].map((provider) => (
                  <button
                    className="btn btn-ghost flex-1 !text-xs capitalize"
                    key={provider}
                    disabled={busy}
                    onClick={() => void send("mock-oauth", { provider })}
                  >
                    Mock {provider}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
        <p className="mt-5 flex items-center justify-center gap-2 text-[10px] text-muted">
          <ShieldCheck size={12} />
          HttpOnly sessions · server-side roles · no passwords or tokens in
          localStorage
        </p>
        <Link
          className="mt-4 block text-center text-xs text-brand"
          href="/dashboard/charts"
        >
          Continue as Public Guest
        </Link>
      </div>
    </main>
  );
}
