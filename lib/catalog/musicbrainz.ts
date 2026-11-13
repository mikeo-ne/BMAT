/** MusicBrainz ISRC candidates, server-side only. Does not assert ownership. */
export type MusicBrainzCandidate = {
  id: string;
  title: string;
  artistName: string;
  artists: string[];
  isrc: string;
};

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
export const normalizeIsrc = (s: string) => s.trim().toUpperCase().replace(/-/g, "");
export const validIsrc = (s: string) => /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(s);

/** Only known fields are returned: no work credits, artwork, ownership or dates are inferred. */
export async function lookupMusicBrainz(isrc: string, userAgent: string, fetcher: Fetcher = fetch): Promise<MusicBrainzCandidate[]> {
  if (!validIsrc(isrc)) throw new Error("Enter a valid 12-character ISRC.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetcher(`https://musicbrainz.org/ws/2/isrc/${isrc}?inc=artist-credits&fmt=json`, {
      headers: { "user-agent": userAgent, accept: "application/json" },
      signal: controller.signal, redirect: "error", cache: "no-store",
    });
    if (res.status === 404) return [];
    if (res.status === 429 || res.status === 503) throw new Error("MusicBrainz is busy. Please try again later.");
    if (!res.ok) throw new Error("MusicBrainz couldn't complete the lookup. Try again later.");
    const body = await res.json() as { recordings?: unknown };
    if (!Array.isArray(body.recordings)) throw new Error("MusicBrainz returned an unexpected response.");
    return body.recordings.slice(0, 20).flatMap((item: unknown) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const r = item as { id?: unknown; title?: unknown; "artist-credit"?: unknown };
      if (typeof r.id !== "string" || typeof r.title !== "string" || !r.title.trim()) return [];
      const credits = Array.isArray(r["artist-credit"]) ? r["artist-credit"] : [];
      const artists = credits.flatMap((c: { name?: unknown; artist?: { name?: unknown } }) => {
        const n = c?.name ?? c?.artist?.name;
        return typeof n === "string" && n.trim() ? [n.trim().slice(0, 120)] : [];
      }).slice(0, 12);
      if (!artists.length) return [];
      return [{ id: r.id, title: r.title.trim().slice(0, 200), artistName: artists[0], artists, isrc }];
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw new Error("MusicBrainz timed out. Try again later.");
    if (err instanceof Error && err.message.startsWith("MusicBrainz")) throw err;
    throw new Error("MusicBrainz couldn't complete the lookup. Try again later.");
  } finally {
    clearTimeout(timer);
  }
}
