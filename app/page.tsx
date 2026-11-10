import type { Metadata } from "next";
import Link from "next/link";
import { og } from "@/lib/seo";
import { Header } from "@/components/site/Header";
import { Hero } from "@/components/site/Hero";
import { AirplayChart } from "@/components/site/AirplayChart";
import { Footer } from "@/components/site/Footer";
import { UseCaseGrid } from "@/components/site/UseCaseGrid";
import { SOLUTIONS } from "@/lib/data/public";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: og("/"),
};

export default function HomePage() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <AirplayChart />

        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <p className="font-mono text-xs uppercase tracking-widest text-emerald-400">Solutions</p>
          <h2 className="mt-2 text-3xl font-bold text-white">One detection pipeline, five products</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {(SOLUTIONS || []).map((s) => (
              <article id={`solution-${s.id}`} key={s.id} className="glass scroll-mt-24 p-5 transition hover:border-emerald-400/40">
                <h3 className="font-semibold text-white">{s.name}</h3>
                <p className="mt-2 text-sm text-slate-400">{s.desc}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <div className="glass flex flex-wrap items-center justify-between gap-4 p-6">
            <div className="max-w-2xl">
              <p className="font-mono text-xs uppercase tracking-widest text-emerald-400">Coverage</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Four regions, not two studios in Kampala</h2>
              <p className="mt-2 text-sm text-slate-400">
                Stations in Central, Western, Eastern and Northern Uganda, monitored around the clock, each play
                backed by a 10-second clip and UPRS-ready paperwork. Most airplay here is still written on a log
                sheet — that is the standard we are replacing.
              </p>
            </div>
            <Link href="/coverage" className="btn-ghost">
              See the coverage map →
            </Link>
          </div>
        </section>

        <UseCaseGrid />
      </main>
      <Footer />
    </>
  );
}
