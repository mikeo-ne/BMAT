import type { ReactNode } from "react";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";

/** Shared layout for the Terms and Privacy pages. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <p className="font-mono text-xs uppercase tracking-widest text-emerald-400">East Sound Technologies · 7H Music Group Ltd</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-white">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated {updated}</p>
        <div className="legal mt-8 space-y-6 text-[15px] leading-7 text-slate-300 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white [&_li]:ml-5 [&_li]:list-disc [&_a]:text-emerald-400 [&_a]:underline">
          {children}
        </div>
      </main>
      <Footer />
    </>
  );
}
