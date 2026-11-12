/**
 * Turn a music link into song details (title, artist, ISRC, UPC, …).
 *
 * Labels add whole catalogues at once, and typing every ISRC by hand is where
 * mistakes come from. A link already knows the answers:
 *
 *  1. Read the link's own platform for title, artists and length
 *     (Deezer API · Spotify embed data · Apple iTunes lookup · YouTube oEmbed ·
 *     the page's Open Graph tags for Audiomack / Boomplay).
 *  2. Find the same recording on Deezer — its public API carries the ISRC, and the
 *     album carries UPC, label, genre and release date — matching on title,
 *     artist and length so a remix or live version is not mistaken for the song.
 *
 * Only details are fetched. Audio is never downloaded from any platform: the
 * artist attaches their own file, which is what East Sound fingerprints.
 *
 * Server-side only. Hosts are allow-listed so this cannot be used to fetch
 * arbitrary URLs from our servers.
 */

export type LinkSong = {
  title: string;
  artistName: string;
  featured: string[];
  isrc: string;
  upc: string;
  releaseDate: string; // YYYY-MM-DD or ""
  /** Record label as printed on the release. Not the music publisher, so never shown as one on a cue sheet. */
  label: string;
  genre: string;
  durationSec: number | null;
  artwork: string | null;
  /** Where the codes came from, so the form can say "check these". */
  matchedOn: "deezer" | "source-only";
};

export type LinkResult = { url: string; ok: true; platform: string; songs: LinkSong[] } | { url: string; ok: false; error: string };

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

const ALLOWED = [
  "open.spotify.com", "spotify.link",
  "music.apple.com", "itunes.apple.com",
  "www.deezer.com", "deezer.com", "link.deezer.com", "deezer.page.link",
  "www.youtube.com", "youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be",
  "audiomack.com", "www.audiomack.com",
  "www.boomplay.com", "boomplay.com", "boomplay.page.link",
];
const SHORTENERS = new Set(["spotify.link", "link.deezer.com", "deezer.page.link", "boomplay.page.link"]);
const MAX_ALBUM_TRACKS = 40;
const UA = "Mozilla/5.0 (compatible; EastSoundBot/1.0; +https://eastsound.vercel.app)";

export function parseLink(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return ALLOWED.includes(u.hostname.toLowerCase()) ? u : null;
  } catch {
    return null;
  }
}

export function platformOf(u: URL): string {
  const h = u.hostname;
  if (h.includes("spotify")) return "Spotify";
  if (h.includes("apple")) return "Apple Music";
  if (h.includes("deezer")) return "Deezer";
  if (h.includes("youtu")) return "YouTube";
  if (h.includes("audiomack")) return "Audiomack";
  if (h.includes("boomplay")) return "Boomplay";
  return h;
}

// ---- text helpers ------------------------------------------------------------

const VERSION_WORDS = /\b(remix|live|acoustic|instrumental|edit|version|mix|sped up|slowed|karaoke|cover)\b/i;

/** "Song (feat. X) [Official Video]" → "song" — for comparing, never for display. */
export function normTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/\((?:feat|ft|featuring)\.?[^)]*\)|\[(?:feat|ft|featuring)\.?[^\]]*\]/g, "")
    .replace(/\s(?:feat|ft|featuring)\.?\s.*$/g, "")
    .replace(/\((?:official|lyric|audio|video|visuali[sz]er)[^)]*\)|\[(?:official|lyric|audio|video|visuali[sz]er)[^\]]*\]/g, "")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const normName = (s: string) => normTitle(s).replace(/\b(the|official|music|vevo|topic)\b/g, "").replace(/\s+/g, " ").trim();

/** "Artist - Song (Official Video)" (YouTube, Boomplay) → parts. */
export function splitArtistTitle(s: string, fallbackArtist = ""): { artist: string; title: string } {
  const clean = s.replace(/\s*[([](?:official|lyric|audio|video|visuali[sz]er|hd|4k)[^)\]]*[)\]]/gi, "").trim();
  const m = clean.match(/^(.+?)\s+[-–—|]\s+(.+)$/);
  if (m) return { artist: m[1].trim(), title: m[2].trim() };
  const by = clean.match(/^(.+?)\s+by\s+(.+)$/i);
  if (by) return { artist: by[2].trim(), title: by[1].trim() };
  return { artist: fallbackArtist.replace(/\s*-\s*Topic$/i, "").replace(/VEVO$/i, "").trim(), title: clean };
}

/** Featured artists written into a title: "Song (feat. A & B)". */
export function featuredFromTitle(title: string): string[] {
  const m = title.match(/(?:\(|\[|\s)(?:feat|ft|featuring)\.?\s+([^)\]]+)/i);
  if (!m) return [];
  return m[1].split(/\s*(?:,|&| x | and )\s*/i).map((x) => x.trim()).filter(Boolean);
}

