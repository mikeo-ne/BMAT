"use client";

import { useMemo, useState } from "react";
import { AudioLines, Disc3, Globe2, Radio, ScanLine } from "lucide-react";
import { PageIntro } from "@/components/page-intro";
import { UgandaAirplayMap } from "@/components/uganda-airplay-map";
import { AirplayTrend } from "@/components/airplay-trend";
import { formatDate, formatEatClock, formatNumber } from "@/lib/format";
import {
  filterPublicCaptures,
  summarisePublicCaptures,
  type PublicCaptureRecord,
} from "@/lib/public-statistics";
import { eatDate } from "@/lib/playout";
import { REGIONS, type Region } from "@/lib/regions";

/** Read-only aggregates, with no notification preferences, master actions, evidence or private forms. */
export function PublicStatistics({
  records,
  now,
}: {
  records: PublicCaptureRecord[];
  now: string;
}) {
  const [days, setDays] = useState<7 | 14>(14);
  const [region, setRegion] = useState<Region | "All">("All");
  const window = useMemo(
    () => filterPublicCaptures(records, now, days),
    [records, now, days],
  );
  const selected = useMemo(
    () => window.filter((row) => region === "All" || row.region === region),
    [window, region],
  );
  const summary = summarisePublicCaptures(selected);
  const cards = [
    {
      label: "Captured plays",
      value: formatNumber(summary.total),
      hint: "Admitted panel events in this view",
      icon: AudioLines,
    },
    {
      label: "Reporting stations",
      value: formatNumber(summary.stations),
      hint: "Stations with a captured event",
      icon: Radio,
    },
    {
      label: "Matched recordings",
      value: formatNumber(summary.recordings),
      hint: "Distinct matched recording references",
      icon: Disc3,
    },
    {
      label: "Match rate",
      value:
        summary.matchRate === null
          ? "—"
          : `${(summary.matchRate * 100).toFixed(1)}%`,
      hint: "Unknown without capture records",
      icon: ScanLine,
    },
  ];
  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6">
      <PageIntro
        eyebrow="PUBLIC AIRPLAY INTELLIGENCE"
        title="The signal, in perspective."
        description="Explore the captured Uganda panel, without the guesswork. Public statistics are read-only; missing capture data is never filled with estimated spins or audience reach."
      />
      <section
        className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-4 sm:p-5"
        aria-label="Public view information"
      >
        <div className="flex items-start gap-3">
          <Globe2 size={19} className="mt-0.5 shrink-0 text-brand" />
          <div>
            <p className="text-xs font-semibold">
              Public reporting view · no sign-in represented
            </p>
            <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-muted">
              Connected-panel records only, not all Ugandan broadcasts. This
              page does not expose masters, evidence clips, rights declarations
              or recipient settings.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="min-w-32">
            <span className="label">Reporting window</span>
            <select
              className="field !py-2 !text-xs"
              value={days}
              onChange={(event) =>
                setDays(Number(event.target.value) as 7 | 14)
              }
            >
              <option value={14}>Last 14 days</option>
              <option value={7}>Last 7 days</option>
            </select>
          </label>
          <label className="min-w-32">
            <span className="label">Region</span>
            <select
              className="field !py-2 !text-xs"
              value={region}
              onChange={(event) =>
                setRegion(event.target.value as Region | "All")
              }
            >
              <option value="All">All Uganda</option>
              {REGIONS.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>
      </section>
      <dl
        className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 xl:grid-cols-4"
        aria-label="Public capture summary"
      >
        {cards.map((card) => (
          <div className="panel p-5" key={card.label}>
            <dt className="flex items-center justify-between gap-3 text-xs text-muted">
              {card.label}
              <card.icon size={16} className="text-brand" />
            </dt>
            <dd className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">
              {card.value}
            </dd>
            <p className="mt-2 text-[10px] text-muted">{card.hint}</p>
          </div>
        ))}
      </dl>
      {records.length === 0 && (
        <p
          role="status"
          className="panel border-dashed p-5 text-xs leading-relaxed text-muted"
        >
          No capture records are connected to this snapshot. Zero captured
          records is not a claim of zero radio activity in Uganda.
        </p>
      )}
      <div className="grid gap-5 xl:grid-cols-2">
        <UgandaAirplayMap
          events={window}
          focusRegion={region}
          onFocusRegion={setRegion}
        />
        <AirplayTrend events={selected} title="Panel airplay, over time" />
      </div>
      <p className="text-[11px] leading-relaxed text-muted">
        Snapshot: {formatDate(eatDate(now))} · {formatEatClock(now)}. Reporting
        windows follow East Africa Time. Server views refresh on reload; static
        exports retain their build-time snapshot. Directory size does not
        establish live monitoring coverage.
      </p>
    </div>
  );
}
