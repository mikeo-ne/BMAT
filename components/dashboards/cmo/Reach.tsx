"use client";

import { useMemo, useState } from "react";

import { loadMonthlyPack } from "@/lib/db/cmo";
import { useLoad } from "@/lib/db/core";
import { monthRange, recentMonths, type MonthlyPack as Pack } from "@/lib/cmo-report";
import { fmtReach, reachCaveat, stationImpressions, summariseReach, type ReachRow } from "@/lib/reach";
import { fmtInt } from "@/lib/safe";
import { DataTable, Section, StatGrid } from "@/components/dashboard/ui";

/**
 * Reach & impressions.
 *
 * Advertisers buy "how many people heard it"; the only defensible way to answer
 * for Uganda is a per-station audience figure with its source attached. Where a
 * station has not supplied one, the row says "no audience data" — we do not
 * fill the gap with a guess.
 */
export function Reach() {
  const [month, setMonth] = useState(() => recentMonths(1)[0]);
  const months = useMemo(() => recentMonths(6), []);
  const state = useLoad<Pack | null>(() => loadMonthlyPack(month), [month]);
  const pack = state.data;

  const rows: ReachRow[] = useMemo(
    () =>
      (pack?.stations ?? []).map((s) => ({
        station: s.station,
        region: s.region,
        kind: s.kind,
        spins: s.spins,
        listenSeconds: s.listenSeconds,
        aqh: s.aqh,
        audienceSource: null,
        audienceAsOf: null,
      })),
    [pack],
  );
  const summary = summariseReach(rows);

  return (
    <Section
      id="reach"
      title="Reach & Impressions"
      actions={
        <select className="input !w-40 !py-1.5" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Reach month">
          {months.map((m) => (
            <option key={m} value={m}>
              {monthRange(m).label}
            </option>
          ))}
        </select>
      }
    >
      {!pack ? (
        <p className="py-6 text-center text-sm text-slate-500">Loading audience data…</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">
          No plays in {pack.label}, so there is nothing to estimate yet.
        </p>
      ) : (
        <>
          <StatGrid
            items={[
              { label: "Estimated impressions", value: fmtReach(summary.impressions), hint: "Only stations with a declared audience" },
              { label: "Stations with audience data", value: `${summary.withAudience}/${summary.stations}`, tone: summary.coverage < 100 ? "warn" : "ok" },
              { label: "Plays covered", value: fmtInt(summary.playsCovered), hint: "Plays on those stations" },
              { label: "Panel coverage", value: `${summary.coverage}%`, hint: "Share of the panel we can price" },
            ]}
          />

          <div className="mt-4">
            <DataTable
              rows={rows}
              rowKey={(r) => r.station}
              maxHeight={320}
              empty="No stations reported this month."
              columns={[
                {
                  key: "station",
                  header: "Station",
                  render: (r) => (
                    <span className="flex items-center gap-2 font-medium text-white">
                      {r.station}
                      {r.kind === "tv" && (
                        <span className="rounded bg-sky-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300">TV</span>
                      )}
                    </span>
                  ),
                },
                { key: "region", header: "Region", render: (r) => r.region },
                { key: "spins", header: "Plays", render: (r) => <span className="font-mono text-xs">{fmtInt(r.spins)}</span> },
                {
                  key: "aqh",
                  header: "AQH (declared)",
                  render: (r) =>
                    r.aqh === null ? (
                      <span className="text-xs text-slate-500">no audience data</span>
                    ) : (
                      <span className="font-mono text-xs">{fmtInt(r.aqh)}</span>
                    ),
                },
                {
                  key: "impressions",
                  header: "Est. impressions",
                  render: (r) => {
                    const est = stationImpressions(r.listenSeconds, r.aqh, r.spins);
                    return est === null ? (
                      <span className="text-xs text-slate-500">—</span>
                    ) : (
                      <span className="font-mono text-xs text-emerald-300">{fmtReach(est)}</span>
                    );
                  },
                },
              ]}
            />
          </div>

          <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-200/80">
            {reachCaveat(summary)}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Method: impressions ≈ declared AQH × (music seconds aired ÷ 15 minutes). A station&apos;s AQH is
            supplied by the broadcaster or its agency; see <span className="font-mono">docs/reach-methodology.md</span>.
          </p>
        </>
      )}
    </Section>
  );
}
