"use client";

import { useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { getAudioContext, makeReference, type Reference } from "@/lib/audio";
import {
  GENRES, ISRC_RE, MAX_CREDITS, UPC_RE, attachReference, createSong, deleteSong, detailProblems, emptyDetails, guessFromFilename, recognition, upcConflict, updateSong,
  type Owner, type Song, type SongDetails,
} from "@/lib/db/masters";
import { cx, safeArray } from "@/lib/safe";
import { Badge } from "@/components/dashboard/ui";
import { matchFileToSong, songsFromLinks, splitLinks, type LinkSong } from "@/lib/db/links";

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

/** Warns (never blocks) when the UPC is already used for a different main artist. */
function useUpcWarning(upc: string, artistName: string, songId?: string | null): boolean {
  const [clash, setClash] = useState(false);
  useEffect(() => {
    setClash(false);
    if (!UPC_RE.test(upc) || !artistName.trim()) return;
    let live = true;
    const t = window.setTimeout(() => { upcConflict(upc, artistName, songId).then((c) => { if (live) setClash(c); }).catch(() => undefined); }, 500);
    return () => { live = false; window.clearTimeout(t); };
  }, [upc, artistName, songId]);
  return clash;
}

/**
 * One person per row, because that is how a cue sheet reads them. A single
 * text box forced "A, B & C" into one field, and UPRS pays people, not blobs.
 */
function NamesField({ label, hint, addLabel, placeholder, value, onChange, suggestions, wide }: {
  label: string;
  hint?: string;
  addLabel: string;
  placeholder?: string;
  value: string[];
  onChange: (next: string[]) => void;
  suggestions?: string[];
  wide?: boolean;
}) {
  const listId = useId();
  const names = safeArray(value);
  const rows = names.length ? names : [""];
  const setAt = (i: number, v: string) => onChange(rows.map((n, j) => (j === i ? v : n)));
  const removeAt = (i: number) => onChange(rows.filter((_, j) => j !== i));
  const options = safeArray(suggestions).filter((s) => s.trim());
  return (
    <div className={cx("block", wide && "sm:col-span-2")}>
      <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
      <ul className="space-y-2">
        {rows.map((name, i) => (
          <li key={i} className="flex items-center gap-2">
            <input
              className="input !py-2"
              value={name}
              maxLength={120}
              placeholder={i === 0 ? placeholder : undefined}
              aria-label={`${label} ${i + 1}`}
              list={options.length ? listId : undefined}
              onChange={(e) => setAt(i, e.target.value)}
            />
            {rows.length > 1 && (
              <button
                type="button"
                aria-label={`Remove ${label} ${i + 1}`}
                onClick={() => removeAt(i)}
                className="shrink-0 rounded-lg border border-slate-800 px-2.5 py-1.5 text-slate-500 transition hover:border-rose-400/40 hover:text-rose-300"
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      {options.length > 0 && (
        <datalist id={listId}>
          {options.map((o) => <option key={o} value={o} />)}
        </datalist>
      )}
      {rows.length < MAX_CREDITS && (
        <button type="button" className="mt-2 text-xs font-medium text-emerald-300 transition hover:text-emerald-200" onClick={() => onChange([...rows, ""])}>
          + {addLabel}
        </button>
      )}
      {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
    </div>
  );
}

export const ISRC_HINT =
  "Copy it from your distributor's dashboard (DistroKid, Ditto, TuneCore…) — don't type it from memory. Each version (remix, radio edit, clean, live) has its own ISRC. Leave blank if you don't have one yet.";
export const UPC_HINT = "The release's barcode from your distributor, 12–13 digits. Every track on an album shares it. Optional.";

export function SongForm({ value, onChange, artists, lockArtist, songId }: {
  value: SongDetails;
  onChange: (d: SongDetails) => void;
  /** Label roster: picking one links the song to that artist. */
  artists?: Artist[];
  /** Independent artists: the artist is the account holder. */
  lockArtist?: boolean;
  /** When editing a saved song: leave it out of the UPC check. */
  songId?: string | null;
}) {
  const set = (p: Partial<SongDetails>) => onChange({ ...value, ...p });
  const upcClash = useUpcWarning(value.upc, value.artistName, songId);
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
      <NamesField
        label="Featured artists"
        wide
        addLabel="Add another featured artist"
        placeholder="Who is featured on this song?"
        hint="Every name here is credited as “feat.” on airplay reports and cue sheets. Leave empty for a solo record."
        value={value.featured}
        onChange={(featured) => set({ featured })}
        suggestions={roster.map((a) => a.name)}
      />
      <NamesField
        label="Songwriters / composers"
        wide
        addLabel="Add another songwriter"
        placeholder="Full name of the first writer"
        hint="One row per writer — three writers means three rows, and three names on the cue sheet. Money is split on the split sheet, not here."
        value={value.songwriters}
        onChange={(songwriters) => set({ songwriters })}
      />
      <Field label="Genre">
        <select className="input !py-2" value={value.genre} onChange={(e) => set({ genre: e.target.value })}>
          <option value="">—</option>
          {GENRES.map((g) => <option key={g}>{g}</option>)}
        </select>
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
      <Field label="ISRC" hint={ISRC_HINT}>
        <input className={cx("input !py-2 font-mono", value.isrc && !ISRC_RE.test(value.isrc) && "!border-rose-500/60")} value={value.isrc}
          placeholder="UG-XXX-26-00000" onChange={(e) => set({ isrc: e.target.value.toUpperCase().trim() })} />
      </Field>
      <Field label="UPC / barcode" hint={UPC_HINT}>
        <input className={cx("input !py-2 font-mono", value.upc && !UPC_RE.test(value.upc) && "!border-rose-500/60", upcClash && "!border-amber-400/60")} value={value.upc}
          inputMode="numeric" onChange={(e) => set({ upc: e.target.value.replace(/\D/g, "") })} />
        {upcClash && (
          <span role="status" className="mt-1 block text-[11px] font-medium text-amber-300">
            This UPC is already used for a song by a different artist. Check it against your distributor — unless this release is a compilation, it's probably the wrong code.
          </span>
        )}
      </Field>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload: pick audio → fill in details → save


type Job = {
  id: string;
  /** Missing until the audio is attached (songs added from a link). */
  file?: File;
  status: "needs_audio" | "analysing" | "ready" | "saving" | "saved" | "error";
  /** Filled from a streaming link: where from, and whether codes were found. */
  fromLink?: { platform: string; matchedOn: LinkSong["matchedOn"]; label?: string };
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

  const analyse = async (audio: AudioContext | null, id: string, file: File) => {
    try {
      if (!audio) throw new Error("This browser can't read audio files. Try Chrome or Edge.");
      if (file.size > 500 * 1024 * 1024) throw new Error("File is over 500 MB.");
      const ref = await makeReference(audio, file);
      patch(id, { status: "ready", ref });
    } catch (err) {
      patch(id, { status: "error", error: err instanceof Error ? err.message : "Couldn't read this file." });
    }
  };

  /** Attach a file to one waiting song (its own "Attach audio" button). */
  const attach = (id: string, file: File) => {
    const audio = getAudioContext();
    if (!isAudio(file)) return patch(id, { error: "That isn't an audio file." });
    patch(id, { file, status: "analysing", error: undefined });
    void analyse(audio, id, file);
  };

  const add = async (files: File[]) => {
    const audio = getAudioContext(); // created inside the drop/click gesture
    const all = files.filter(isAudio).slice(0, 25);
    // First, give each file to the song from a link with the same title.
    const waiting = safeArray(jobs).filter((j) => j.status === "needs_audio");
    const claimed = new Set<string>();
    const list: File[] = [];
    for (const f of all) {
      const open = waiting.filter((j) => !claimed.has(j.id));
      const i = matchFileToSong(guessFromFilename(f.name).title, open.map((j) => j.details.title));
      if (i >= 0) {
        claimed.add(open[i].id);
        attach(open[i].id, f);
      } else list.push(f);
    }
    const fresh: Job[] = list.map((f, i) => {
      const g = guessFromFilename(f.name);
      const match = roster.find((a) => a.name.toLowerCase() === g.artistName.toLowerCase());
      return {
        id: `${Date.now()}-${i}`, file: f, status: "analysing",
        details: emptyDetails({ title: g.title, artistName: defaultArtist ?? match?.name ?? g.artistName, artistId: match?.id ?? null }),
      };
    });
    setJobs((j) => [...fresh, ...safeArray(j)]);
    for (const job of fresh) if (job.file) await analyse(audio, job.id, job.file);
  };

  /** Songs from streaming links: details filled in, waiting for their audio. */
  const addFromLinks = (songs: { song: LinkSong; platform: string }[]) => {
    const stamp = Date.now();
    const fresh: Job[] = songs.map(({ song, platform }, i) => {
      const match = roster.find((a) => a.name.toLowerCase() === song.artistName.toLowerCase());
      return {
        id: `link-${stamp}-${i}`, status: "needs_audio", fromLink: { platform, matchedOn: song.matchedOn, label: song.label },
        details: emptyDetails({
          title: song.title, artistName: defaultArtist ?? match?.name ?? song.artistName, artistId: match?.id ?? null,
          // Catalogue genres are often wrong and the record label is not the music publisher:
          // genre only when it is one of ours; publisher is left for the owner to fill.
          featured: song.featured, genre: GENRES.find((g) => g.toLowerCase() === song.genre.toLowerCase()) ?? "", isrc: song.isrc, upc: song.upc, releaseDate: song.releaseDate,
        }),
      };
    });
    setJobs((j) => [...fresh, ...safeArray(j)]);
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
      <LinkBox onSongs={addFromLinks} />
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
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{j.file?.name ?? (j.details.title || "Song from link")}</span>
                  {j.ref && (
                    <span className="flex h-6 items-end gap-px" aria-hidden>
                      {safeArray(j.ref.envelope).map((v, i) => <span key={i} className="w-1 rounded-sm bg-emerald-400/70" style={{ height: `${Math.max(8, v * 100)}%` }} />)}
                    </span>
                  )}
                  <Badge tone={j.status === "saved" ? "ok" : j.status === "error" ? "bad" : "info"}>
                    {{ needs_audio: "Attach audio", analysing: "Reading audio…", ready: "Add details", saving: "Saving…", saved: "Saved", error: "Can't use this file" }[j.status]}
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
                    {j.fromLink && (
                      <p className={cx("mb-3 rounded-lg border px-3 py-2 text-xs", j.fromLink.matchedOn === "deezer" ? "border-emerald-400/20 bg-emerald-400/5 text-emerald-200" : "border-amber-400/20 bg-amber-400/5 text-amber-200")}>
                        {j.fromLink.matchedOn === "deezer"
                          ? `Details filled in from ${j.fromLink.platform}, with ISRC and UPC from the release${j.fromLink.label ? ` (label: ${j.fromLink.label})` : ""}. Check them against your distributor's records, and add the songwriters and publisher.`
                          : `Title and artist filled in from ${j.fromLink.platform}. We couldn't find this release's ISRC or UPC — add them from your distributor.`}
                      </p>
                    )}
                    <SongForm value={j.details} onChange={(d) => patch(j.id, { details: d, error: undefined })} artists={artists} lockArtist={Boolean(defaultArtist)} />
                    {j.status === "needs_audio" && (
                      <AttachAudio onFile={(f) => attach(j.id, f)} />
                    )}
                    {j.ref?.truncated && <p className="mt-2 text-xs text-amber-300">This file is very long; only the first 15 minutes are used for recognition.</p>}
                    {dup && <p className="mt-2 text-xs text-amber-300">“{dup}” by this artist is already in your catalogue — saving adds a second copy.</p>}
                    {j.error && <p role="alert" className="mt-2 text-sm text-rose-300">{j.error}</p>}
                    <div className="mt-3 flex items-center gap-2">
                      <button type="button" className="btn-primary !py-2" disabled={j.status !== "ready"} onClick={() => save(j)}>
                        {j.status === "saving" ? "Saving…" : "Save song"}
                      </button>
                      {j.status === "analysing" && <span className="text-xs text-slate-500">You can fill in details while the audio is read.</span>}
                      {j.status === "needs_audio" && <span className="text-xs text-slate-500">Attach the song&apos;s audio file to save it — East Sound learns the song from your file.</span>}
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

function AttachAudio({ onFile }: { onFile: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-slate-700 px-3 py-2">
      <button type="button" className="btn-ghost !py-1.5 text-xs" onClick={() => ref.current?.click()}>Attach audio file</button>
      <span className="text-xs text-slate-500">or drop it on the box above — it&apos;s matched to this song by title.</span>
      <input ref={ref} type="file" accept="audio/*,.wav,.mp3,.flac,.aac,.m4a" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
    </div>
  );
}

/** Paste Spotify / Apple Music / Deezer / YouTube / Audiomack / Boomplay links; album links add every track. */
function LinkBox({ onSongs }: { onSongs: (s: { song: LinkSong; platform: string }[]) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const run = async () => {
    const urls = splitLinks(text);
    setProblems([]); setNote(null);
    if (!urls.length) return setProblems(["Paste at least one song or album link."]);
    if (urls.length > 25) return setProblems(["Up to 25 links at a time."]);
    setBusy(true);
    try {
      const results = await songsFromLinks(urls);
      const found = results.flatMap((r) => (r.ok ? r.songs.map((song) => ({ song, platform: r.platform })) : []));
      setProblems(results.flatMap((r) => (r.ok ? [] : [`${r.url} — ${r.error}`])));
      if (found.length) {
        onSongs(found);
        setText("");
        setNote(`${found.length} song${found.length === 1 ? "" : "s"} added below. Check the details, then attach each song's audio.`);
      }
    } catch (e) {
      setProblems([e instanceof Error ? e.message : "Couldn't read those links."]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mb-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
      <label htmlFor="song-links" className="text-sm font-semibold text-white">Add from links</label>
      <p className="mt-0.5 text-xs text-slate-500">
        Paste Spotify, Apple Music, Deezer, YouTube, Audiomack or Boomplay links, one per line. An album link adds every track.
        We fill in the title, artists, ISRC, UPC and release date — you check them, add the writers and attach the audio.
      </p>
      <textarea id="song-links" rows={3} className="input mt-2 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)}
        placeholder={"https://open.spotify.com/album/…\nhttps://music.apple.com/ug/album/…?i=…"} />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary !py-2" onClick={run} disabled={busy}>{busy ? "Reading links…" : "Fill in details"}</button>
        {note && <span role="status" className="text-xs text-emerald-300">{note}</span>}
      </div>
      {problems.length > 0 && (
        <ul role="alert" className="mt-2 space-y-1 text-xs text-rose-300">{problems.map((p) => <li key={p} className="break-all">{p}</li>)}</ul>
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
      <SongForm value={d} onChange={setD} artists={artists} lockArtist={lockArtist} songId={song.id} />
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
                  {s.featured.length > 0 && <span className="block text-xs text-slate-500">feat. {s.featured.join(", ")}</span>}
                  {s.songwriters.length > 0 ? (
                    <span className="block text-[11px] text-slate-600">written by {s.songwriters.join(", ")}</span>
                  ) : (
                    <span className="block text-[11px] text-amber-300/80">no writer named yet — add one so cue sheets pay the right person</span>
                  )}
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
