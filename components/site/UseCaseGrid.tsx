"use client";

import { useAuth } from "@/lib/auth-context";
import { ROLE_META, ROLES } from "@/lib/roles";

export function UseCaseGrid() {
  const { openAuth } = useAuth();
  return (
    <section id="use-cases" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6">
      <p className="font-mono text-xs uppercase tracking-widest text-emerald-400">Use cases</p>
      <h2 className="mt-2 text-3xl font-bold text-white">A dashboard built for your side of the deal</h2>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {ROLES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => openAuth("signup")}
            className="glass group p-5 text-left transition hover:border-emerald-400/50 hover:shadow-glow-sm"
          >
            <h3 className="font-semibold text-white">{ROLE_META[r].useCase}</h3>
            <p className="mt-2 text-sm text-slate-400">{ROLE_META[r].blurb}</p>
            <span className="mt-4 inline-block text-sm font-medium text-emerald-400 transition group-hover:translate-x-1">Get started →</span>
          </button>
        ))}
      </div>
    </section>
  );
}
