import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { PARTNERS } from "@/lib/partner-proposals";
import { og } from "@/lib/seo";

const title = "Partner with East Sound | Music use, made more visible";
const description = "How proposed partnerships with URSB, UPRS, UCC, broadcasters and creators could support more transparent music-use reporting in Uganda.";
export const metadata: Metadata = { title, description, alternates: { canonical: "/partners" }, openGraph: og("/partners", title, description) };

export default function PartnersPage() {
  return <><Header /><main>
    <section className="mx-auto max-w-7xl px-4 pb-12 pt-16 sm:px-6">
      <p className="font-mono text-xs uppercase tracking-widest text-emerald-400">Partnerships · Uganda</p>
      <h1 className="mt-4 max-w-4xl text-4xl font-bold leading-tight text-white sm:text-5xl">Better music-use evidence, built around the work you already do.</h1>
      <p className="mt-5 max-w-3xl text-lg leading-relaxed text-slate-300">East Sound is building a radio airplay evidence layer for creators, broadcasters and institutions. We want to complement existing registration, licensing and royalty systems—not replace them.</p>
      <div className="mt-7 flex flex-wrap gap-3"><a href="mailto:7hmusicgroupug@gmail.com?subject=East%20Sound%20partnership%20pilot" className="btn-primary">Discuss a pilot →</a><a href="#proposals" className="btn-ghost">Explore partner proposals</a></div>
      <p className="mt-6 max-w-3xl text-sm text-slate-400">These are proposals, not agreed partnerships or endorsements. Alignment with an organisation’s goals is not a certification of legal or regulatory compliance.</p>
    </section>
    <section className="border-y border-slate-800 bg-slate-900/40"><div className="mx-auto grid max-w-7xl gap-6 px-4 py-9 sm:px-6 md:grid-cols-3">
      <div><p className="font-mono text-xs text-emerald-400">01 / REGISTER</p><p className="mt-2 text-sm text-slate-300">Creators and official institutions manage registration and rights.</p></div>
      <div><p className="font-mono text-xs text-emerald-400">02 / OBSERVE</p><p className="mt-2 text-sm text-slate-300">East Sound can report matches from enrolled recordings on an agreed, monitored panel.</p></div>
      <div><p className="font-mono text-xs text-emerald-400">03 / REVIEW &amp; DECIDE</p><p className="mt-2 text-sm text-slate-300">Partners validate records and make their own licensing or distribution decisions.</p></div>
    </div></section>
    <section id="proposals" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6">
      <p className="font-mono text-xs uppercase tracking-widest text-emerald-400">A proposal for each partner</p>
      <h2 className="mt-3 text-3xl font-bold text-white">Your priorities, our possible contribution</h2>
      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        {PARTNERS.map((p) => <article key={p.id} id={p.id} className="glass scroll-mt-20 p-6">
          <h3 className="text-xl font-semibold text-white">{p.name}</h3><p className="mt-1 text-xs text-emerald-300">{p.role}</p>
          <dl className="mt-5 space-y-4 text-sm leading-relaxed"><div><dt className="font-semibold text-slate-200">Your published priorities</dt><dd className="mt-1 text-slate-400">{p.priority}</dd></div><div><dt className="font-semibold text-slate-200">What East Sound can offer</dt><dd className="mt-1 text-slate-400">{p.offer}</dd></div><div><dt className="font-semibold text-slate-200">A practical first step</dt><dd className="mt-1 text-slate-400">{p.ask}</dd></div><div><dt className="font-semibold text-amber-200">Important boundary</dt><dd className="mt-1 text-slate-400">{p.boundary}</dd></div></dl>
          <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-800 pt-4">{p.sources.map((s) => <a key={s.url} href={s.url} className="text-xs text-emerald-300 underline underline-offset-4">{s.label} ↗</a>)}</div>
        </article>)}
      </div>
    </section>
    <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6"><div className="glass p-6 sm:p-8">
      <p className="font-mono text-xs uppercase tracking-widest text-emerald-400">A proposed pilot</p><h2 className="mt-3 text-2xl font-bold text-white">Start small. Compare against independent records.</h2>
      <div className="mt-6 grid gap-5 text-sm text-slate-400 md:grid-cols-4"><p><strong className="block text-white">1. Agree scope</strong>Choose consenting stations and authorised recordings; agree rights, access and evaluation.</p><p><strong className="block text-white">2. Collect</strong>Monitor the agreed panel and record outages, unmatched material and data gaps.</p><p><strong className="block text-white">3. Reconcile</strong>Compare detections with independent station logs; review missed and incorrect matches.</p><p><strong className="block text-white">4. Decide together</strong>Report results and limitations before deciding whether or how to scale.</p></div>
      <p className="mt-6 text-sm text-slate-300">A 90-day schedule is a proposal, not a guarantee. Timing and success thresholds should be agreed with each partner.</p>
    </div></section>
    <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6"><h2 className="text-2xl font-bold text-white">What the evidence can—and cannot—say</h2><p className="mt-4 max-w-4xl text-sm leading-relaxed text-slate-400">Monitoring can miss plays during outages or when recordings are unavailable or do not match; false matches are possible. Evidence clips may be unavailable and access depends on permissions. Radio matches are not proof of ownership, licence compliance, total airplay, audience size or money owed. TV, venue devices and live end-to-end accuracy require further validation. Legal, data-protection and audio rights review is needed before sharing data.</p><p className="mt-5 text-sm text-slate-400">Questions? <a className="text-emerald-300 underline" href="mailto:7hmusicgroupug@gmail.com">Contact the East Sound team</a> or <Link className="text-emerald-300 underline" href="/coverage">explore coverage</Link>.</p></section>
  </main><Footer /></>;
}
