"use client";

import { useState } from "react";
import { REGIONS, type Region } from "@/lib/data/public";
import { loadPublicChart } from "@/lib/db/shared";
import { useLoad } from "@/lib/db/core";
import { useI18n } from "@/lib/i18n";
import { cx, fmtInt, safeArray } from "@/lib/safe";
import { EvidencePlayer } from "./EvidencePlayer";

export function AirplayChart() {
  const { t } = useI18n();
  const [region, setRegion] = useState<"All" | Region>("All");
  const state = useLoad(() => loadPublicChart(region), [region]);
  const rows = safeArray(state.data?.rows);
  const live = Boolean(state.data?.live);

  return (
    <section id="charts" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-emerald-400">Music Charts · last 7 days</p>
          <h2 className="mt-2 text-3xl font-bold text-white">{t("chartTitle")}</h2>
        </div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Region">
          {(["All", ...REGIONS] as const).map((r) => (
            <button key={r} role="tab" aria-selected={region === r} type="button" onClick={() => setRegion(r)} className={cx("pill", region === r ? "pill-on" : "pill-off")}>
              {r === "All" ? t("allRegions") : r}
            </button>
          ))}
        </div>
      </div>

      <div className={cx("glass mt-6 divide-y divide-slate-800/80 transition", state.loading && "opacity-60")}>
        {rows.map((row) => (
          <div key={`${region}-${row.rank}-${row.title}`} className="flex items-center gap-3 px-4 py-3 sm:gap-5 sm:px-5">
            <span className={cx("w-6 text-right font-mono text-lg font-bold", row.rank <= 3 ? "text-emerald-400 glow-text" : "text-slate-500")}>{row.rank}</span>
            {!live && (
              <span className={cx("w-8 text-center font-mono text-xs", row.move > 0 ? "text-emerald-400" : row.move < 0 ? "text-rose-400" : "text-slate-600")}>
                {row.move > 0 ? `▲${row.move}` : row.move < 0 ? `▼${Math.abs(row.move)}` : "—"}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-white">{row.title}</p>
              <p className="truncate text-sm text-slate-400">{row.artist}</p>
            </div>
            <span className="text-right font-mono text-sm text-slate-300">
              {fmtInt(row.spins)} <span className="hidden text-slate-600 sm:inline">plays</span>
            </span>
            {!live && <EvidencePlayer seed={row.seed} url={row.snippetUrl} label={row.title} />}
          </div>
        ))}
        {!state.loading && rows.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-slate-500">{state.error ? "The chart is unavailable right now." : "No plays detected in this region yet this week."}</p>
        )}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        {live ? "Verified detections from monitored stations. Evidence clips are available to rights holders in their dashboards." : "Sample chart. ▶ plays a 10-second evidence preview."}
      </p>
    </section>
  );
}
