"use client";

import { DEMO_COVERAGE, orderRegions, shareMonitored, type Coverage } from "@/lib/coverage";
import { useLiveLoad } from "@/lib/db/live";
import { loadPublicCoverage } from "@/lib/db/shared";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { cx, fmtInt } from "@/lib/safe";

/**
 * "How much of Uganda do you actually monitor?"
 *
 * Every figure here comes from the stations table, region by region, so the
 * claim cannot drift from reality: if a station stops reporting, the number
 * moves. Demo mode shows the same shape with a visible "sample" label.
 */
export function CoverageSection() {
  const state = useLiveLoad(() => loadPublicCoverage(), [], { intervalMs: 60_000 });
  const live = state.data ?? null;
  const coverage: Coverage = live ?? DEMO_COVERAGE;
  const regions = orderRegions(coverage.regions);
  const widest = Math.max(1, ...regions.map((r) => r.stations));
  const sample = !live;

  return (
    <section id="coverage" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-emerald-400">Coverage · Uganda</p>
          <h2 className="mt-2 text-3xl font-bold text-white">Four regions, not two studios in Kampala</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Global services sell a country average. We listen to the stations that actually break Ugandan
            records — including the upcountry ones — and we count only what is reporting right now.
          </p>
        </div>
        <span className={cx("pill", sample ? "pill-off" : "pill-on")} title={sample ? "Sample figures — no live project attached" : "Live counts from the monitoring panel"}>
          {sample ? "Sample coverage" : "Live coverage"}
        </span>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          {
            label: "Stations in the panel",
            value: fmtInt(coverage.stations),
            hint: `${fmtInt(coverage.radio)} radio${coverage.tv ? ` · ${fmtInt(coverage.tv)} TV` : ""} — catalogue and fingerprint`,
          },
          { label: "Monitored right now", value: `${fmtInt(coverage.monitored)} · ${shareMonitored(coverage)}%`, hint: "Enabled and reporting to the matcher" },
          { label: "Regions covered", value: fmtInt(regions.length), hint: "Central · Western · Eastern · Northern" },
        ].map((s) => (
          <div key={s.label} className="glass p-5">
            <p className="font-mono text-xs uppercase tracking-widest text-slate-500">{s.label}</p>
            <p className="mt-2 text-3xl font-bold text-white">{s.value}</p>
            <p className="mt-1 text-xs text-slate-500">{s.hint}</p>
          </div>
        ))}
      </div>

      <div className="glass mt-4 divide-y divide-slate-800/80">
        {regions.map((r) => (
          <div key={r.region} className="flex items-center gap-4 px-5 py-4">
            <span className="w-24 shrink-0 font-semibold text-white">{r.region}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-emerald-400/80"
                style={{ width: `${Math.round((r.monitored / widest) * 100)}%` }}
                aria-hidden
              />
            </div>
            <span className="w-44 shrink-0 text-right font-mono text-xs text-slate-400">
              {fmtInt(r.monitored)} of {fmtInt(r.stations)} monitored
              {r.tv > 0 && <span className="ml-1 text-sky-300">· {fmtInt(r.tv)} TV</span>}
            </span>
          </div>
        ))}
        {regions.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-slate-500">
            The station panel is loading. Coverage appears here as soon as the worker reports.
          </p>
        )}
      </div>

      <p className="mt-3 text-xs text-slate-500">
        {sample ? (
          isSupabaseConfigured ? (
            "Live project attached — coverage numbers appear as soon as the worker sends its first heartbeat."
          ) : (
            "Sample figures. In live mode these numbers come from the monitoring panel and refresh every minute."
          )
        ) : (
          <>
            Counts are live and refresh every minute · last station check-in{" "}
            {coverage.lastHeartbeat ? new Date(coverage.lastHeartbeat).toLocaleString() : "pending"}
          </>
        )}
      </p>
    </section>
  );
}
