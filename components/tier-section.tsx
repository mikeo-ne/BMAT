"use client";

import { useState } from "react";
import {
  Check,
  Martini,
  Disc3,
  Mic,
  Radio,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { AuthModal } from "@/components/auth-modal";
import { TIERS, type TierCard } from "@/lib/site-content";
import { useLanguage } from "@/components/language-provider";

const ICONS: Record<string, LucideIcon> = {
  Eye: Sparkles,
  Disc3,
  Mic,
  Radio,
  ShieldCheck,
  Martini,
};

export function TierSection() {
  const { t } = useLanguage();
  const [activeTier, setActiveTier] = useState<TierCard | null>(null);

  return (
    <section id="tiers" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-20 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">
          {t("tiers.eyebrow")}
        </p>
        <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          {t("tiers.title")}
        </h2>
        <p className="mt-4 text-base leading-relaxed text-slate-400">
          {t("tiers.subtitle")}
        </p>
      </div>

      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:mt-14 lg:grid-cols-3">
        {TIERS.map((tier) => {
          const Icon = ICONS[tier.icon] ?? Sparkles;
          return (
            <article
              key={tier.id}
              id={`tier-${tier.id}`}
              className="group relative flex flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/40 p-6 transition-all duration-300 hover:-translate-y-1.5 hover:border-white/20 hover:shadow-2xl hover:shadow-emerald-500/10 scroll-mt-24"
            >
              <div
                className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100 ${tier.accent}`}
              />
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${tier.accent} text-white ring-1 ring-white/10`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="text-base font-bold text-white">{tier.label}</h3>
              </div>
              <p className="mt-4 text-sm font-semibold leading-snug text-emerald-300/90">
                {tier.headline}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                {tier.blurb}
              </p>
              <ul className="mt-4 flex-1 space-y-2">
                {tier.features.slice(0, 3).map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2 text-xs leading-snug text-slate-300"
                  >
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setActiveTier(tier)}
                className="mt-6 flex h-12 w-full items-center justify-center rounded-xl border border-slate-700 bg-slate-900/60 text-sm font-bold text-slate-200 transition-all hover:border-emerald-400/40 hover:bg-emerald-500/10 hover:text-emerald-300"
              >
                {t("tiers.openTier", { tier: tier.label })}
              </button>
            </article>
          );
        })}
      </div>

      {activeTier && (
        <AuthModal
          role={{
            id: activeTier.id,
            label: activeTier.label,
            headline: activeTier.headline,
            blurb: activeTier.blurb,
            features: activeTier.features,
          }}
          onClose={() => setActiveTier(null)}
        />
      )}
    </section>
  );
}

export { Sparkles as TierGuestIcon };
