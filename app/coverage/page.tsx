import type { Metadata } from "next";
import Link from "next/link";

import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { CoverageSection } from "@/components/site/Coverage";
import { og } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Coverage — how much of Uganda East Sound monitors",
  description:
    "East Sound monitors Ugandan radio across all four regions, region by region, with a 10-second audible clip for every detection and UPRS-ready cue sheets for broadcasters.",
  alternates: { canonical: "/coverage" },
  openGraph: og("/coverage"),
};

/**
 * The coverage page exists because of one sentence we kept hearing: "the big
 * platforms give me a number for Africa". This page answers with the only
 * thing that matters to a Ugandan rights holder — which stations, in which
 * region, reporting as of when — and explains what a detection comes with.
 */
const EDGES = [
  {
    title: "Audible proof, not a number",
    body: "Every match is stored with a 10-second audio clip, the station, the time and the confidence. When a payment is questioned, you play the evidence instead of arguing about a spreadsheet.",
    against: "Global services and raw recognition engines return rows.",
  },
  {
    title: "Compliance work, not just charts",
    body: "Broadcasters get UPRS cue sheets as PDF and Excel. Venues get licence and listener-node compliance. Labels and artists get statements built from the same detections.",
    against: "Charts alone don't move a shilling.",
  },
  {
    title: "Local by design",
    body: "Prices in shillings, alerts on WhatsApp and email, English · Luganda · Kiswahili, and the data stays in the country — which matters while the state builds its own monitoring system.",
    against: "A global feed is priced in dollars and hosted abroad.",
  },
] as const;

const MANUAL_VS_US = [
  ["Who writes the record", "A presenter's log sheet or a UPRS field visit", "The matcher, 24/7, per station"],
  ["When it exists", "Days or weeks later, if at all", "Seconds after the play"],
  ["What backs it up", "Handwriting, memory, trust", "A 10-second clip you can play"],
  ["Upcountry stations", "Visited rarely", "Monitored like Kampala"],
  ["Disputed plays", "Nobody can prove anything", "Clip, timestamp, confidence on record"],
  ["Cost of an audit", "Field visits and paperwork", "Export the file and send it"],
] as const;

export default function CoveragePage() {
  return (
    <>
      <Header />
      <main>
        <section className="mx-auto max-w-7xl px-4 pb-4 pt-14 sm:px-6">
          <p className="font-mono text-xs uppercase tracking-widest text-emerald-400">Coverage</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-bold text-white sm:text-5xl">
            Built for Uganda, region by region — not for an African average.
          </h1>
          <p className="mt-4 max-w-2xl text-slate-400">
            East Sound is not a global catalogue with a Ugandan office. It is a monitoring panel of Ugandan
            stations, fingerprinted around the clock, with the paperwork Ugandan rights holders and
            broadcasters actually have to file.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/#charts" className="btn-primary">
              Explore live charts
            </Link>
            <Link href="/#use-cases" className="btn-ghost">
              Pick your side of the deal
            </Link>
          </div>
        </section>

        <CoverageSection />

        <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <div className="grid gap-4 md:grid-cols-3">
            {EDGES.map((e) => (
              <article key={e.title} className="glass p-5">
                <h2 className="font-semibold text-white">{e.title}</h2>
                <p className="mt-2 text-sm text-slate-400">{e.body}</p>
                <p className="mt-3 border-t border-slate-800 pt-3 text-xs text-slate-500">{e.against}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <p className="font-mono text-xs uppercase tracking-widest text-emerald-400">The real competitor</p>
          <h2 className="mt-2 text-3xl font-bold text-white">Log sheets and paper cue sheets</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Most airplay in Uganda is still recorded by hand — a presenter&apos;s note, a field visit, a
            spreadsheet rebuilt at the end of the month. That is the standard we are replacing.
          </p>
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className="th text-left"> </th>
                  <th className="th text-left">Manual logs</th>
                  <th className="th text-left">East Sound</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {MANUAL_VS_US.map(([what, manual, ours]) => (
                  <tr key={what}>
                    <td className="td font-medium text-slate-300">{what}</td>
                    <td className="td text-slate-500">{manual}</td>
                    <td className="td text-white">{ours}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
          <div className="glass flex flex-wrap items-center justify-between gap-4 p-6">
            <div>
              <h2 className="text-xl font-semibold text-white">Want your catalogue in the panel?</h2>
              <p className="mt-1 text-sm text-slate-400">
                Upload masters on a label or artist dashboard — they are fingerprinted and monitored from the
                next play.
              </p>
            </div>
            <Link href="/#use-cases" className="btn-primary">
              Get started
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
