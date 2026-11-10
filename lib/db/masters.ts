"use client";

// Songs (recordings) and their reference audio, shared by the label and
// artist dashboards. RLS decides ownership: a label edits its organisation's
// songs, an independent artist edits their own self-released songs.
import { db, must } from "./core";
import { safeArray } from "@/lib/safe";

export type SongDetails = {
  title: string;
  artistName: string;
  /** Label roster artist; null for artists who upload their own songs. */
  artistId: string | null;
  /** Every writer, in the order they should be credited on the cue sheet. */
  songwriters: string[];
  /** Performers credited as "feat." — as many as the song really has. */
  featured: string[];
  producer: string;
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
  /** The old single-text columns, joined for cue sheets and CSV exports. */
  composer: string;
  featuring: string;
};

/** A song has a handful of writers, not a spreadsheet. */
export const MAX_CREDITS = 12;

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

/** Trim, drop blanks, drop repeats (case-insensitively), cap the list. */
export function cleanNames(list: readonly string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of safeArray(list)) {
    const name = String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= MAX_CREDITS) break;
  }
  return out;
}

/** Names → the single line the cue sheet and CSV exports read. */
export function creditLine(list: readonly string[] | null | undefined): string {
  return cleanNames(list).join("; ");
}

/** The old free-text field → names. "A, B & C" is three people, not one. */
export function parseCreditLine(text: string | null | undefined): string[] {
  return cleanNames(
    String(text ?? "")
      .replace(/\s+(?:feat\.?|ft\.|featuring)\s+/gi, ";")
      .split(/\s*(?:;|,|&|\/|\band\b)\s*/i),
  );
}

export function toSong(r: Partial<Row> & { id: string; title: string }, credits?: { songwriters?: string[]; featured?: string[] }): Song {
  const songwriters = credits?.songwriters ?? parseCreditLine(r.composer);
  const featured = credits?.featured ?? parseCreditLine(r.featuring);
  return {
    id: r.id, title: r.title, artistName: r.artist_name ?? "", artistId: r.artist_id ?? null,
    songwriters, featured, producer: r.producer ?? "", publisher: r.publisher ?? "",
    genre: r.genre ?? "", isrc: r.isrc ?? "", upc: r.upc ?? "", releaseDate: r.release_date ?? "",
    durationSec: r.duration_sec ?? null, masterPath: r.master_path ?? null, enrolledAt: r.enrolled_at ?? null, enrollError: r.enroll_error ?? null,
    composer: creditLine(songwriters), featuring: creditLine(featured),
  };
}

