"use client";

import { useState, type FormEvent } from "react";
import { addArtist, loadLabel, removeArtist, type LabelData, type RosterArtist } from "@/lib/db/label";
import { useLoad } from "@/lib/db/core";
import { ISRC_RE } from "@/lib/db/masters";
import { useAuth } from "@/lib/auth-context";
import { fmtInt, fmtUGX, safeArray } from "@/lib/safe";
import { ExportCsv } from "@/components/dashboard/ExportCsv";
import { BarChart, DataTable, LoadGate, SaveNote, Section, StatGrid } from "@/components/dashboard/ui";
import { SongCatalogue, SongUploader } from "@/components/dashboard/Songs";
import { WhatsAppAlerts } from "@/components/dashboard/WhatsAppAlerts";

type Save = { kind: "idle" | "saving" | "saved" | "error"; msg?: string };

function Roster({ data, reload }: { data: LabelData; reload: () => void }) {
  const [name, setName] = useState("");
  const [genre, setGenre] = useState("Afrobeat");
  const [save, setSave] = useState<Save>({ kind: "idle" });

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setSave({ kind: "saving" });
    try {
      await addArtist(data.orgId, n, genre);
      setName("");
      setSave({ kind: "saved" });
      reload();
    } catch (err) {
      setSave({ kind: "error", msg: err instanceof Error ? err.message : undefined });
    }
  };
  const remove = async (a: RosterArtist) => {
    if (!window.confirm(`Remove ${a.name} from your roster?`)) return;
    try {
      await removeArtist(a.id);
      reload();
    } catch (err) {
      setSave({ kind: "error", msg: err instanceof Error ? err.message : undefined });
    }
  };

  return (
    <Section id="roster" title="Artist Roster" actions={
      <ExportCsv
        label="Export roster"
        sheets={[{
          subject: "east-sound-roster",
          headers: ["Artist", "Genre", "Songs", "Plays (30 days)"],
          rows: safeArray(data.roster).map((a) => [a.name, a.genre, a.tracks, a.spins30d]),
        }]}
      />
    }>
      <form onSubmit={add} className="mb-4 flex flex-wrap items-center gap-2">
        <input className="input !w-56 !py-2" placeholder="Artist name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Artist name" maxLength={120} />
        <select className="input !w-40 !py-2" value={genre} onChange={(e) => setGenre(e.target.value)} aria-label="Genre">
          {["Afrobeat", "R&B", "Dancehall", "Hip-Hop", "Kadongo Kamu", "Gospel", "Amapiano"].map((g) => <option key={g}>{g}</option>)}
        </select>
        <button className="btn-primary !py-2" disabled={!name.trim() || save.kind === "saving"}>+ Add artist</button>
        <SaveNote state={save} />
      </form>
      <DataTable rows={data.roster} rowKey={(r) => r.id} empty="No artists yet — add your first signing above."
        columns={[
          { key: "name", header: "Artist", render: (r) => <span className="font-medium text-white">{r.name}</span> },
          { key: "genre", header: "Genre", render: (r) => r.genre },
          { key: "tracks", header: "Tracks", render: (r) => <span className="font-mono">{r.tracks}</span>, className: "text-right" },
          { key: "spins", header: "Plays · 30 days", render: (r) => <span className="font-mono">{fmtInt(r.spins30d)}</span>, className: "text-right" },
          { key: "rm", header: "", render: (r) => <button type="button" className="text-xs text-slate-500 hover:text-rose-300" onClick={() => remove(r)}>Remove</button> },
        ]} />
    </Section>
  );
}

function CodesNote({ songs }: { songs: LabelData["catalogue"] }) {
  const gaps = safeArray(songs).filter((s) => !ISRC_RE.test(s.isrc)).length;
  return <span className="text-xs text-slate-500">{gaps ? `${gaps} song${gaps > 1 ? "s" : ""} missing an ISRC` : safeArray(songs).length ? "All ISRCs complete" : ""}</span>;
}

export function LabelDashboard() {
  const { session } = useAuth();
  const state = useLoad(loadLabel);
  return (
    <LoadGate state={state}>
      {(d) => (
        <>
          <section id="overview" className="scroll-mt-20">
            <h1 className="mb-4 text-2xl font-bold text-white">Label overview</h1>
            <StatGrid items={[
              { label: "Artists", value: String(d.stats.artists) },
              { label: "Recordings", value: String(d.stats.recordings) },
              { label: "Plays · 30 days", value: fmtInt(d.stats.spins30d) },
              { label: "Royalties this year", value: fmtUGX(d.stats.revenueYtd) },
            ]} />
          </section>
          <Roster data={d} reload={state.reload} />
          <Section id="dropzone" title="Upload Songs">
            <SongUploader owner={{ kind: "label", orgId: d.orgId }} artists={d.roster} existing={d.catalogue} onSaved={state.reload} />
            {safeArray(d.roster).length === 0 && (
              <p className="mt-3 text-xs text-slate-500">Tip: add your artists to the roster above first, then pick them from a list when you upload.</p>
            )}
          </Section>
          <Section id="catalogue" title="Catalogue" actions={
            <div className="flex items-center gap-3">
              <CodesNote songs={d.catalogue} />
              <ExportCsv
                sheets={[{
                  subject: "east-sound-catalogue",
                  headers: ["Title", "Artist", "Featuring", "Genre", "Producer", "Composer", "Publisher", "ISRC", "UPC", "Release", "Enrolled"],
                  rows: safeArray(d.catalogue).map((s) => [
                    s.title, s.artistName, s.featuring, s.genre, s.producer, s.composer, s.publisher,
                    s.isrc, s.upc, s.releaseDate, s.enrolledAt ? "yes" : "no",
                  ]),
                }]}
              />
            </div>
          }>
            <SongCatalogue songs={d.catalogue} artists={d.roster} onChanged={state.reload}
              empty="No songs yet — upload your first master above." />
          </Section>
          <Section id="revenue" title="Label Revenue">
            {safeArray(d.revenue).length ? (
              <>
                <BarChart data={safeArray(d.revenue).map((r) => ({ label: r.month, value: r.ugx }))} format={(v) => fmtUGX(v)} />
                <p className="mt-3 text-xs text-slate-500">* Estimated — not yet final.</p>
              </>
            ) : <p className="text-sm text-slate-500">No royalty statements yet.</p>}
          </Section>
          <Section id="alerts" title="Airplay Alerts">
            <WhatsAppAlerts scope={`label_${session?.userId ?? "anon"}`} />
          </Section>
        </>
      )}
    </LoadGate>
  );
}
