/** Audiomack public catalogue only; OAuth 1.0a consumer-signed, never user secrets or audio. */
import { createHmac, randomBytes } from "node:crypto";
import type { LinkResult, LinkSong } from "@/lib/links/resolve";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
export type AudiomackCredentials = { key: string; secret: string };

const encode = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** RFC 5849 HMAC-SHA1 signature; only GETs without query parameters are supported. */
export function audiomackAuthorization(url: string, creds: AudiomackCredentials, timestamp: string, nonce: string): string {
  const params: Record<string, string> = {
    oauth_consumer_key: creds.key, oauth_nonce: nonce, oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp, oauth_version: "1.0",
  };
  const normalized = Object.entries(params).map(([k, v]) => [encode(k), encode(v)])
    .sort(([ak, av], [bk, bv]) => ak < bk ? -1 : ak > bk ? 1 : av < bv ? -1 : av > bv ? 1 : 0)
    .map(([k, v]) => `${k}=${v}`).join("&");
  const base = ["GET", encode(url), encode(normalized)].join("&");
  const signature = createHmac("sha1", `${encode(creds.secret)}&`).update(base).digest("base64");
  return `OAuth ${Object.entries({ ...params, oauth_signature: signature }).map(([k, v]) => `${encode(k)}="${encode(v)}"`).join(", ")}`;
}

/** Accept only documented Audiomack URL forms; build the API URL ourselves. */
export function audiomackPath(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || !["audiomack.com", "www.audiomack.com"].includes(u.hostname.toLowerCase()) || u.port || u.username || u.password) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length !== 3 || !parts.every((p) => /^[a-z0-9_-]{1,120}$/i.test(p))) return null;
    let type: string, artist: string, slug: string;
    if (parts[1] === "song" || parts[1] === "album") [artist, type, slug] = parts;
    else if (parts[0] === "song" || parts[0] === "album") [type, artist, slug] = parts;
    else return null;
    return `/v1/music/${type}/${encode(artist)}/${encode(slug)}`;
  } catch { return null; }
}

type Item = { title?: unknown; artist?: unknown; featuring?: unknown; type?: unknown; tracks?: unknown };
function song(item: Item): LinkSong | null {
  if (typeof item.title !== "string" || typeof item.artist !== "string" || !item.title.trim() || !item.artist.trim()) return null;
  const featuring = typeof item.featuring === "string"
    ? item.featuring.split(/\s*(?:,|&|\band\b)\s*/i).map((n) => n.trim().slice(0, 120)).filter(Boolean).slice(0, 12)
    : [];
  return { title: item.title.trim().slice(0, 200), artistName: item.artist.trim().slice(0, 120), featured: featuring,
    isrc: "", upc: "", releaseDate: "", label: "", genre: "", durationSec: null, artwork: null, matchedOn: "source-only" };
}

export async function resolveAudiomack(raw: string, creds: AudiomackCredentials, fetcher: Fetcher = fetch): Promise<LinkResult> {
  const path = audiomackPath(raw);
  if (!path) return { url: raw, ok: false, error: "Use a full Audiomack song or album link." };
  const url = `https://api.audiomack.com${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const authorization = audiomackAuthorization(url, creds, String(Math.floor(Date.now() / 1000)), randomBytes(16).toString("hex"));
    const r = await fetcher(url, { headers: { authorization, accept: "application/json" }, signal: controller.signal, redirect: "error", cache: "no-store" });
    if (!r.ok) return { url: raw, ok: false, error: "Audiomack couldn't provide these details. Check the link or enter the song manually." };
    const body = await r.json() as { results?: unknown } & Item;
    const data = body?.results && typeof body.results === "object" && !Array.isArray(body.results) ? body.results as Item : body;
    const isAlbum = path.startsWith("/v1/music/album/");
    if (isAlbum && Array.isArray(data?.tracks) && data.tracks.length > 40)
      return { url: raw, ok: false, error: "This album has more than 40 tracks. Add songs individually." };
    const items = isAlbum ? (Array.isArray(data?.tracks) ? data.tracks : []) : [data];
    const songs = items.flatMap((x: unknown) => {
      if (!x || typeof x !== "object" || Array.isArray(x)) return [];
      const s = song(x as Item);
      return s ? [s] : [];
    });
    if (isAlbum && songs.length !== items.length) return { url: raw, ok: false, error: "Audiomack returned incomplete album details. Add songs individually or enter details manually." };
    if (!songs.length) return { url: raw, ok: false, error: isAlbum ? "Audiomack didn't provide album tracks. Add songs individually or enter details manually." : "Audiomack didn't provide this song's details. Enter them manually." };
    return { url: raw, ok: true, platform: "Audiomack API", songs };
  } catch {
    return { url: raw, ok: false, error: "Audiomack couldn't provide these details. Try again or enter the song manually." };
  } finally { clearTimeout(timer); }
}
