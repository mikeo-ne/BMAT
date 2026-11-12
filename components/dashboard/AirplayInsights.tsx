"use client";

import { useState } from "react";
import { cx, fmtInt } from "@/lib/safe";
import { evidenceUrl, fmtTime, useLoad } from "@/lib/db/core";
import {
  byRegion, hourLabel, loadInsights, peakHours, proofLink, shareDetection, unshareDetection,
  type Insights, type RecentPlay,
} from "@/lib/db/insights";
import { EvidencePlayer } from "@/components/site/EvidencePlayer";
import { Badge, DataTable, LoadGate, Section, StatGrid } from "./ui";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const RANGES = [7, 30, 90] as const;

/** Where, when and by whom an artist's songs are played — and who isn't playing them yet. */
export function AirplayInsights({ audience = "artist" }: { audience?: "artist" | "label" }) {
  const label = audience === "label";
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const state = useLoad(() => loadInsights(days), [days]);
  const picker = (
    <div className="flex gap-1 rounded-lg border border-slate-800 p-1" role="group" aria-label="Period">
      {RANGES.map((d) => (
        <button key={d} type="button" onClick={() => setDays(d)}
          className={cx("rounded-md px-2.5 py-1 text-xs font-semibold", d === days ? "bg-emerald-500/20 text-emerald-300" : "text-slate-400 hover:text-white")}>
          {d} days
        </button>
      ))}
    </div>
  );
  return (
    <>
      <Section id="insights" kicker="Airplay insights" title={label ? "Where and when your roster is played" : "Where and when you're played"} actions={picker}>
        <LoadGate state={state}>{(d) => <Overview d={d} label={label} />}</LoadGate>
      </Section>
      <Section id="gaps" kicker="Promotion targets" title={label ? "Stations not playing your roster yet" : "Stations not playing you yet"}>
        <LoadGate state={state}>{(d) => <Gaps d={d} label={label} />}</LoadGate>
      </Section>
      <Section id="proof" kicker="Shareable evidence" title="Recent plays · share the proof">
        <LoadGate state={state}>{(d) => <Recent d={d} onChange={state.reload} />}</LoadGate>
      </Section>
    </>
  );
}

