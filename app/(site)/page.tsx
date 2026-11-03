import Link from "next/link";
import { ArrowRight, CircleDot } from "lucide-react";
import { StreamMonitorCard } from "@/components/stream-monitor-card";
import { TierSection } from "@/components/tier-section";
import {
  AboutTeaser,
  CtaBand,
  InsightsTeaser,
  SolutionsStrip,
} from "@/components/site-sections";

export default function HomePage() {
  return (
    <>
      {/* Hero + live monitor */}
      <section className="relative overflow-hidden border-b border-slate-800/60">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/30 to-transparent" />
        <div className="pointer-events-none absolute -top-32 left-1/2 h-64 w-[40rem] -translate-x-1/2 rounded-full bg-emerald-500/5 blur-3xl" />
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:px-8 lg:py-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
              <CircleDot className="h-3.5 w-3.5" />
              Music-first airplay intelligence
            </p>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
              Music-First.
              <br />
              Transparency-Driven.
              <br />
              <span className="bg-gradient-to-r from-emerald-300 to-emerald-500 bg-clip-text text-transparent">
                Built for East Africa.
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-400">
              East Sound measures music airplay across Uganda&apos;s FM panel
              and gives artists, labels, stations and collecting societies one
              shared source of truth for every spin.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/charts"
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-6 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/25 transition-all hover:bg-emerald-300 hover:shadow-emerald-500/40"
              >
                Explore Live Airplay Charts
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className="flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-6 text-sm font-bold text-slate-200 transition-colors hover:border-emerald-400/40 hover:text-emerald-300"
              >
                Station Pilot Access
              </Link>
            </div>
            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-slate-800/70 pt-6">
              <Stat value="32" label="Panel stations" />
              <Stat value="4" label="Countries covered" />
              <Stat value="7d" label="Rolling chart window" />
            </dl>
          </div>
          <div className="lg:pl-6">
            <StreamMonitorCard />
          </div>
        </div>
      </section>

      <TierSection />
      <SolutionsStrip />
      <AboutTeaser />
      <InsightsTeaser />
      <CtaBand />
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="text-2xl font-extrabold text-emerald-300">{value}</dt>
      <dd className="mt-1 text-xs text-slate-500">{label}</dd>
    </div>
  );
}
