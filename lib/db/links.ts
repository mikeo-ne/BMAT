"use client";

import { getSupabaseBrowser } from "@/lib/supabase/client";
import { normTitle, type LinkResult, type LinkSong } from "@/lib/links/resolve";

export type { LinkResult, LinkSong };

/** Split a pasted block into links: one per line, or separated by spaces/commas. */
export function splitLinks(text: string): string[] {
  return Array.from(new Set(text.split(/[\s,]+/).map((s) => s.trim()).filter((s) => /^https?:\/\//i.test(s))));
}

export async function songsFromLinks(urls: string[]): Promise<LinkResult[]> {
  const sb = getSupabaseBrowser();
  if (!sb) return urls.map(demoResult);
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in again to add songs from links.");
  const res = await fetch("/api/songs/from-links", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ urls }),
  });
  const body = (await res.json().catch(() => ({}))) as { results?: LinkResult[]; error?: string };
  if (!res.ok) throw new Error(body.error ?? "Couldn't read those links.");
  return body.results ?? [];
}

/**
 * Which waiting song does this audio file belong to? Compares the title guessed
 * from the file name with each song's title. Returns the index, or -1.
 */
export function matchFileToSong(fileTitle: string, songTitles: string[]): number {
  const f = normTitle(fileTitle);
  if (!f) return -1;
  let idx = songTitles.findIndex((t) => normTitle(t) === f);
  if (idx >= 0) return idx;
  idx = songTitles.findIndex((t) => {
    const n = normTitle(t);
    return n.length >= 4 && (f.includes(n) || n.includes(f));
  });
  return idx;
}

// Demo mode: a believable result without calling any catalogue.
function demoResult(url: string, i: number): LinkResult {
  if (!/spotify|apple|deezer|youtu|audiomack|boomplay/i.test(url)) {
    return { url, ok: false, error: "Use a link from Spotify, Apple Music, Deezer, YouTube, Audiomack or Boomplay." };
  }
  const songs: LinkSong[] = [{
    title: ["Kampala Nights", "Omukwano", "Rwenzori Rain"][i % 3], artistName: "Lamaro Grace", featured: i % 3 === 1 ? ["Kato Brian"] : [],
    isrc: `UG-A1B-26-0001${i}`, upc: "196000000017", releaseDate: "2026-10-01", label: "Pearl Sound Records", genre: "Afrobeats",
    durationSec: 214, artwork: null, matchedOn: "deezer",
  }];
  return { url, ok: true, platform: "Spotify", songs };
}
