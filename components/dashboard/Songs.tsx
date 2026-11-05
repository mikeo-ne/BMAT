"use client";

import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { getAudioContext, makeReference, type Reference } from "@/lib/audio";
import {
  GENRES, ISRC_RE, UPC_RE, attachReference, createSong, deleteSong, detailProblems, emptyDetails, guessFromFilename, recognition, updateSong,
  type Owner, type Song, type SongDetails,
} from "@/lib/db/masters";
import { cx, safeArray } from "@/lib/safe";
import { Badge } from "@/components/dashboard/ui";

type Artist = { id: string; name: string };
const AUDIO_RE = /\.(wav|mp3|flac|aac|m4a|ogg|aif|aiff)$/i;
const isAudio = (f: File) => f.type.startsWith("audio/") || AUDIO_RE.test(f.name);

// ---------------------------------------------------------------------------
// Details form

function Field({ label, hint, children, wide }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={cx("block", wide && "sm:col-span-2")}>
      <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

export function SongForm({ value, onChange, artists, lockArtist }: {
  value: SongDetails;
  onChange: (d: SongDetails) => void;
  /** Label roster: picking one links the song to that artist. */
  artists?: Artist[];
  /** Independent artists: the artist is the account holder. */
  lockArtist?: boolean;
}) {
  const set = (p: Partial<SongDetails>) => onChange({ ...value, ...p });
  const roster = safeArray(artists);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Song title *">
        <input className="input !py-2" value={value.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} />
      </Field>
      <Field label="Main artist *">
        {roster.length > 0 && !lockArtist ? (
          <select className="input !py-2" value={value.artistId ?? ""}
            onChange={(e) => { const a = roster.find((x) => x.id === e.target.value); set({ artistId: a?.id ?? null, artistName: a?.name ?? value.artistName }); }}>
            <option value="">Choose from your roster…</option>
            {roster.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        ) : (
          <input className="input !py-2" value={value.artistName} maxLength={120} readOnly={lockArtist}
            onChange={(e) => set({ artistName: e.target.value })} />
        )}
      </Field>
      <Field label="Featuring" hint="Other performers, comma separated">
        <input className="input !py-2" value={value.featuring} maxLength={200} onChange={(e) => set({ featuring: e.target.value })} />
      </Field>
      <Field label="Genre">
        <select className="input !py-2" value={value.genre} onChange={(e) => set({ genre: e.target.value })}>
          <option value="">—</option>
          {GENRES.map((g) => <option key={g}>{g}</option>)}
        </select>
      </Field>
      <Field label="Songwriter(s) / composer" hint="Used on cue sheets and royalty splits">
        <input className="input !py-2" value={value.composer} maxLength={200} onChange={(e) => set({ composer: e.target.value })} />
      </Field>
      <Field label="Producer">
        <input className="input !py-2" value={value.producer} maxLength={200} onChange={(e) => set({ producer: e.target.value })} />
      </Field>
      <Field label="Publisher">
        <input className="input !py-2" value={value.publisher} maxLength={200} onChange={(e) => set({ publisher: e.target.value })} />
      </Field>
      <Field label="Release date">
        <input type="date" className="input !py-2" value={value.releaseDate} onChange={(e) => set({ releaseDate: e.target.value })} />
      </Field>
      <Field label="ISRC" hint="12 characters, e.g. UG-ABC-26-00001 — leave blank if you don't have one yet">
        <input className={cx("input !py-2 font-mono", value.isrc && !ISRC_RE.test(value.isrc) && "!border-rose-500/60")} value={value.isrc}
          placeholder="UG-XXX-26-00000" onChange={(e) => set({ isrc: e.target.value.toUpperCase().trim() })} />
      </Field>
      <Field label="UPC / barcode" hint="12–13 digits, for the release">
        <input className={cx("input !py-2 font-mono", value.upc && !UPC_RE.test(value.upc) && "!border-rose-500/60")} value={value.upc}
          inputMode="numeric" onChange={(e) => set({ upc: e.target.value.replace(/\D/g, "") })} />
      </Field>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload: pick audio → fill in details → save

type Job = {
  id: string;
  file: File;
  status: "analysing" | "ready" | "saving" | "saved" | "error";
  ref?: Reference;
  details: SongDetails;
  error?: string;
  duplicateOf?: string;
};

export function SongUploader({ owner, artists, defaultArtist, existing, onSaved }: {
  owner: Owner;
  artists?: Artist[];
  /** Independent artist's own name: fixed on every song. */
  defaultArtist?: string;
  existing: Song[];
  onSaved: () => void;
}) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const patch = (id: string, p: Partial<Job>) => setJobs((j) => safeArray(j).map((x) => (x.id === id ? { ...x, ...p } : x)));
  const roster = safeArray(artists);

  const add = async (files: File[]) => {
    const audio = getAudioContext(); // created inside the drop/click gesture
    const list = files.filter(isAudio).slice(0, 25);
    const fresh: Job[] = list.map((f, i) => {
      const g = guessFromFilename(f.name);
      const match = roster.find((a) => a.name.toLowerCase() === g.artistName.toLowerCase());
      return {
        id: `${Date.now()}-${i}`, file: f, status: "analysing",
        details: emptyDetails({ title: g.title, artistName: defaultArtist ?? match?.name ?? g.artistName, artistId: match?.id ?? null }),
      };
    });
    setJobs((j) => [...fresh, ...safeArray(j)]);
    for (const job of fresh) {
      try {
        if (!audio) throw new Error("This browser can't read audio files. Try Chrome or Edge.");
        if (job.file.size > 500 * 1024 * 1024) throw new Error("File is over 500 MB.");
        const ref = await makeReference(audio, job.file);
        patch(job.id, { status: "ready", ref });
      } catch (err) {
        patch(job.id, { status: "error", error: err instanceof Error ? err.message : "Couldn't read this file." });
      }
    }
  };

  const save = async (job: Job) => {
    if (!job.ref) return;
    const problems = detailProblems(job.details);
    if (problems.length) return patch(job.id, { error: problems.join(" ") });
    patch(job.id, { status: "saving", error: undefined });
    try {
      const id = await createSong(owner, job.details);
      await attachReference(id, job.ref);
      patch(job.id, { status: "saved" });
      onSaved();
    } catch (err) {
      patch(job.id, { status: "ready", error: err instanceof Error ? err.message : "Couldn't save." });
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void add(Array.from(e.dataTransfer?.files ?? []));
  };
  const titles = new Map(safeArray(existing).map((s) => [`${s.title}|${s.artistName}`.toLowerCase(), s.title]));

  return (
    <div>
      <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}
        onClick={() => input.current?.click()} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        role="button" tabIndex={0}
        className={cx("flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition",
          over ? "border-emerald-400 bg-emerald-400/5 shadow-glow" : "border-slate-700 hover:border-emerald-400/50")}>
        <p className="font-semibold text-white">Drop songs here, or click to choose files</p>
        <p className="mt-1 text-sm text-slate-500">WAV, MP3, FLAC or AAC · up to 25 at once · then add each song&apos;s details</p>
        <p className="mt-1 text-xs text-slate-600">Only a small listening copy is uploaded (about 2 MB a minute) — your full-quality master stays on your device.</p>
        <input ref={input} type="file" accept="audio/*,.wav,.mp3,.flac,.aac,.m4a" multiple hidden
          onChange={(e) => { void add(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
      </div>

      {safeArray(jobs).length > 0 && (
        <ul className="mt-4 space-y-3">
          {safeArray(jobs).map((j) => {
            const dup = titles.get(`${j.details.title}|${j.details.artistName}`.toLowerCase());
            return (
              <li key={j.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{j.file.name}</span>
                  {j.ref && (
                    <span className="flex h-6 items-end gap-px" aria-hidden>
                      {safeArray(j.ref.envelope).map((v, i) => <span key={i} className="w-1 rounded-sm bg-emerald-400/70" style={{ height: `${Math.max(8, v * 100)}%` }} />)}
                    </span>
                  )}
                  <Badge tone={j.status === "saved" ? "ok" : j.status === "error" ? "bad" : "info"}>
                    {{ analysing: "Reading audio…", ready: "Add details", saving: "Saving…", saved: "Saved", error: "Can't use this file" }[j.status]}
                  </Badge>
                  {j.status !== "saving" && (
                    <button type="button" className="text-xs text-slate-500 hover:text-white" onClick={() => setJobs((x) => x.filter((y) => y.id !== j.id))}>
                      {j.status === "saved" ? "Close" : "Remove"}
                    </button>
                  )}
                </div>

                {j.status === "saved" ? (
                  <p className="text-sm text-emerald-300">
                    ✓ “{j.details.title}” is in your catalogue. The monitoring server will learn it within a few minutes, then plays on air are logged automatically.
                  </p>
                ) : j.status === "error" ? (
                  <p className="text-sm text-rose-300">{j.error}</p>
                ) : (
                  <>
                    <SongForm value={j.details} onChange={(d) => patch(j.id, { details: d, error: undefined })} artists={artists} lockArtist={Boolean(defaultArtist)} />
                    {j.ref?.truncated && <p className="mt-2 text-xs text-amber-300">This file is very long; only the first 15 minutes are used for recognition.</p>}
                    {dup && <p className="mt-2 text-xs text-amber-300">“{dup}” by this artist is already in your catalogue — saving adds a second copy.</p>}
                    {j.error && <p role="alert" className="mt-2 text-sm text-rose-300">{j.error}</p>}
                    <div className="mt-3 flex items-center gap-2">
                      <button type="button" className="btn-primary !py-2" disabled={j.status !== "ready"} onClick={() => save(j)}>
                        {j.status === "saving" ? "Saving…" : "Save song"}
                      </button>
                      {j.status === "analysing" && <span className="text-xs text-slate-500">You can fill in details while the audio is read.</span>}
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Catalogue: every song, its codes, whether it's recognisable, edit / replace audio / delete

function RecognitionBadge({ song }: { song: Song }) {
  const r = recognition(song);
  return (
    <span title={r.detail}>
      <Badge tone={r.state === "ready" ? "ok" : r.state === "failed" ? "bad" : r.state === "learning" ? "info" : "warn"}>{r.label}</Badge>
    </span>
  );
}

function SongEditor({ song, artists, lockArtist, onDone }: { song: Song; artists?: Artist[]; lockArtist?: boolean; onDone: (changed: boolean) => void }) {
  const [d, setD] = useState<SongDetails>(song);
  const [busy, setBusy] = useState<"" | "saving" | "audio" | "deleting">("");
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const save = async () => {
    const problems = detailProblems(d);
    if (problems.length) return setErr(problems.join(" "));
    setBusy("saving"); setErr(null);
    try { await updateSong(song.id, d); onDone(true); } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't save."); setBusy(""); }
  };
  const replaceAudio = async (f: File | undefined) => {
    if (!f) return;
    const audio = getAudioContext();
    setBusy("audio"); setErr(null); setNote(null);
    try {
      if (!audio) throw new Error("This browser can't read audio files.");
      const ref = await makeReference(audio, f);
      await attachReference(song.id, ref);
      setNote(`Audio updated from ${f.name}. The monitoring server will re-learn the song shortly.`);
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't upload the audio."); }
    setBusy("");
  };
  const remove = async () => {
    if (!window.confirm(`Delete “${song.title}” from your catalogue?`)) return;
    setBusy("deleting"); setErr(null);
    try { await deleteSong(song); onDone(true); } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't delete."); setBusy(""); }
  };

  return (
    <div className="rounded-xl border border-emerald-400/20 bg-slate-950/70 p-4">
      <SongForm value={d} onChange={setD} artists={artists} lockArtist={lockArtist} />
      {err && <p role="alert" className="mt-3 text-sm text-rose-300">{err}</p>}
      {note && <p className="mt-3 text-sm text-emerald-300">{note}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary !py-2" disabled={Boolean(busy)} onClick={save}>{busy === "saving" ? "Saving…" : "Save details"}</button>
        <button type="button" className="btn-ghost !py-2" disabled={Boolean(busy)} onClick={() => file.current?.click()}>
          {busy === "audio" ? "Uploading…" : song.masterPath ? "Replace audio" : "Add audio"}
        </button>
        <input ref={file} type="file" accept="audio/*,.wav,.mp3,.flac,.aac,.m4a" hidden onChange={(e) => { void replaceAudio(e.target.files?.[0]); e.target.value = ""; }} />
        <button type="button" className="btn-ghost !py-2" disabled={Boolean(busy)} onClick={() => onDone(Boolean(note))}>Close</button>
        <button type="button" className="ml-auto text-xs text-slate-500 hover:text-rose-300" disabled={Boolean(busy)} onClick={remove}>
          {busy === "deleting" ? "Deleting…" : "Delete song"}
        </button>
      </div>
    </div>
  );
}

export function SongCatalogue({ songs, artists, lockArtist, onChanged, empty }: {
  songs: Song[];
  artists?: Artist[];
  lockArtist?: boolean;
  onChanged: () => void;
  empty: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const list = safeArray(songs);
  if (!list.length) return <p className="py-6 text-center text-sm text-slate-500">{empty}</p>;
  return (
    <div className="-mx-4 overflow-x-auto sm:-mx-5">
      <table className="min-w-full">
        <thead className="bg-slate-900/95">
          <tr>{["Title", "Artist", "ISRC", "UPC", "Release", "Recognition", ""].map((h) => <th key={h} className="th first:pl-4 sm:first:pl-5">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-800/70">
          {list.map((s) => (
            open === s.id ? (
              <tr key={s.id}><td colSpan={7} className="px-4 py-3 sm:px-5">
                <p className="mb-3 text-sm font-semibold text-white">Editing “{s.title}”</p>
                <SongEditor song={s} artists={artists} lockArtist={lockArtist} onDone={(changed) => { setOpen(null); if (changed) onChanged(); }} />
              </td></tr>
            ) : (
              <tr key={s.id} className="transition hover:bg-slate-800/30">
                <td className="td pl-4 sm:pl-5">
                  <span className="font-medium text-white">{s.title}</span>
                  {s.featuring && <span className="block text-xs text-slate-500">feat. {s.featuring}</span>}
                </td>
                <td className="td">{s.artistName || "—"}</td>
                <td className="td"><span className={cx("font-mono text-xs", !s.isrc && "text-amber-300")}>{s.isrc || "missing"}</span></td>
                <td className="td"><span className={cx("font-mono text-xs", !s.upc && "text-slate-500")}>{s.upc || "—"}</span></td>
                <td className="td"><span className="font-mono text-xs">{s.releaseDate || "—"}</span></td>
                <td className="td"><RecognitionBadge song={s} /></td>
                <td className="td text-right"><button type="button" className="btn-ghost !px-3 !py-1 text-xs" onClick={() => setOpen(s.id)}>Edit</button></td>
              </tr>
            )
          ))}
        </tbody>
      </table>
    </div>
  );
}
