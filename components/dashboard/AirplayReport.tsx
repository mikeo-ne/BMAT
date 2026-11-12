"use client";

import { useState } from "react";
import { fmtInt } from "@/lib/safe";
import { fmtTime, useLoad } from "@/lib/db/core";
import { proofLink } from "@/lib/db/insights";
import { loadSongReport, pitchText, REPORT_HEADERS, reportRows, type SongAirplay } from "@/lib/db/report";
import { ExportCsv } from "./ExportCsv";
import { DataTable, LoadGate, Section } from "./ui";

/** Per-song airplay keyed by ISRC: a CSV for distributors and labels, and pitch text for DSP editors and press. */
export function AirplayReport({ days }: { days: number }) {
  const state = useLoad(() => loadSongReport(days), [days]);
  const exportBtn = state.data ? (
    <ExportCsv label="Download report (CSV)" sheets={[{ subject: `airplay-report-${state.data.days}d`, headers: REPORT_HEADERS, rows: reportRows(state.data) }]} />
  ) : null;
  return (
    <Section id="report" kicker="For distributors, DSP editors and press" title="Airplay report by song" actions={exportBtn}>
      <LoadGate state={state}>
        {(r) => (
          <div className="space-y-4">
            {r.demo && <p className="text-xs text-amber-200/80">Sample data — sign in to see your own songs.</p>}
            <p className="text-sm text-slate-400">
              Every song with its ISRC and UPC, so your distributor or label can match it to their catalogue. Use <b className="text-slate-200">Copy pitch</b> for
              Spotify, Apple Music, Boomplay or Audiomack playlist pitches, press releases and your EPK.
            </p>
            <DataTable rows={r.songs} rowKey={(s) => s.id} empty="Upload songs to start your airplay report."
              columns={[
                { key: "t", header: "Song", render: (s) => (
                  <div><p className="font-medium text-white">{s.title}</p><p className="text-xs text-slate-500">{s.artist}{s.featuring ? ` ft. ${s.featuring}` : ""}</p></div>
                ) },
                { key: "i", header: "ISRC · UPC", render: (s) => (
                  <div className="font-mono text-xs"><p>{s.isrc || "— no ISRC"}</p><p className="text-slate-500">{s.upc || "—"}</p></div>
                ) },
                { key: "p", header: "Plays", className: "text-right font-mono", render: (s) => fmtInt(s.plays) },
                { key: "s", header: "Stations", className: "text-right font-mono", render: (s) => fmtInt(s.stations) },
                { key: "l", header: "Last play", render: (s) => (s.last_play ? fmtTime(s.last_play, true) : "—") },
                { key: "c", header: "", render: (s) => <CopyPitch s={s} days={r.days} /> },
              ]} />
            <p className="text-xs text-slate-500">
              DSPs don&apos;t accept airplay data from outside their distributors, so this report is built for the people who pitch to them.
            </p>
          </div>
        )}
      </LoadGate>
    </Section>
  );
}

function CopyPitch({ s, days }: { s: SongAirplay; days: number }) {
  const [note, setNote] = useState<string | null>(null);
  const text = pitchText(s, days, s.proof_token ? proofLink(s.proof_token) : undefined);
  if (!text) return <span className="text-xs text-slate-500">No plays yet</span>;
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setNote("Copied"); }
    catch { window.prompt("Copy this pitch:", text); }
    setTimeout(() => setNote(null), 3000);
  };
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={copy} title={text} className="rounded-lg border border-emerald-500/40 px-2.5 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/10">
        Copy pitch
      </button>
      {note && <span className="text-xs text-emerald-300" role="status">{note}</span>}
    </div>
  );
}
