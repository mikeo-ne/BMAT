import type { Metadata } from "next";
import Link from "next/link";

import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { CoverageSection } from "@/components/site/Coverage";
import { og } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Coverage — how much of Uganda East Sound monitors",
  description:
    "Explore East Sound’s Ugandan station panel and monitoring status, and understand the limits of detected music-use reports.",
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
  { title: "Reviewable matches", body: "Detected music can include station, time and confidence. Evidence clips may be available to authorised users, depending on capture and permissions.", against: "A match can be missed or wrong; a clip is not a rights determination." },
  { title: "Reporting support", body: "Broadcasters can export detected music as a PDF or Excel cue sheet for review against their own logs.", against: "Reports are not complete programme logs or proof of licence compliance." },
  { title: "Local context", body: "Station and region details help partners understand the scope of the monitored panel.", against: "Panel coverage does not measure national audience reach or every use of music." },
] as const;

const MANUAL_VS_US = [
  ["Record source", "Station or presenter records", "Matches from enrolled recordings on monitored streams"],
  ["Gaps", "Logs can be incomplete or contain errors", "Outages, missing recordings and false or missed matches can create gaps"],
  ["Review", "Consult station records", "Compare detections and available evidence with independent records"],
  ["Reporting", "Compile and check a station report", "Export detected music for review; partner acceptance is not yet confirmed"],
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
            East Sound monitors selected Ugandan station streams and looks for enrolled recordings. Station
            availability changes, and online status does not prove matching accuracy or completeness.
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
            Station logs and automated matches can complement one another. Comparing both helps identify gaps
            before any report is used for a decision.
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
                Upload authorised recordings on a label or artist dashboard. Recognition depends on successful
                enrolment, worker availability and the quality of the broadcast.
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
