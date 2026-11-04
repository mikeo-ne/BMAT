"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEMO_ROLE_COOKIE, isRole, ROLE_META, type Role } from "./roles";
import { getSupabaseBrowser } from "./supabase/client";
import { isSupabaseConfigured } from "./supabase/config";
import { safeStorage } from "./safe";

export type Session = {
  userId: string;
  email: string;
  role: Role;
  displayName: string;
  mode: "supabase" | "demo";
};

export type AuthMode = "signin" | "signup" | "forgot";

type Result = { ok: true; message?: string } | { ok: false; error: string };

type AuthCtx = {
  session: Session | null;
  loading: boolean;
  modal: AuthMode | null;
  openAuth: (mode?: AuthMode) => void;
  closeAuth: () => void;
  signIn: (email: string, password: string, role: Role) => Promise<Result>;
  signUp: (email: string, password: string, role: Role, displayName: string) => Promise<Result>;
  requestPasswordReset: (email: string) => Promise<Result>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);
const DEMO_KEY = "est_demo_session";

function writeDemoCookie(role: Role | null) {
  if (typeof document === "undefined") return;
  document.cookie = role
    ? `${DEMO_ROLE_COOKIE}=${role}; Path=/; Max-Age=${60 * 60 * 12}; SameSite=Lax`
    : `${DEMO_ROLE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/** Reads the role from the server-side `profiles` row (RLS: own row only). */
async function loadProfileRole(userId: string): Promise<{ role: Role | null; name: string | null }> {
  const sb = getSupabaseBrowser();
  if (!sb) return { role: null, name: null };
  const { data, error } = await sb.from("profiles").select("role, display_name").eq("id", userId).maybeSingle();
  if (error || !data) return { role: null, name: null };
  return { role: isRole(data.role) ? data.role : null, name: data.display_name ?? null };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<AuthMode | null>(null);

  // Hydrate session on the client only (no window access during render).
  useEffect(() => {
    let cancelled = false;
    const sb = getSupabaseBrowser();

    if (!sb) {
      const stored = safeStorage.get<Session | null>(DEMO_KEY, null);
      if (stored && isRole(stored.role)) {
        setSession(stored);
        writeDemoCookie(stored.role);
      }
      setLoading(false);
      return;
    }

    const apply = async (user: { id: string; email?: string | null } | null) => {
      if (!user) {
        if (!cancelled) setSession(null);
        return;
      }
      const { role, name } = await loadProfileRole(user.id);
      if (cancelled) return;
      setSession(
        role
          ? { userId: user.id, email: user.email ?? "", role, displayName: name ?? user.email ?? "", mode: "supabase" }
          : null,
      );
    };

    sb.auth
      .getUser()
      .then(({ data }) => apply(data.user ?? null))
      .finally(() => !cancelled && setLoading(false));

    const { data: sub } = sb.auth.onAuthStateChange((_event, s) => {
      void apply(s?.user ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Deep link: /?auth=signin opens the modal (read in effect, not during render).
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search).get("auth");
      if (p === "signin" || p === "signup" || p === "forgot") setModal(p);
    } catch {
      /* ignore */
    }
  }, []);

  const signIn = useCallback<AuthCtx["signIn"]>(async (email, password, role) => {
    const sb = getSupabaseBrowser();
    if (!sb) {
      if (!email.includes("@") || password.length < 6) return { ok: false, error: "Enter a valid email and a 6+ character password." };
      const s: Session = {
        userId: `demo-${role}`,
        email,
        role,
        displayName: email.split("@")[0] ?? "Demo user",
        mode: "demo",
      };
      safeStorage.set(DEMO_KEY, s);
      writeDemoCookie(role);
      setSession(s);
      return { ok: true };
    }
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error || !data.user) return { ok: false, error: error?.message ?? "Sign-in failed." };
    const { role: registered, name } = await loadProfileRole(data.user.id);
    if (!registered) {
      await sb.auth.signOut();
      return { ok: false, error: "No workspace profile found for this account. Contact support." };
    }
    // The registered role is authoritative. A mismatched selection is refused, not switched.
    if (registered !== role) {
      await sb.auth.signOut();
      return {
        ok: false,
        error: `This account is registered as "${ROLE_META[registered].label}". Select that use case to continue.`,
      };
    }
    setSession({ userId: data.user.id, email, role: registered, displayName: name ?? email, mode: "supabase" });
    return { ok: true };
  }, []);

  const signUp = useCallback<AuthCtx["signUp"]>(async (email, password, role, displayName) => {
    if (password.length < 8) return { ok: false, error: "Use at least 8 characters for your password." };
    const sb = getSupabaseBrowser();
    if (!sb) return signIn(email, password, role).then((r) => (r.ok ? { ok: true, message: "Demo workspace created." } : r));
    const redirect = `${window.location.origin}/auth/callback`;
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirect, data: { requested_role: role, display_name: displayName } },
    });
    if (error) return { ok: false, error: error.message };
    if (!data.session) return { ok: true, message: "Check your inbox to confirm your email, then sign in." };
    return { ok: true, message: role === "cmo" ? "CMO accounts are activated after verification by East Sound." : undefined };
  }, [signIn]);

  const requestPasswordReset = useCallback<AuthCtx["requestPasswordReset"]>(async (email) => {
    if (!email.includes("@")) return { ok: false, error: "Enter the email you registered with." };
    const sb = getSupabaseBrowser();
    if (!sb) return { ok: true, message: "Demo mode: no email is sent. Connect Supabase to enable recovery emails." };
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset`,
    });
    // Same message whether or not the account exists (prevents account enumeration).
    if (error && !/rate/i.test(error.message)) return { ok: true, message: "If that email is registered, a recovery link is on its way." };
    if (error) return { ok: false, error: error.message };
    return { ok: true, message: "If that email is registered, a recovery link is on its way." };
  }, []);

  const signOut = useCallback(async () => {
    const sb = getSupabaseBrowser();
    if (sb) await sb.auth.signOut().catch(() => undefined);
    safeStorage.remove(DEMO_KEY);
    writeDemoCookie(null);
    setSession(null);
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      session,
      loading,
      modal,
      openAuth: (m = "signin") => setModal(m),
      closeAuth: () => setModal(null),
      signIn,
      signUp,
      requestPasswordReset,
      signOut,
    }),
    [session, loading, modal, signIn, signUp, requestPasswordReset, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}

export const DEMO_MODE = !isSupabaseConfigured;
