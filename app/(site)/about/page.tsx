import type { Metadata } from "next";
import { ArrowRight, Layers, ShieldCheck, Scale, Megaphone } from "lucide-react";
import { MissionStatsStrip, CtaBand, VALUES, TEAM } from "@/components/site-sections";
import { ORIGIN_STORY } from "@/lib/site-content";

export const metadata: Metadata = {
  title: "About East Sound",
  description:
    "From a 7H Music Group studio in Kampala to the region's connected FM panel — East Sound's story, mission and the team keeping the panel honest.",
};

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-slate-800/60">
        <div className="pointer-events-none absolute -top-32 right-0 h-64 w-96 rounded-full bg-emerald-500/5 blur-3xl" />
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:px-8 lg:py-20">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">
              About East Sound
            </p>
            <h1 className="mt-3 text-4xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-5xl">
              From a Kampala studio to the region&apos;s airwaves
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-400">
              East Sound began inside 7H Music Group. Today the connected FM
              panel settles royalties, audits ad spots and ranks the national
              Top 100 — one source of truth for every spin.
            </p>
          </div>
          <MissionStatsStrip />
        </div>
      </section>

      {/* Storytelling — 2-column narrative */}
      <section className="mx-auto max-w-7xl px-4 py-16 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-12">
            {ORIGIN_STORY.map((section) => (
              <article key={section.heading}>
                <h2 className="text-2xl font-extrabold tracking-tight text-white">
                  {section.heading}
                </h2>
                <div className="mt-4 space-y-4">
                  {section.paragraphs.map((paragraph) => (
                    <p
                      key={paragraph}
                      className="text-sm leading-relaxed text-slate-300"
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              </article>
            ))}

            <div className="grid gap-4 sm:grid-cols-3">
              {VALUES.map((value) => (
                <div
                  key={value.title}
                  className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5"
                >
                  <h3 className="text-sm font-bold text-emerald-300">
                    {value.title}
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-slate-400">
                    {value.text}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Right rail: sticky suite anchors */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
              The suite
            </p>
            <div className="mt-4 space-y-3">
              <AnchorCard
                id="cmo"
                icon={<ShieldCheck className="h-5 w-5" />}
                title="Settle royalties on evidence"
                text="Unfiltered audit ledgers, daypart weighting and unmatched-audio queues for UPRS, MCSK and COSOTA auditors."
                href="#tiers"
              />
              <AnchorCard
                id="resol"
                icon={<Scale className="h-5 w-5" />}
                title="ReSol — splits before release"
                text="Spectral fingerprints, in-region ISRCs and digital split-sheet agreements attached to every master."
                href="/#tier-artist"
              />
              <AnchorCard
                id="ad-control"
                icon={<Megaphone className="h-5 w-5" />}
                title="AD Control — booked vs actual"
                text="Continuous ad-spot monitoring reconciling booked schedules against what actually aired."
                href="/blog/ad-auditing-in-east-africa"
              />
              <AnchorCard
                id="vericast"
                icon={<Layers className="h-5 w-5" />}
                title="Vericast — the evidence layer"
                text="Every spin carries a timestamp, a station and a 10-second audible snippet."
                href="/charts"
              />
            </div>
          </aside>
        </div>
      </section>

      {/* Team */}
      <section className="mx-auto max-w-7xl px-4 py-16 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">
            The team
          </p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Keeping the panel honest
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-400">
            Producers, engineers, auditors and chart researchers — all within
            the region we measure.
          </p>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {TEAM.map((member) => (
            <article
              key={member.name}
              className="flex flex-col rounded-3xl border border-slate-800 bg-slate-900/40 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/25"
            >
              <div className="flex items-center gap-4">
                <span
                  className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${member.gradient} text-sm font-extrabold text-white ring-1 ring-white/10`}
                >
                  {member.initials}
                </span>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {member.name}
                  </h3>
                  <p className="text-xs font-semibold text-emerald-300/80">
                    {member.role}
                  </p>
                </div>
              </div>
              <p className="mt-4 flex-1 text-sm leading-relaxed text-slate-400">
                {member.bio}
              </p>
            </article>
          ))}
        </div>
      </section>

      <CtaBand />
    </>
  );
}

function AnchorCard({
  id,
  icon,
  title,
  text,
  href,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  text: string;
  href: string;
}) {
  return (
    <div id={id} className="scroll-mt-24">
      <a
        href={href}
        className="group flex items-start gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-4 transition-colors hover:border-emerald-400/25"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-white">{title}</span>
          <span className="mt-1 block text-xs leading-relaxed text-slate-400">
            {text}
          </span>
          <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-emerald-400">
            Explore
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </span>
      </a>
    </div>
  );
}
