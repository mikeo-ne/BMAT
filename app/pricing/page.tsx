import type { Metadata } from "next";
import Link from "next/link";

import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { PlanRequest } from "@/components/site/PlanRequest";
import { PLANS, formatUgx } from "@/lib/plans";
import { og } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Pricing — airplay monitoring priced in shillings",
  description:
    "East Sound pricing in Ugandan shillings: artist plans from UGX 35,000 a month, label, broadcaster, venue and CMO licences. Paid by MTN or Airtel mobile money.",
  alternates: { canonical: "/pricing" },
  openGraph: og("/pricing"),
};

/**
 * Pricing, in shillings, with the awkward part said out loud: money moves by
 * mobile money, and a request reaches a human. Competing with a $10 product is
 * not about being cheaper — it is about being payable.
 */
export default function PricingPage() {
  return (
    <>
      <Header />
      <main>
        <section className="mx-auto max-w-7xl px-4 pb-6 pt-14 sm:px-6">
          <p className="font-mono text-xs uppercase tracking-widest text-emerald-400">Pricing</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-bold text-white sm:text-5xl">
            Priced in shillings. Paid by mobile money.
          </h1>
          <p className="mt-4 max-w-2xl text-slate-400">
            Artists pay {formatUgx(35_000)} a month — the price Ugandan artists already pay for airplay
            tracking. Organisations pay for the paperwork they file: statements, cue sheets, distribution packs
            and the data feed.
          </p>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-10 sm:px-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {PLANS.map((plan) => (
              <article key={plan.id} className="glass flex flex-col p-5">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-lg font-semibold text-white">{plan.name}</h2>
                  <span className="text-[11px] uppercase tracking-wider text-slate-500">{plan.audience}</span>
                </div>
                <p className="mt-2 text-2xl font-bold text-emerald-300">
                  {plan.custom ? "Quoted" : formatUgx(plan.monthlyUgx)}
                </p>
                {!plan.custom && <p className="text-xs text-slate-500">per month · two months free on annual</p>}
                <p className="mt-3 text-sm text-slate-400">{plan.summary}</p>
                <ul className="mt-3 space-y-1.5 text-sm text-slate-300">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <span aria-hidden className="text-emerald-400">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-auto">
                  <PlanRequest plan={plan} />
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
          <div className="glass grid gap-6 p-6 md:grid-cols-3">
            <div>
              <h2 className="font-semibold text-white">What every plan includes</h2>
              <p className="mt-2 text-sm text-slate-400">
                The whole radio panel, with a 10-second audible clip behind every play. Charts and alerts work
                the same on a {formatUgx(35_000)} artist plan as on a CMO licence — only the paperwork differs.
              </p>
            </div>
            <div>
              <h2 className="font-semibold text-white">How payment works</h2>
              <p className="mt-2 text-sm text-slate-400">
                Send a request, get a reference, pay by MTN or Airtel mobile money when we call. No card details,
                no automatic renewal, and a receipt you can show an accountant.
              </p>
            </div>
            <div>
              <h2 className="font-semibold text-white">Not sure which?</h2>
              <p className="mt-2 text-sm text-slate-400">
                Start on Artist. Labels, stations and venues can move up at any time — the history and evidence
                come with you.{" "}
                <Link href="/coverage" className="text-emerald-300 underline">
                  See what we monitor
                </Link>
                .
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
