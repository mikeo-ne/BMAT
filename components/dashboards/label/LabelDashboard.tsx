"use client";

import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { addArtist, loadLabel, removeArtist, saveCodes, saveFingerprint, type CatalogueItem, type LabelData, type RosterArtist } from "@/lib/db/label";
import { useLoad } from "@/lib/db/core";
import { fingerprintFile, getAudioContext, type Fingerprint } from "@/lib/audio";
import { useAuth } from "@/lib/auth-context";
import { cx, fmtInt, fmtUGX, safeArray } from "@/lib/safe";
import { Badge, BarChart, DataTable, LoadGate, SaveNote, Section, StatGrid } from "@/components/dashboard/ui";
import { WhatsAppAlerts } from "@/components/dashboard/WhatsAppAlerts";

const ISRC_RE = /^[A-Z]{2}-?[A-Z0-9]{3}-?\d{2}-?\d{5}$/;
const UPC_RE = /^\d{12,13}$/;
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
    <Section id="roster" title="Artist Roster">
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

type Job = { id: string; name: string; status: "processing" | "done" | "error" | "duplicate"; fp?: Fingerprint; error?: string; attached?: string };

function Dropzone({ catalogue, reload }: { catalogue: CatalogueItem[]; reload: () => void }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const seen = useRef(new Set<string>());
  const patch = (id: string, p: Partial<Job>) => setJobs((j) => safeArray(j).map((x) => (x.id === id ? { ...x, ...p } : x)));

  const process = async (files: File[]) => {
    const audio = getAudioContext(); // inside the drop/change gesture
    const list = files.filter((f) => f.type.startsWith("audio/") || /\.(wav|mp3|flac|aac|m4a|ogg)$/i.test(f.name)).slice(0, 25);
    const fresh: Job[] = list.map((f, i) => ({ id: `${Date.now()}-${i}`, name: f.name, status: "processing" }));
    setJobs((j) => [...fresh, ...safeArray(j)]);
    for (let i = 0; i < list.length; i++) {
      try {
        if (!audio) throw new Error("This browser can't analyse audio.");
        if (list[i].size > 200 * 1024 * 1024) throw new Error("File is over 200 MB.");
        const fp = await fingerprintFile(audio, list[i]);
        const dup = seen.current.has(fp.hash);
        seen.current.add(fp.hash);
        patch(fresh[i].id, { status: dup ? "duplicate" : "done", fp });
      } catch (err) {
        patch(fresh[i].id, { status: "error", error: err instanceof Error ? err.message : "Couldn't read this file." });
      }
    }
  };
  const attach = async (job: Job, recordingId: string) => {
    if (!job.fp || !recordingId) return;
    try {
      await saveFingerprint(recordingId, job.fp.hash);
      patch(job.id, { attached: catalogue.find((c) => c.id === recordingId)?.title ?? "recording" });
      reload();
    } catch (err) {
      patch(job.id, { error: err instanceof Error ? err.message : "Couldn't save." });
    }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void process(Array.from(e.dataTransfer?.files ?? []));
  };

  return (
    <Section id="dropzone" title="Batch Master Dropzone">
      <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}
        onClick={() => input.current?.click()} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        role="button" tabIndex={0}
        className={cx("flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition",
          over ? "border-emerald-400 bg-emerald-400/5 shadow-glow" : "border-slate-700 hover:border-emerald-400/50")}>
        <p className="font-semibold text-white">Drop masters here, or click to choose files</p>
        <p className="mt-1 text-sm text-slate-500">WAV, MP3, FLAC or AAC · up to 25 at once · analysed in your browser, never uploaded</p>
        <input ref={input} type="file" accept="audio/*" multiple hidden onChange={(e) => { void process(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
      </div>
      {safeArray(jobs).length > 0 && (
        <ul className="mt-4 divide-y divide-slate-800">
          {safeArray(jobs).map((j) => (
            <li key={j.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm text-white">{j.name}</span>
              {j.fp && (
                <span className="flex h-6 items-end gap-px" aria-hidden>
                  {safeArray(j.fp.envelope).map((v, i) => <span key={i} className="w-1 rounded-sm bg-emerald-400/70" style={{ height: `${Math.max(8, v * 100)}%` }} />)}
                </span>
              )}
              <Badge tone={j.status === "done" ? "ok" : j.status === "error" ? "bad" : j.status === "duplicate" ? "warn" : "info"}>
                {j.status === "processing" ? "Analysing…" : j.status === "duplicate" ? "Duplicate of another file" : j.status === "done" ? "Fingerprinted" : "Failed"}
              </Badge>
              {j.status === "done" && !j.attached && (
                <select className="input !w-48 !py-1 text-xs" defaultValue="" onChange={(e) => attach(j, e.target.value)} aria-label={`Attach ${j.name} to a recording`}>
                  <option value="" disabled>Attach to recording…</option>
                  {safeArray(catalogue).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              )}
              {j.attached && <span className="text-xs text-emerald-300">✓ Saved to {j.attached}</span>}
              {j.error && <span className="w-full text-xs text-rose-300">{j.error}</span>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function CodeRow({ item, onSaved }: { item: CatalogueItem; onSaved: () => void }) {
  const [isrc, setIsrc] = useState(item.isrc);
  const [upc, setUpc] = useState(item.upc);
  const [save, setSave] = useState<Save>({ kind: "idle" });
  const dirty = isrc !== item.isrc || upc !== item.upc;
  const valid = (!isrc || ISRC_RE.test(isrc)) && (!upc || UPC_RE.test(upc));
  const ready = ISRC_RE.test(isrc) && UPC_RE.test(upc);
  const onSave = async () => {
    setSave({ kind: "saving" });
    try {
      await saveCodes(item.id, isrc, upc);
      setSave({ kind: "saved" });
      onSaved();
    } catch (e) {
      setSave({ kind: "error", msg: e instanceof Error ? e.message : undefined });
    }
  };
  return (
    <tr className="transition hover:bg-slate-800/30">
      <td className="td pl-4 sm:pl-5"><span className="font-medium text-white">{item.title}</span></td>
      <td className="td">{item.artist}</td>
      <td className="td">
        <input className={cx("input !w-40 !py-1 font-mono text-xs", isrc && !ISRC_RE.test(isrc) && "!border-rose-500/60")} value={isrc} placeholder="UG-XXX-26-00000"
          onChange={(e) => setIsrc(e.target.value.toUpperCase().trim())} aria-label={`ISRC for ${item.title}`} />
      </td>
      <td className="td">
        <input className={cx("input !w-36 !py-1 font-mono text-xs", upc && !UPC_RE.test(upc) && "!border-rose-500/60")} value={upc} placeholder="12–13 digits"
          onChange={(e) => setUpc(e.target.value.replace(/\D/g, ""))} aria-label={`UPC for ${item.title}`} inputMode="numeric" />
      </td>
      <td className="td"><span className="font-mono text-xs">{item.release || "—"}</span></td>
      <td className="td">
        {dirty ? (
          <span className="flex items-center gap-2">
            <button type="button" className="btn-primary !px-3 !py-1 text-xs" disabled={!valid || save.kind === "saving"} onClick={onSave}>Save</button>
            <SaveNote state={save} />
          </span>
        ) : ready ? (
          <Badge tone={item.fingerprinted ? "ok" : "warn"}>{item.fingerprinted ? "Ready" : "Needs fingerprint"}</Badge>
        ) : (
          <Badge tone="bad">Missing codes</Badge>
        )}
      </td>
    </tr>
  );
}

function Catalogue({ items, reload }: { items: CatalogueItem[]; reload: () => void }) {
  const gaps = safeArray(items).filter((i) => !ISRC_RE.test(i.isrc) || !UPC_RE.test(i.upc)).length;
  return (
    <Section id="catalogue" title="Catalogue & ISRC / UPC" actions={<span className="text-xs text-slate-500">{gaps ? `${gaps} recording${gaps > 1 ? "s" : ""} missing codes` : "All codes complete"}</span>}>
      <div className="-mx-4 overflow-x-auto sm:-mx-5">
        <table className="min-w-full">
          <thead className="bg-slate-900/95">
            <tr>{["Title", "Artist", "ISRC", "UPC", "Release", "Status"].map((h) => <th key={h} className="th first:pl-4 sm:first:pl-5">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {safeArray(items).map((it) => <CodeRow key={`${it.id}-${it.isrc}-${it.upc}`} item={it} onSaved={reload} />)}
            {safeArray(items).length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-500">No recordings yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </Section>
  );
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
          <Dropzone catalogue={d.catalogue} reload={state.reload} />
          <Catalogue items={d.catalogue} reload={state.reload} />
          <Section id="revenue" title="Label Revenue">
            {safeArray(d.revenue).length ? (
              <>
                <BarChart data={safeArray(d.revenue).map((r) => ({ label: r.month, value: r.ugx }))} format={(v) => fmtUGX(v)} />
                <p className="mt-3 text-xs text-slate-500">* Estimated — not yet final.</p>
              </>
            ) : <p className="text-sm text-slate-500">No royalty statements yet.</p>}
          </Section>
          <Section id="alerts" title="WhatsApp Alerts">
            <WhatsAppAlerts scope={`label_${session?.userId ?? "anon"}`} />
          </Section>
        </>
      )}
    </LoadGate>
  );
}
