"use client";

// Songs (recordings) and their reference audio, shared by the label and
// artist dashboards. RLS decides ownership: a label edits its organisation's
// songs, an independent artist edits their own self-released songs.
import { db, must } from "./core";

export type SongDetails = {
  title: string;
  artistName: string;
  /** Label roster artist; null for artists who upload their own songs. */
  artistId: string | null;
  featuring: string;
  producer: string;
  composer: string;
  publisher: string;
  genre: string;
  isrc: string;
  upc: string;
  releaseDate: string;
};

export type Song = SongDetails & {
  id: string;
  durationSec: number | null;
  masterPath: string | null;
  enrolledAt: string | null;
  enrollError: string | null;
};

export type Owner = { kind: "label"; orgId: string | null } | { kind: "artist"; userId: string | null };

export type Recognition = { state: "no-audio" | "learning" | "ready" | "failed"; label: string; detail?: string };

export const ISRC_RE = /^[A-Z]{2}-?[A-Z0-9]{3}-?\d{2}-?\d{5}$/;
export const UPC_RE = /^\d{12,13}$/;
export const GENRES = ["Afrobeat", "R&B", "Dancehall", "Hip-Hop", "Kadongo Kamu", "Gospel", "Amapiano", "Pop", "Reggae", "Other"];

export const SONG_COLUMNS =
  "id, title, artist_name, artist_id, featuring, producer, composer, publisher, genre, isrc, upc, release_date, duration_sec, master_path, enrolled_at, enroll_error";

type Row = {
  id: string; title: string; artist_name: string | null; artist_id: string | null; featuring: string | null; producer: string | null;
  composer: string | null; publisher: string | null; genre: string | null; isrc: string | null; upc: string | null; release_date: string | null;
  duration_sec: number | null; master_path: string | null; enrolled_at: string | null; enroll_error: string | null;
};

export function toSong(r: Partial<Row> & { id: string; title: string }): Song {
  return {
    id: r.id, title: r.title, artistName: r.artist_name ?? "", artistId: r.artist_id ?? null,
    featuring: r.featuring ?? "", producer: r.producer ?? "", composer: r.composer ?? "", publisher: r.publisher ?? "",
    genre: r.genre ?? "", isrc: r.isrc ?? "", upc: r.upc ?? "", releaseDate: r.release_date ?? "",
    durationSec: r.duration_sec ?? null, masterPath: r.master_path ?? null, enrolledAt: r.enrolled_at ?? null, enrollError: r.enroll_error ?? null,
  };
}

export function emptyDetails(over: Partial<SongDetails> = {}): SongDetails {
  return { title: "", artistName: "", artistId: null, featuring: "", producer: "", composer: "", publisher: "", genre: "", isrc: "", upc: "", releaseDate: "", ...over };
}