function Overview({ d, label }: { d: Insights; label: boolean }) {
  const peaks = peakHours(d.byHour);
  const max = Math.max(1, ...d.byHour);
  const bestDay = d.byWeekday.some((v) => v > 0) ? WEEKDAYS[d.byWeekday.indexOf(Math.max(...d.byWeekday))] : "—";
  return (
    <div className="space-y-6">
      {d.demo && <p className="text-xs text-amber-200/80">Sample data — sign in to see your own plays.</p>}
      <StatGrid items={[
        { label: `Plays (${d.days} days)`, value: fmtInt(d.plays) },
        { label: label ? "Stations playing your roster" : "Stations playing you", value: `${fmtInt(d.stationsPlaying)} / ${fmtInt(d.stationsMonitored)}`, hint: "of the stations we monitor" },
        { label: "Peak hour", value: peaks.length ? hourLabel(peaks[0]) : "—", hint: "Kampala time" },
        { label: "Best day", value: bestDay },
      ]} />

      <div>
        <p className="mb-2 text-sm font-semibold text-white">Plays by hour of day</p>
        <div className="flex h-36 items-end gap-[3px]" role="img" aria-label={`Plays by hour. Peak hours: ${peaks.map(hourLabel).join(", ") || "none yet"}`}>
          {d.byHour.map((v, h) => (
            <div key={h} className="group relative flex h-full flex-1 flex-col justify-end" title={`${hourLabel(h)} · ${v} plays`}>
              <div className={cx("w-full rounded-t-sm", peaks.includes(h) ? "bg-emerald-400" : "bg-emerald-700/60")} style={{ height: `${Math.max(v ? 6 : 1, (v / max) * 100)}%` }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-500">
          <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          {peaks.length
            ? <>You get the most spins around <b className="text-slate-200">{peaks.map(hourLabel).join(", ")}</b>. Push your song to presenters on those shows.</>
            : "No plays in this period yet."}
        </p>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-white">Top stations</p>
        <DataTable rows={d.byStation} rowKey={(r) => r.name} empty="No station has played your songs in this period yet."
          columns={[
            { key: "s", header: "Station", render: (r) => <span className="font-medium text-white">{r.name}</span> },
            { key: "r", header: "Region", render: (r) => r.region ?? "—" },
            { key: "p", header: "Plays", className: "text-right font-mono", render: (r) => fmtInt(r.plays) },
            { key: "l", header: "Last played", render: (r) => fmtTime(r.last_play, true) },
          ]} />
      </div>
    </div>
  );
}

function Gaps({ d, label }: { d: Insights; label: boolean }) {
  const groups = byRegion(d.notPlaying);
  if (!groups.length) return <p className="text-sm text-emerald-200">Every station we monitor has played you in the last {d.days} days.</p>;
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        <b className="text-slate-200">{d.notPlaying.length}</b> of {d.stationsMonitored} monitored stations haven&apos;t played any {label ? "of your roster's" : "of your"} songs in the last {d.days} days. These are your next pitches.
      </p>
      {groups.map(([region, names]) => (
        <div key={region}>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">{region} · {names.length}</p>
          <div className="flex flex-wrap gap-1.5">
            {names.map((n) => <span key={n} className="rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-300">{n}</span>)}
          </div>
        </div>
      ))}
    </div>
  );
}

function Recent({ d, onChange }: { d: Insights; onChange: () => void }) {
  if (!d.recent.length) return <p className="text-sm text-slate-400">Your plays will appear here, each with a 10-second clip you can share as proof.</p>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">Turn any play into a public link with the audio clip — send it to fans, promoters or UPRS.</p>
      <ul className="divide-y divide-slate-800">
        {d.recent.map((p) => <PlayRow key={p.id} p={p} demo={d.demo} onChange={onChange} />)}
      </ul>
    </div>
  );
}

function PlayRow({ p, demo, onChange }: { p: RecentPlay; demo: boolean; onChange: () => void }) {
  const [token, setToken] = useState<string | null>(p.share_token);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const link = token ? proofLink(token) : null;

  const share = async () => {
    setBusy(true); setMsg(null);
    try {
      const t = token ?? (await shareDetection(p.id));
      setToken(t);
      const url = proofLink(t);
      try { await navigator.clipboard.writeText(url); setMsg("Link copied"); } catch { setMsg("Link ready"); }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't create the link.");
    } finally { setBusy(false); }
  };
  const stop = async () => {
    setBusy(true); setMsg(null);
    try { await unshareDetection(p.id); setToken(null); setMsg("Link turned off"); if (!demo) onChange(); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Couldn't turn the link off."); }
    finally { setBusy(false); }
  };
  const wa = link ? `https://wa.me/?text=${encodeURIComponent(`"${p.title}" just played on ${p.station ?? "radio"} — hear the proof: ${link}`)}` : null;

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <EvidencePlayer seed={p.id} size="sm" label={`${p.title} on ${p.station ?? "radio"}`}
        resolveUrl={!demo && p.evidence_path ? () => evidenceUrl(p.evidence_path) : undefined} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-white">{p.title}{p.artist ? <span className="font-normal text-slate-400"> · {p.artist}</span> : null}</p>
        <p className="text-xs text-slate-400">{p.station ?? "Unknown station"}{p.frequency ? ` ${p.frequency}` : ""} · {fmtTime(p.detected_at, true)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {token && <Badge tone="ok">Public link on</Badge>}
        <button type="button" onClick={share} disabled={busy} className="btn-primary px-3 py-1.5 text-xs">{token ? "Copy link" : "Share proof"}</button>
        {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/10">WhatsApp</a>}
        {token && <button type="button" onClick={stop} disabled={busy} className="text-xs text-slate-400 underline hover:text-white">Turn off</button>}
        {msg && <span className="text-xs text-slate-400" role="status">{msg}</span>}
      </div>
    </li>
  );
}
