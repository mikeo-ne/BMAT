"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { PLAYOUT_TICKER } from "@/lib/data/public";
import { fmtInt, safeArray } from "@/lib/safe";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { LiveBadge } from "./Header";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type PublicStats = { stations_live: number; stations_total: number; songs: number; plays_7d: number };

/** Live, aggregate-only numbers from the monitoring network. Nothing made up: blank until real numbers load. */
function LiveNow() {
  const [s, setS] = useState<PublicStats | null>(null);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const sb = getSupabaseBrowser();
    if (!sb) return;
    let alive = true;
    const load = () => sb.rpc("public_stats").then(({ data, error }) => { if (alive && !error && data) setS(data as PublicStats); });
    load();
    const id = window.setInterval(load, 60_000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);
  const v = (n: number | undefined) => (s && n != null ? fmtInt(n) : "—");
  const cells = [
    { k: "Stations listening now", v: s ? `${fmtInt(s.stations_live)} / ${fmtInt(s.stations_total)}` : "—" },
    { k: "Songs protected", v: v(s?.songs) },
    { k: "Plays detected · 7 days", v: v(s?.plays_7d) },
  ];
  return (
    <div className="glass relative overflow-hidden border-emerald-400/15 p-5 shadow-2xl shadow-emerald-950/30">
      <div className="mb-4 flex items-center justify-between text-xs">
        <span className="flex items-center gap-2 font-mono uppercase tracking-widest text-emerald-400/80">
          <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:hidden" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" /></span>
          Live across Uganda
        </span>
        <span className="font-mono text-slate-500">{isSupabaseConfigured ? "updates every minute" : "demo"}</span>
      </div>
      <dl className="grid grid-cols-3 gap-3">
        {cells.map((c) => (
          <div key={c.k} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <dt className="text-[11px] leading-tight text-slate-500">{c.k}</dt>
            <dd className="mt-1 font-mono text-xl font-semibold text-white sm:text-2xl">{c.v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-xs leading-relaxed text-slate-400">
        Every station is fingerprinted around the clock. Each play is saved with a 10-second clip as proof.
      </p>
    </div>
  );
}

/** Sample plays for the demo site only — a live site never shows made-up airplay. */
function Ticker() {
  if (isSupabaseConfigured) return null;
  const items = safeArray(PLAYOUT_TICKER);
  const loop = [...items, ...items];
  return (
    <div className="relative mt-8 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/70">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-slate-950" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-slate-950" />
      <div className="flex w-max animate-marquee gap-8 py-2.5 pl-4 hover:[animation-play-state:paused]">
        {loop.map((it, i) => (
          <span key={i} className="flex items-center gap-2 whitespace-nowrap text-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span className="font-semibold text-white">{it.station}</span>
            <span className="font-mono text-slate-500">{it.freq}</span>
            <span className="text-slate-400">{it.track}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function Hero() {
  const { t } = useI18n();
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <section className="relative overflow-hidden">
      {/* Studio backdrop: grid, glow, concentric speaker rings */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_20%,rgba(16,185,129,0.18),transparent_55%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.05)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
        <svg className="absolute -right-40 top-10 h-[640px] w-[640px] opacity-30 motion-safe:animate-rings" viewBox="0 0 400 400">
          {[40, 80, 120, 160, 196].map((r) => (
            <circle key={r} cx="200" cy="200" r={r} fill="none" stroke="#34d399" strokeOpacity={0.5 - r / 500} strokeWidth="1" />
          ))}
        </svg>
      </div>

      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:pb-24 lg:pt-20">
        <div className="min-w-0">
          <div className="xl:hidden">
            <LiveBadge />
          </div>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight text-white [overflow-wrap:anywhere] sm:text-5xl xl:text-6xl">
            {t("heroTitle")}
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-400 sm:text-lg">{t("heroSub")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" className="btn-primary px-6 py-3 text-base" onClick={() => go("charts")}>
              {t("ctaCharts")}
            </button>
            <button type="button" className="btn-ghost px-6 py-3 text-base" onClick={() => go("use-cases")}>
              {t("ctaUseCase")}
            </button>
          </div>
          <Ticker />
        </div>
        <LiveNow />
      </div>
    </section>
  );
}