/** "Nalu Akello - Kampala Nights (Master).wav" → artist + title guesses. */
export function guessFromFilename(name: string): { artistName: string; title: string } {
  const stem = name.replace(/\.[a-z0-9]{2,4}$/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  const clean = (s: string) => s.replace(/\s*[([](final|master|mastered|mix|v\d+)[)\]]\s*/gi, " ").trim();
  const [a, ...rest] = stem.split(/\s+[-–—]\s+/);
  return rest.length ? { artistName: clean(a), title: clean(rest.join(" - ")) } : { artistName: "", title: clean(stem) };
}

/** Problems that stop a save, in plain words. Empty when the details are fine. */
export function detailProblems(d: SongDetails): string[] {
  const p: string[] = [];
  if (!d.title.trim()) p.push("Add the song title.");
  if (!d.artistName.trim()) p.push("Add the artist.");
  if (d.isrc && !ISRC_RE.test(d.isrc)) p.push("ISRC looks wrong — it's 12 characters like UG-ABC-26-00001.");
  if (d.upc && !UPC_RE.test(d.upc)) p.push("UPC/barcode should be 12 or 13 digits.");
  if (d.releaseDate && Number.isNaN(Date.parse(d.releaseDate))) p.push("Release date isn't a date.");
  return p;
}

export function recognition(s: Pick<Song, "masterPath" | "enrolledAt" | "enrollError">): Recognition {
  if (!s.masterPath) return { state: "no-audio", label: "No audio yet" };
  if (s.enrollError) return { state: "failed", label: "Couldn't learn", detail: s.enrollError };
  if (!s.enrolledAt) return { state: "learning", label: "Learning…", detail: "The monitoring server learns new songs within a few minutes." };
  return { state: "ready", label: "Recognisable on air" };
}

const nn = (v: string) => (v.trim() ? v.trim() : null);
function toRow(d: SongDetails) {
  return {
    title: d.title.trim(), artist_name: d.artistName.trim(), artist_id: d.artistId || null,
    featuring: nn(d.featuring), producer: nn(d.producer), composer: nn(d.composer), publisher: nn(d.publisher), genre: nn(d.genre),
    isrc: d.isrc ? d.isrc.toUpperCase().replace(/-/g, "").replace(/^(..)(...)(..)(.....)$/, "$1-$2-$3-$4") : null,
    upc: nn(d.upc), release_date: nn(d.releaseDate),
  };
}

function friendly(e: unknown, fallback: string): Error {
  const err = e as { code?: string; message?: string } | null;
  const msg = err?.message ?? "";
  if (err?.code === "23505" || /duplicate key/i.test(msg)) return new Error(/isrc/i.test(msg) ? "That ISRC is already registered to another song." : "This song is already registered.");
  if (err?.code === "23503" || /foreign key|still referenced/i.test(msg)) return new Error("This song already has airplay history, so it can't be deleted. Edit its details instead.");
  if (err?.code === "42501" || /row-level security|permission denied/i.test(msg)) return new Error("Your account isn't allowed to change this song.");
  return new Error(msg || fallback);
}

// ---------------------------------------------------------------------------
// Demo mode keeps songs in memory for the session.
let demoSongs: Song[] = [];
export function demoSeed(songs: Song[]) {
  if (!demoSongs.length) demoSongs = songs.map((s) => ({ ...s }));
}
export function demoList(): Song[] {
  return demoSongs.map((s) => ({ ...s }));
}

export async function createSong(owner: Owner, d: SongDetails): Promise<string> {
  const sb = db();
  if (!sb) {
    const id = `demo-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    demoSongs.unshift({ ...toSong({ id, title: d.title }), ...d, id });
    return id;
  }
  const own = owner.kind === "label" ? { label_org_id: owner.orgId } : { artist_profile_id: owner.userId };
  const res = await sb.from("recordings").insert({ ...toRow(d), ...own }).select("id").single();
  if (res.error) throw friendly(res.error, "Couldn't save the song.");
  return (res.data as { id: string }).id;
}

export async function updateSong(id: string, d: SongDetails): Promise<void> {
  const sb = db();
  if (!sb) {
    const s = demoSongs.find((x) => x.id === id);
    if (s) Object.assign(s, d);
    return;
  }
  const res = await sb.from("recordings").update(toRow(d)).eq("id", id).select("id");
  if (res.error) throw friendly(res.error, "Couldn't save the changes.");
  if (!res.data?.length) throw new Error("Your account isn't allowed to change this song.");
}

/** Upload (or replace) the reference audio; the worker re-learns the song. */
export async function attachReference(id: string, ref: { wav: Blob; durationSec: number; hash: string }): Promise<void> {
  const sb = db();
  const path = `${id}/reference.wav`;
  if (!sb) {
    const s = demoSongs.find((x) => x.id === id);
    if (s) Object.assign(s, { masterPath: path, durationSec: Math.round(ref.durationSec), enrolledAt: null, enrollError: null });
    return;
  }
  const up = await sb.storage.from("masters").upload(path, ref.wav, { upsert: true, contentType: "audio/wav", cacheControl: "0" });
  if (up.error) throw friendly(up.error, "Couldn't upload the audio.");
  must(
    await sb.from("recordings").update({
      master_path: path, duration_sec: Math.round(ref.durationSec), fingerprint: ref.hash, enrolled_at: null, enroll_error: null,
    }).eq("id", id).select("id"),
    "save audio",
  );
}

export async function deleteSong(song: Pick<Song, "id" | "masterPath">): Promise<void> {
  const sb = db();
  if (!sb) {
    demoSongs = demoSongs.filter((s) => s.id !== song.id);
    return;
  }
  const res = await sb.from("recordings").delete().eq("id", song.id).select("id");
  if (res.error) throw friendly(res.error, "Couldn't delete the song.");
  if (!res.data?.length) throw new Error("Your account isn't allowed to delete this song.");
  if (song.masterPath) await sb.storage.from("masters").remove([song.masterPath]); // best effort, row is gone
}
