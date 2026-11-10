"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "@/components/site/Logo";
import { DEMO_MODE, useAuth } from "@/lib/auth-context";
import { ROLE_META, ROLE_NAV, type Role } from "@/lib/roles";
import { cx } from "@/lib/safe";
import { PushToggle } from "./PushToggle";
import { RoleGuard } from "./RoleGuard";

function Shell({ role, children }: { role: Role; children: ReactNode }) {
  const { session, signOut } = useAuth();
  const router = useRouter();
  const nav = ROLE_NAV[role] || []; // this role's menu only
  const [active, setActive] = useState(nav[0]?.id ?? "");
  const [open, setOpen] = useState(false);

  // Highlight the section in view.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        const v = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (v) setActive(v.target.id);
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );
    nav.forEach((n) => {
      const el = document.getElementById(n.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [nav]);

  const go = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setOpen(false);
  };

  const logout = async () => {
    await signOut();
    router.replace("/");
  };

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 p-4" aria-label={`${ROLE_META[role].label} navigation`}>
      <div className="mb-6 px-2">
        <Logo />
      </div>
      <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{ROLE_META[role].label}</p>
      {nav.map((n) => (
        <button
          key={n.id}
          type="button"
          onClick={() => go(n.id)}
          className={cx(
            "rounded-lg px-3 py-2 text-left text-sm transition",
            active === n.id ? "bg-emerald-400/10 font-semibold text-emerald-300" : "text-slate-400 hover:bg-slate-900 hover:text-white",
          )}
        >
          {n.label}
        </button>
      ))}
      <div className="mt-auto space-y-3 border-t border-slate-800 pt-4">
        <div className="px-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Alerts on this phone</p>
          <PushToggle />
        </div>
        <div className="px-3">
          <p className="truncate text-sm font-medium text-white">{session?.displayName}</p>
          <p className="truncate text-xs text-slate-500">{session?.email}</p>
        </div>
        <button type="button" onClick={logout} className="btn-ghost w-full !py-2">
          Sign out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-800 bg-slate-950 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-slate-800 bg-slate-950">{sidebar}</aside>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-800 bg-slate-950/85 px-4 backdrop-blur sm:px-6">
          <button type="button" className="rounded-lg p-1.5 text-slate-300 lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}>
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" fill="none" />
            </svg>
          </button>
          <span className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-xs font-semibold text-emerald-300">
            {ROLE_META[role].label}
          </span>
          <span className="truncate text-sm text-slate-400">{session?.displayName}</span>
          {DEMO_MODE && <span className="ml-auto rounded-md bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">Demo data</span>}
        </header>
        <main className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}

export function DashboardShell({ role, children }: { role: Role; children: ReactNode }) {
  return (
    <RoleGuard role={role}>
      <Shell role={role}>{children}</Shell>
    </RoleGuard>
  );
}