export function emptyDetails(over: Partial<SongDetails> = {}): SongDetails {
  return { title: "", artistName: "", artistId: null, songwriters: [], featured: [], producer: "", publisher: "", genre: "", isrc: "", upc: "", releaseDate: "", ...over };
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
    featuring: nn(creditLine(d.featured)), producer: nn(d.producer), composer: nn(creditLine(d.songwriters)),
    publisher: nn(d.publisher), genre: nn(d.genre),
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

/** Credits for a set of songs, keyed by recording id. Missing table or a
 *  failed read is not an error: the joined text columns still describe the
 *  song, and that is what the cue sheet prints until this answers. */
export type CreditMap = Map<string, { songwriters: string[]; featured: string[] }>;

export async function creditsFor(ids: readonly string[]): Promise<CreditMap> {
  const out: CreditMap = new Map();
  const sb = db();
  const list = safeArray(ids).filter(Boolean).slice(0, 500);
  if (!sb || !list.length) return out;
  try {
    const { data, error } = await sb
      .from("recording_credits")
      .select("recording_id, role, name, position")
      .in("recording_id", list)
      .order("position", { ascending: true });
    if (error || !Array.isArray(data)) return out;
    for (const row of data as { recording_id: string; role: string; name: string }[]) {
      const entry = out.get(row.recording_id) ?? { songwriters: [], featured: [] };
      if (row.role === "songwriter") entry.songwriters.push(row.name);
      else if (row.role === "featured") entry.featured.push(row.name);
      out.set(row.recording_id, entry);
    }
    return out;
  } catch {
    return out;
  }
}

/** Replace a song's credits. Silent when the table is not deployed yet. */
async function writeCredits(id: string, d: SongDetails, mode: "replace" | "append"): Promise<void> {
  const sb = db();
  if (!sb) return;
  const rows = [
    ...cleanNames(d.songwriters).map((name, i) => ({ recording_id: id, role: "songwriter", name, position: i })),
    ...cleanNames(d.featured).map((name, i) => ({ recording_id: id, role: "featured", name, position: i })),
  ];
  try {
    if (mode === "replace") {
      const del = await sb.from("recording_credits").delete().eq("recording_id", id);
      if (del.error && del.error.code !== "42P01") throw del.error;
    }
    if (!rows.length) return;
    const ins = await sb.from("recording_credits").insert(rows);
    if (ins.error && ins.error.code !== "42P01") throw friendly(ins.error, "Couldn't save the writing credits.");
  } catch (e) {
    // The song itself is saved with the joined text columns, so a credit-table
    // problem must not lose the upload — but it should not pass silently either.
    throw e instanceof Error && /duplicate/i.test(e.message) ? new Error("The same writer is listed twice.") : e;
  }
}

export async function createSong(owner: Owner, d: SongDetails): Promise<string> {
  const sb = db();
  const clean: SongDetails = { ...d, songwriters: cleanNames(d.songwriters), featured: cleanNames(d.featured) };
  if (!sb) {
    const id = `demo-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    demoSongs.unshift({
      ...toSong({ id, title: clean.title }),
      ...clean,
      id,
      composer: creditLine(clean.songwriters),
      featuring: creditLine(clean.featured),
    });
    return id;
  }
  const own = owner.kind === "label" ? { label_org_id: owner.orgId } : { artist_profile_id: owner.userId };
  const res = await sb.from("recordings").insert({ ...toRow(clean), ...own }).select("id").single();
  if (res.error) throw friendly(res.error, "Couldn't save the song.");
  const id = (res.data as { id: string }).id;
  await writeCredits(id, clean, "replace");
  return id;
}

export async function updateSong(id: string, d: SongDetails): Promise<void> {
  const sb = db();
  const cleaned: SongDetails = { ...d, songwriters: cleanNames(d.songwriters), featured: cleanNames(d.featured) };
  if (!sb) {
    const s = demoSongs.find((x) => x.id === id);
    if (s) Object.assign(s, cleaned, { composer: creditLine(cleaned.songwriters), featuring: creditLine(cleaned.featured) });
    return;
  }
  const clean: SongDetails = { ...d, songwriters: cleanNames(d.songwriters), featured: cleanNames(d.featured) };
  const res = await sb.from("recordings").update(toRow(clean)).eq("id", id).select("id");
  if (res.error) throw friendly(res.error, "Couldn't save the changes.");
  if (!res.data?.length) throw new Error("Your account isn't allowed to change this song.");
  await writeCredits(id, clean, "replace");
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

/** True when this UPC is already on a song by a different main artist (any account).
 *  A UPC is one release, so that usually means a typo or a copied code — unless
 *  it's a compilation. Advisory only: never blocks a save. */
export async function upcConflict(upc: string, artistName: string, excludeId?: string | null): Promise<boolean> {
  if (!UPC_RE.test(upc) || !artistName.trim()) return false;
  const sb = db();
  const norm = (v: string) => v.trim().toLowerCase();
  if (!sb) return demoSongs.some((x) => x.upc === upc && x.id !== excludeId && norm(x.artistName) !== norm(artistName));
  const { data, error } = await sb.rpc("upc_used_by_other_artist", { p_upc: upc, p_artist: artistName.trim(), p_exclude: excludeId ?? null });
  if (error) return false; // a failed check must not get in the way of saving
  return data === true;
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