const isoDate = (s: unknown) => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "");

// ---- fetching ----------------------------------------------------------------

async function get(fetcher: Fetcher, url: string, accept = "application/json"): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    return await fetcher(url, { headers: { "user-agent": UA, accept }, signal: ctrl.signal, redirect: "follow", cache: "no-store" });
  } finally {
    clearTimeout(t);
  }
}

async function getJson<T>(fetcher: Fetcher, url: string): Promise<T | null> {
  try {
    const r = await get(fetcher, url);
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

async function getText(fetcher: Fetcher, url: string): Promise<string | null> {
  try {
    const r = await get(fetcher, url, "text/html");
    if (!r.ok) return null;
    // A page is not trusted beyond its allow-listed host: refuse redirects elsewhere.
    if (r.url && !parseLink(r.url)) return null;
    return await r.text();
  } catch {
    return null;
  }
}

/** Short links (spotify.link, deezer.page.link) → the real allow-listed URL. */
async function expand(fetcher: Fetcher, u: URL): Promise<URL | null> {
  if (!SHORTENERS.has(u.hostname)) return u;
  try {
    const r = await get(fetcher, u.toString(), "text/html");
    const final = r.url ? parseLink(r.url) : null;
    if (final && !SHORTENERS.has(final.hostname)) return final;
    const html = await r.text();
    const m = html.match(/https:\/\/(?:open\.spotify\.com|www\.deezer\.com|www\.boomplay\.com)\/[^"'<\s]+/);
    return m ? parseLink(m[0]) : null;
  } catch {
    return null;
  }
}

// ---- Deezer --------------------------------------------------------------------

type DzTrack = {
  id: number; title: string; title_short?: string; isrc?: string; duration?: number; release_date?: string;
  artist?: { name: string }; contributors?: { name: string; role?: string }[]; album?: { id: number; cover_xl?: string; cover_big?: string };
  error?: unknown;
};
type DzAlbum = {
  id: number; title: string; upc?: string; label?: string; release_date?: string; cover_xl?: string; cover_big?: string;
  genres?: { data?: { name: string }[] }; artist?: { name: string }; error?: unknown;
};

const DZ = "https://api.deezer.com";

async function deezerSong(fetcher: Fetcher, trackId: number | string, albumCache: Map<number, DzAlbum | null>): Promise<LinkSong | null> {
  const t = await getJson<DzTrack>(fetcher, `${DZ}/track/${trackId}`);
  if (!t || t.error || !t.title) return null;
  let album: DzAlbum | null = null;
  if (t.album?.id) {
    if (!albumCache.has(t.album.id)) albumCache.set(t.album.id, await getJson<DzAlbum>(fetcher, `${DZ}/album/${t.album.id}`));
    album = albumCache.get(t.album.id) ?? null;
    if (album?.error) album = null;
  }
  const main = t.artist?.name ?? "";
  const featured = Array.from(new Set([
    ...(t.contributors ?? []).filter((c) => c.name && c.name !== main && /feat/i.test(c.role ?? "")).map((c) => c.name),
    ...featuredFromTitle(t.title),
  ])).filter((n) => n.toLowerCase() !== main.toLowerCase());
  return {
    title: (t.title_short || t.title).trim(),
    artistName: main,
    featured,
    isrc: (t.isrc ?? "").toUpperCase(),
    upc: album?.upc ?? "",
    releaseDate: isoDate(album?.release_date) || isoDate(t.release_date),
    label: album?.label ?? "",
    genre: album?.genres?.data?.[0]?.name ?? "",
    durationSec: t.duration ?? null,
    artwork: album?.cover_xl ?? album?.cover_big ?? t.album?.cover_xl ?? null,
    matchedOn: "deezer",
  };
}

type DzSearchHit = { id: number; title: string; title_short?: string; duration?: number; artist?: { name: string } };

/**
 * Best Deezer match for a song seen elsewhere. Title and artist must agree, and
 * when the source gave a length, it must be within 4 seconds — that is what keeps
 * a remix, live take or radio edit from taking the original's ISRC.
 */
export function pickMatch(hits: DzSearchHit[], want: { title: string; artist: string; durationSec: number | null }): DzSearchHit | null {
  const wt = normTitle(want.title);
  const wa = normName(want.artist);
  const wantsVersion = VERSION_WORDS.test(want.title);
  let best: { hit: DzSearchHit; score: number } | null = null;
  for (const h of hits) {
    const ht = normTitle(h.title_short || h.title);
    const ha = normName(h.artist?.name ?? "");
    if (!wantsVersion && VERSION_WORDS.test(h.title)) continue;
    const titleOk = ht === wt || (ht.length > 3 && (ht.startsWith(wt) || wt.startsWith(ht)));
    const artistOk = !wa || ha === wa || ha.includes(wa) || wa.includes(ha);
    if (!titleOk || !artistOk) continue;
    const diff = want.durationSec && h.duration ? Math.abs(want.durationSec - h.duration) : null;
    if (diff != null && diff > 4) continue;
    const score = (ht === wt ? 2 : 1) + (ha === wa ? 2 : 0) + (diff == null ? 0 : diff <= 1 ? 2 : 1);
    if (!best || score > best.score) best = { hit: h, score };
  }
  return best?.hit ?? null;
}

async function viaDeezerSearch(fetcher: Fetcher, base: Omit<LinkSong, "matchedOn">, albumCache: Map<number, DzAlbum | null>): Promise<LinkSong> {
  const q = `${base.artistName} ${base.title}`.trim();
  const res = await getJson<{ data?: DzSearchHit[] }>(fetcher, `${DZ}/search?q=${encodeURIComponent(q)}&limit=25`);
  const hit = pickMatch(res?.data ?? [], { title: base.title, artist: base.artistName, durationSec: base.durationSec });
  if (hit) {
    const full = await deezerSong(fetcher, hit.id, albumCache);
    if (full) {
      // Keep the source's own spelling of title/artist; take codes and label from Deezer.
      return {
        ...full,
        title: base.title || full.title,
        artistName: base.artistName || full.artistName,
        featured: Array.from(new Set([...base.featured, ...full.featured])),
        releaseDate: full.releaseDate || base.releaseDate,
        artwork: base.artwork ?? full.artwork,
      };
    }
  }
  return { ...base, matchedOn: "source-only" };
}

// ---- per-platform readers --------------------------------------------------------

type Seed = Omit<LinkSong, "matchedOn">;
const seed = (p: Partial<Seed> & { title: string; artistName: string }): Seed => ({
  featured: featuredFromTitle(p.title), isrc: "", upc: "", releaseDate: "", label: "", genre: "", durationSec: null, artwork: null, ...p,
});

type SpotifyEntity = {
  type?: string; title?: string; name?: string; artists?: { name: string }[]; subtitle?: string;
  duration?: number; releaseDate?: { isoString?: string }; trackList?: { title: string; subtitle?: string; duration?: number }[];
  visualIdentity?: { image?: { url: string }[] };
};

async function spotify(fetcher: Fetcher, u: URL): Promise<Seed[]> {
  const m = u.pathname.match(/\/(track|album)\/([A-Za-z0-9]{10,})/);
  if (!m) throw new Error("Use a Spotify song or album link.");
  const html = await getText(fetcher, `https://open.spotify.com/embed/${m[1]}/${m[2]}`);
  const data = html?.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
  const ent: SpotifyEntity | undefined = data ? JSON.parse(data)?.props?.pageProps?.state?.data?.entity : undefined;
  if (!ent) throw new Error("Spotify didn't share this song's details.");
  const art = ent.visualIdentity?.image?.slice(-1)[0]?.url ?? null;
  const date = isoDate(ent.releaseDate?.isoString);
  if (m[1] === "album") {
    return (ent.trackList ?? []).slice(0, MAX_ALBUM_TRACKS).map((t) =>
      seed({ title: t.title, artistName: (t.subtitle ?? ent.subtitle ?? "").split(/,\s*/)[0] ?? "", durationSec: t.duration ? Math.round(t.duration / 1000) : null, releaseDate: date, artwork: art }));
  }
  const artists = (ent.artists ?? []).map((a) => a.name);
  const title = ent.title ?? ent.name ?? "";
  return [seed({ title, artistName: artists[0] ?? "", featured: Array.from(new Set([...artists.slice(1), ...featuredFromTitle(title)])), durationSec: ent.duration ? Math.round(ent.duration / 1000) : null, releaseDate: date, artwork: art })];
}

type ItunesItem = { wrapperType?: string; kind?: string; trackName?: string; artistName?: string; collectionName?: string; releaseDate?: string; primaryGenreName?: string; trackTimeMillis?: number; artworkUrl100?: string; copyright?: string };

async function apple(fetcher: Fetcher, u: URL): Promise<Seed[]> {
  const trackId = u.searchParams.get("i") ?? u.pathname.match(/\/song\/[^/]*\/?(\d+)/)?.[1];
  const albumId = u.pathname.match(/\/album\/[^/]*\/?(\d+)/)?.[1];
  const id = trackId ?? albumId;
  if (!id) throw new Error("Use an Apple Music song or album link.");
  const country = u.pathname.match(/^\/([a-z]{2})\//)?.[1] ?? "us";
  const r = await getJson<{ results?: ItunesItem[] }>(fetcher, `https://itunes.apple.com/lookup?id=${id}&entity=song&country=${country}&limit=${MAX_ALBUM_TRACKS + 1}`);
  const items = (r?.results ?? []).filter((x) => x.wrapperType === "track" && x.kind === "song");
  const pick = trackId ? items.filter((_, i) => i === 0) : items.slice(0, MAX_ALBUM_TRACKS);
  if (!pick.length) throw new Error("Apple Music didn't share this song's details.");
  return pick.map((x) => seed({
    title: x.trackName ?? "", artistName: x.artistName ?? "", releaseDate: isoDate(x.releaseDate), genre: x.primaryGenreName ?? "",
    durationSec: x.trackTimeMillis ? Math.round(x.trackTimeMillis / 1000) : null, artwork: x.artworkUrl100?.replace("100x100", "600x600") ?? null,
  }));
}

async function youtube(fetcher: Fetcher, u: URL): Promise<Seed[]> {
  const o = await getJson<{ title?: string; author_name?: string; thumbnail_url?: string }>(fetcher, `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(u.toString())}`);
  if (!o?.title) throw new Error("YouTube didn't share this video's details.");
  const { artist, title } = splitArtistTitle(o.title, o.author_name ?? "");
  return [seed({ title, artistName: artist, artwork: o.thumbnail_url ?? null })];
}

function meta(html: string, key: string): string {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key.replace(/[.:]/g, "\\$&")}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${key.replace(/[.:]/g, "\\$&")}["']`, "i");
  const m = html.match(re);
  return (m?.[1] ?? m?.[2] ?? "").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').trim();
}

async function openGraph(fetcher: Fetcher, u: URL): Promise<Seed[]> {
  const html = await getText(fetcher, u.toString());
  if (!html) throw new Error(`${platformOf(u)} didn't share this song's details.`);
  const title = meta(html, "og:title");
  if (!title) throw new Error(`${platformOf(u)} didn't share this song's details.`);
  const musician = meta(html, "music:musician_description") || meta(html, "twitter:audio:artist_name");
  const parsed = musician ? { artist: musician, title } : splitArtistTitle(title);
  return [seed({ title: parsed.title.replace(/\s*\|\s*(Audiomack|Boomplay).*$/i, ""), artistName: parsed.artist, artwork: meta(html, "og:image") || null })];
}

// ---- entry point -------------------------------------------------------------------

export async function resolveLink(raw: string, fetcher: Fetcher = fetch): Promise<LinkResult> {
  const first = parseLink(raw);
  if (!first) return { url: raw, ok: false, error: "Use a link from Spotify, Apple Music, Deezer, YouTube, Audiomack or Boomplay." };
  const u = await expand(fetcher, first);
  if (!u) return { url: raw, ok: false, error: "Couldn't open this short link. Paste the full song link instead." };
  const platform = platformOf(u);
  const albumCache = new Map<number, DzAlbum | null>();
  try {
    if (platform === "Deezer") {
      const m = u.pathname.match(/\/(track|album)\/(\d+)/);
      if (!m) throw new Error("Use a Deezer song or album link.");
      if (m[1] === "track") {
        const s = await deezerSong(fetcher, m[2], albumCache);
        if (!s) throw new Error("Deezer didn't find this song.");
        return { url: raw, ok: true, platform, songs: [s] };
      }
      const tracks = await getJson<{ data?: { id: number }[] }>(fetcher, `${DZ}/album/${m[2]}/tracks?limit=${MAX_ALBUM_TRACKS}`);
      const songs = (await Promise.all((tracks?.data ?? []).slice(0, MAX_ALBUM_TRACKS).map((t) => deezerSong(fetcher, t.id, albumCache)))).filter((s): s is LinkSong => Boolean(s));
      if (!songs.length) throw new Error("Deezer didn't find this album.");
      return { url: raw, ok: true, platform, songs };
    }
    const seeds =
      platform === "Spotify" ? await spotify(fetcher, u)
      : platform === "Apple Music" ? await apple(fetcher, u)
      : platform === "YouTube" ? await youtube(fetcher, u)
      : await openGraph(fetcher, u);
    const songs: LinkSong[] = [];
    for (const s of seeds) songs.push(await viaDeezerSearch(fetcher, s, albumCache)); // sequential: polite to Deezer
    return { url: raw, ok: true, platform, songs };
  } catch (e) {
    return { url: raw, ok: false, error: e instanceof Error ? e.message : "Couldn't read this link." };
  }
}
