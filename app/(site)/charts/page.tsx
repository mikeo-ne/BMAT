import { DEMO_CHART_ROWS } from "@/lib/site-content";
import { PublicChartsBrowser } from "@/components/public-charts";
import { weekStartIso } from "@/lib/charts";

export default function PublicChartsPage() {
  const weekStart = weekStartIso();
  const weekLabel = `Week of ${weekStart}`;
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 lg:px-8 lg:py-16">
      <div className="max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">
          National Top 100
        </p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Uganda airplay chart — {weekLabel}
        </h1>
        <p className="mt-4 text-base leading-relaxed text-slate-400">
          Captured spins from the connected FM panel over the last seven
          reporting days. Tap any row to hear its 10-second evidence snippet.
        </p>
      </div>
      <div className="mt-10">
        <PublicChartsBrowser rows={DEMO_CHART_ROWS} />
      </div>
      <p className="mt-8 max-w-2xl text-xs leading-relaxed text-slate-600">
        Rankings reflect captured plays in the connected panel, not all Ugandan
        broadcasts. All-time peak positions are unknown for production
        releases.
      </p>
    </section>
  );
}
