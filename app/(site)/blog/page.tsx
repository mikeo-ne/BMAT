import type { Metadata } from "next";
import { ARTICLES } from "@/lib/site-content";
import { BlogBrowser } from "@/components/blog-browser";

export const metadata: Metadata = {
  title: "Insights",
  description:
    "Field notes from the East Sound panel — chart mechanics, UPRS compliance, music tech and ad auditing across East Africa.",
};

export default function BlogPage() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 lg:px-8 lg:py-16">
      <div className="max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">
          Insights
        </p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Airplay intelligence, in long form
        </h1>
        <p className="mt-4 text-base leading-relaxed text-slate-400">
          Field notes from the panel: chart mechanics, UPRS compliance, music
          tech and ad auditing across East Africa.
        </p>
      </div>
      <div className="mt-10">
        <BlogBrowser articles={ARTICLES} />
      </div>
    </section>
  );
}
