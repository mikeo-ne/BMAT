import Link from "next/link";
import {
  ChartNoAxesCombined,
  Megaphone,
  Radio,
  ScrollText,
  Scale,
  ArrowRight,
} from "lucide-react";
import {
  ARTICLES,
  MISSION_STATS,
  ORIGIN_STORY,
  SOLUTIONS,
  TEAM,
  VALUES,
} from "@/lib/site-content";
import type { LucideIcon } from "lucide-react";

const SOLUTION_ICONS: Record<string, LucideIcon> = {
  Vericast: Radio,
  Reportal: ScrollText,
  ReSol: Scale,
  "National Top 100": ChartNoAxesCombined,
  "AD Control": Megaphone,
};

export function SolutionsStrip() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">
          Solutions
        </p>
        <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          BMAT-style suite, built for the region
        </h2>
        <p className="mt-4 text-base leading-relaxed text-slate-400">
          Vericast, Reportal, ReSol, the national charts and AD Control — the
          modules the region&apos;s music business already runs on.
        </p>
      </div>
      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
        {SOLUTIONS.map((solution) => {
          const Icon = SOLUTION_ICONS[solution.label] ?? Radio;
          return (
            <Link
              key={solution.label}
              href={solution.href}
              className="group flex flex-col rounded-3xl border border-slate-800 bg-slate-900/40 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/25 hover:shadow-xl hover:shadow-emerald-500/10"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20 transition-transform group-hover:scale-110">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-base font-bold text-white">
                {solution.label}
              </h3>
              <p className="mt-2 flex-1 text-xs leading-relaxed text-slate-400">
                {solution.blurb}
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-emerald-400 opacity-0 transition-opacity group-hover:opacity-100">
                Explore
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function MissionStatsStrip({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "grid grid-cols-2 gap-3 sm:grid-cols-4" : "grid grid-cols-2 gap-4 sm:grid-cols-4"}>
      {MISSION_STATS.map((stat) => (
        <div
          key={stat.label}
          className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-center"
        >
          <p className="text-3xl font-extrabold text-emerald-300">{stat.value}</p>
          <p className="mt-1.5 text-xs leading-snug text-slate-400">
            {stat.label}
          </p>
        </div>
      ))}
    </div>
  );
}

export function AboutTeaser() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 lg:px-8">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">
            About East Sound
          </p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            From a Kampala studio to the region&apos;s airwaves
          </h2>
          <div className="mt-5 space-y-4">
            {ORIGIN_STORY[0].paragraphs.map((paragraph) => (
              <p key={paragraph} className="text-sm leading-relaxed text-slate-300">
                {paragraph}
              </p>
            ))}
          </div>
          <Link
            href="/about"
            className="mt-6 inline-flex h-12 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-5 text-sm font-bold text-slate-200 transition-colors hover:border-emerald-400/40 hover:text-emerald-300"
          >
            Read the full story
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="space-y-4">
          <MissionStatsStrip compact />
          <div className="grid gap-3 sm:grid-cols-2">
            {TEAM.slice(0, 4).map((member) => (
              <div
                key={member.name}
                className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-3.5"
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${member.gradient} text-xs font-bold text-white ring-1 ring-white/10`}
                >
                  {member.initials}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">
                    {member.name}
                  </p>
                  <p className="truncate text-xs text-slate-400">{member.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function InsightsTeaser() {
  const latest = ARTICLES.slice(0, 3);
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">
            Insights
          </p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Airplay intelligence, in long form
          </h2>
        </div>
        <Link
          href="/blog"
          className="inline-flex h-12 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-5 text-sm font-bold text-slate-200 transition-colors hover:border-emerald-400/40 hover:text-emerald-300"
        >
          All articles
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {latest.map((article) => (
          <Link
            key={article.slug}
            href={`/blog/${article.slug}`}
            className="group flex flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/40 transition-all duration-300 hover:-translate-y-1 hover:border-white/15"
          >
            <div
              className={`relative h-36 bg-gradient-to-br ${article.cover}`}
            >
              <span className="absolute left-3 top-3 rounded-full border border-slate-700/60 bg-slate-950/40 px-2.5 py-1 text-[10px] font-bold text-slate-200">
                {article.category}
              </span>
            </div>
            <div className="flex flex-1 flex-col p-5">
              <h3 className="text-base font-bold leading-snug text-white">
                {article.title}
              </h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-400">
                {article.excerpt}
              </p>
              <p className="mt-4 text-xs text-slate-500">
                {article.author} · {article.date} · {article.readMinutes} min read
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function CtaBand() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
      <div className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/30 p-8 sm:p-12">
        <div className="pointer-events-none absolute -top-24 right-10 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              Ready to see your spins on the record?
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-400">
              Create your role account in under two minutes — or start as a
              public guest and browse the national Top 100 right now.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
            <Link
              href="/login"
              className="flex h-12 items-center justify-center rounded-xl bg-emerald-400 px-6 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/25 transition-colors hover:bg-emerald-300"
            >
              Access Portal
            </Link>
            <Link
              href="/charts"
              className="flex h-12 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/60 px-6 text-sm font-bold text-slate-200 transition-colors hover:border-emerald-400/40 hover:text-emerald-300"
            >
              Browse charts
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export { VALUES, TEAM };
