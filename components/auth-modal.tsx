"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Apple,
  ArrowRight,
  Check,
  Clock,
  Eye,
  Globe2,
  LockKeyhole,
  Mail,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Dialog } from "@/components/dialog";

type Tab = "signin" | "signup" | "forgot";

export interface AuthModalRole {
  id: string;
  label: string;
  headline: string;
  blurb: string;
  features: string[];
}

export function AuthModal({
  role,
  onClose,
}: {
  role: AuthModalRole;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [step, setStep] = useState<"request" | "code" | "done">("request");
  const router = useRouter();
  const auth = useAuth();

  async function send(path: string, body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/" + path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Request failed.");
      if (path === "login" || path === "register" || path === "mock-oauth") {
        await auth.update(data);
        router.replace(data.next ?? "/dashboard/charts");
        router.refresh();
      } else {
        setInfo(data.message ?? "Request received.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  const submit = (path: string, body: Record<string, unknown>) => {
    setError("");
    if (tab === "signup") {
      const form = body as Record<string, string>;
      if (!form.name || form.name.trim().length < 2) {
        setError("Please enter your name (min 2 characters).");
        return;
      }
      if (!form.email) {
        setError("Please enter your email address.");
        return;
      }
      if (form.password && form.password.length < 12) {
        setError("Password must be at least 12 characters.");
        return;
      }
    }
    void send(path, body);
  };

  return (
    <Dialog title={`${role.label} — sign in`} onClose={onClose} wide>
      <div className="space-y-5 p-2">
        {/* Role context */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-white">{role.label}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-400">
                {role.blurb}
              </p>
            </div>
          </div>
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {role.features.slice(0, 4).map((feature) => (
              <li
                key={feature}
                className="flex items-start gap-2 text-xs leading-snug text-slate-300"
              >
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                {feature}
              </li>
            ))}
          </ul>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl border border-slate-800 bg-slate-950/50 p-1">
          {(
            [
              ["signin", "Sign In"],
              ["signup", "Sign Up"],
              ["forgot", "Forgot Password"],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setTab(key);
                setError("");
                setInfo("");
                setStep("request");
              }}
              className={`flex-1 rounded-lg py-2 text-xs font-bold transition-colors ${
                tab === key
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "text-slate-500 hover:text-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-400/30 bg-red-400/5 p-3 text-xs text-red-200"
          >
            {error}
          </p>
        )}
        {info && (
          <p
            role="status"
            className="rounded-lg border border-emerald-400/30 bg-emerald-400/5 p-3 text-xs text-emerald-200"
          >
            {info}
          </p>
        )}

        {tab === "signin" && (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              submit("login", {
                email: form.get("email"),
                password: form.get("password"),
                remember: form.get("remember") === "on",
              });
            }}
          >
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
            <label className="block">
              <span className="label">Password</span>
              <input
                className="field"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" name="remember" defaultChecked />
              Keep me signed in for seven days
            </label>
            <button
              className="btn btn-primary w-full"
              disabled={busy}
            >
              <LockKeyhole size={15} />
              {busy ? "Please wait…" : "Sign in"}
              <ArrowRight size={14} />
            </button>
          </form>
        )}

        {tab === "signup" && (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              submit("register", {
                name: form.get("name"),
                email: form.get("email"),
                password: form.get("password"),
              });
            }}
          >
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
            <label className="block">
              <span className="label">Password</span>
              <input
                className="field"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
              />
              <p className="mt-1 text-[10px] text-muted">
                12–128 characters. Passwords are stored only as salted scrypt
                verifiers.
              </p>
            </label>
            <button
              className="btn btn-primary w-full"
              disabled={busy}
            >
              <LockKeyhole size={15} />
              {busy ? "Please wait…" : "Create account"}
              <ArrowRight size={14} />
            </button>
            <p className="text-[10px] leading-relaxed text-muted">
              Your account is created as {role.label}. Station-manager and CMO
              roles are provisioned by the platform operator.
            </p>
          </form>
        )}

        {tab === "forgot" && (
          <ForgotPasswordFlow
            busy={busy}
            step={step}
            setStep={setStep}
            setError={setError}
            setInfo={setInfo}
            send={send}
          />
        )}

        {/* Social & mobile triggers */}
        <div className="border-t border-slate-800 pt-4">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Or continue with
          </p>
          <div className="grid grid-cols-3 gap-2">
            <SocialButton
              icon={<Globe2 size={16} />}
              label="Google"
              disabled={busy}
              onClick={() => void send("mock-oauth", { provider: "google" })}
            />
            <SocialButton
              icon={<Apple size={16} />}
              label="Apple"
              disabled={busy}
              onClick={() => void send("mock-oauth", { provider: "apple" })}
            />
            <SocialButton
              icon={<MessageSquare size={16} />}
              label="WhatsApp OTP"
              disabled={busy}
              onClick={() => {
                setTab("forgot");
                setStep("request");
                setInfo(
                  "WhatsApp OTP: enter your phone number to receive a one-time code by WhatsApp.",
                );
              }}
            />
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-500">
            <ShieldCheck size={12} />
            HttpOnly sessions · server-side roles · no passwords or tokens in
            localStorage
          </p>
        </div>

        <div className="flex items-center justify-between border-t border-slate-800 pt-4">
          <Link
            href="/charts"
            onClick={onClose}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 transition-colors hover:text-emerald-300"
          >
            <Eye size={13} />
            Continue as Public Guest
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/60 px-4 text-xs font-semibold text-slate-300 transition-colors hover:border-emerald-400/40"
          >
            <X size={14} />
            Close
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function ForgotPasswordFlow({
  busy,
  step,
  setStep,
  setError,
  setInfo,
  send,
}: {
  busy: boolean;
  step: "request" | "code" | "done";
  setStep: (step: "request" | "code" | "done") => void;
  setError: (message: string) => void;
  setInfo: (message: string) => void;
  send: (path: string, body: Record<string, unknown>) => Promise<void>;
}) {
  if (step === "done") {
    return (
      <div className="space-y-4">
        <p className="rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-4 text-center">
          <Check className="mx-auto h-6 w-6 text-emerald-400" />
          <p className="mt-2 text-sm font-semibold text-emerald-200">
            Your password has been reset
          </p>
          <p className="mt-1 text-xs text-emerald-300/70">
            You can now sign in with your new password.
          </p>
        </p>
        <button
          type="button"
          className="btn btn-primary w-full"
          onClick={() => {
            setStep("request");
            setInfo("");
          }}
        >
          Reset another account
        </button>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        if (step === "request") {
          const email = form.get("email") as string;
          if (!email) {
            setError("Please enter your account email.");
            return;
          }
          void send("forgot-password", { email }).then(() => {
            setStep("code");
            setInfo(
              "A 6-digit code was sent to your email. Enter it below to reset your password.",
            );
          });
        } else {
          const code = form.get("code") as string;
          const password = form.get("password") as string;
          if (!code || code.length < 6) {
            setError("Please enter the 6-digit code from your email.");
            return;
          }
          if (!password || password.length < 12) {
            setError("New password must be at least 12 characters.");
            return;
          }
          void send("reset-password", { code, password }).then(() => {
            setStep("done");
            setInfo("");
          });
        }
      }}
    >
      {step === "request" ? (
        <>
          <label className="block">
            <span className="label">Account email</span>
            <input
              className="field"
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
            />
          </label>
          <button
            className="btn btn-primary w-full"
            disabled={busy}
          >
            <Mail size={15} />
            {busy ? "Sending…" : "Send recovery code"}
          </button>
          <p className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <Clock size={12} />
            Codes expire in 15 minutes
          </p>
        </>
      ) : (
        <>
          <label className="block">
            <span className="label">6-digit code</span>
            <input
              className="field font-mono"
              name="code"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              required
              autoComplete="one-time-code"
            />
          </label>
          <label className="block">
            <span className="label">New password</span>
            <input
              className="field"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
            />
          </label>
          <button
            className="btn btn-primary w-full"
            disabled={busy}
          >
            <LockKeyhole size={15} />
            {busy ? "Resetting…" : "Reset password"}
          </button>
        </>
      )}
    </form>
  );
}

function SocialButton({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-11 flex-col items-center justify-center gap-1 rounded-xl border border-slate-700 bg-slate-900/60 text-slate-200 transition-colors hover:border-emerald-400/40 hover:text-emerald-300 disabled:opacity-50"
    >
      {icon}
      <span className="text-[10px] font-semibold leading-none">{label}</span>
    </button>
  );
}

function Link({
  href,
  onClick,
  children,
  className = "",
}: {
  href: string;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      onClick={(event) => {
        if (onClick) {
          event.preventDefault();
          onClick();
        }
      }}
      className={className}
    >
      {children}
    </a>
  );
}
