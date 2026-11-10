/**
 * CMO monthly distribution pack.
 *
 * A CMO does not distribute money from a dashboard — it distributes from a
 * document it can file and defend, and from a data feed its own systems can
 * import. Both start here, as pure functions over rows the caller's RLS
 * already permitted, so the PDF, the CSV and the JSON feed can never disagree.
 */

export type StationMonthRow = {
  stationId: string;
  station: string;
  region: string;
  spins: number;
  works: number;
  artists: number;
  withEvidence: number;
  firstPlay: string | null;
  lastPlay: string | null;
  kind: "radio" | "tv";
  aqh: number | null;
  listenSeconds: number;
};

export type TopWorkRow = {
  rank: number;
  title: string;
  artist: string;
  owner: string;
  spins: number;
  stations: number;
};

export type MonthlyPack = {
  month: string; // YYYY-MM
  label: string; // November 2026
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD (last day of month)
  live: boolean; // false = sample data
  stations: StationMonthRow[];
  topWorks: TopWorkRow[];
  totals: { spins: number; works: number; artists: number; stations: number; evidence: number };
};

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const KAMPALA = "Africa/Kampala";

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) && x >= 0 ? x : 0;
};

/** Current month in Kampala — the timezone the station logs are filed in. */
export function monthKey(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: KAMPALA,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(at);
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

export type MonthRange = { month: string; label: string; from: string; to: string; days: number };

/** Inclusive date range for a month key, with the label the report prints. */
export function monthRange(month: string): MonthRange {
  const m = MONTH_RE.exec(month);
  if (!m) throw new Error("Month must look like 2026-11.");
  const year = Number(m[1]);
  const mon = Number(m[2]);
  const days = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const label = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, mon - 1, 1)));
  return {
    month,
    label,
    from: `${month}-01`,
    to: `${month}-${String(days).padStart(2, "0")}`,
    days,
  };
}

/** Newest first, including the current month: ["2026-11", "2026-10", …]. */
export function recentMonths(count = 6, at: Date = new Date()): string[] {
  const key = monthKey(at);
  const [y, m] = key.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < Math.max(1, count); i += 1) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** Database rows → pack. Unknown shapes collapse to an empty, honest pack. */
export function buildMonthlyPack(
  stationRows: unknown,
  topWorkRows: unknown,
  month: string,
  live: boolean,
): MonthlyPack {
  const range = monthRange(month);
  const stations = (Array.isArray(stationRows) ? stationRows : [])
    .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object")
    .map((r) => ({
      stationId: String(r.station_id ?? ""),
      station: String(r.station ?? "Station"),
      region: String(r.region ?? "—"),
      spins: n(r.spins),
      works: n(r.works),
      artists: n(r.artists),
      withEvidence: n(r.with_evidence),
      firstPlay: typeof r.first_play === "string" ? r.first_play : null,
      lastPlay: typeof r.last_play === "string" ? r.last_play : null,
      kind: r.kind === "tv" ? ("tv" as const) : ("radio" as const),
      aqh: r.aqh === null || r.aqh === undefined || r.aqh === "" ? null : n(r.aqh),
      listenSeconds: n(r.listen_seconds),
    }))
    .sort((a, b) => b.spins - a.spins || a.station.localeCompare(b.station));

  const topWorks = (Array.isArray(topWorkRows) ? topWorkRows : [])
    .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object")
    .map((r, i) => ({
      rank: n(r.rank) || i + 1,
      title: String(r.title ?? "—"),
      artist: String(r.artist ?? "—"),
      owner: String(r.owner ?? "Independent"),
      spins: n(r.spins),
      stations: n(r.stations),
    }));

  return {
    month,
    label: range.label,
    from: range.from,
    to: range.to,
    live,
    stations,
    topWorks,
    totals: {
      spins: stations.reduce((sum, s) => sum + s.spins, 0),
      works: stations.reduce((sum, s) => sum + s.works, 0),
      artists: stations.reduce((sum, s) => sum + s.artists, 0),
      stations: stations.length,
      evidence: stations.reduce((sum, s) => sum + s.withEvidence, 0),
    },
  };
}

/** Share of plays carrying a 10-second clip, 0–100. */
export function evidenceShare(pack: Pick<MonthlyPack, "totals">): number {
  return pack.totals.spins ? Math.round((pack.totals.evidence / pack.totals.spins) * 100) : 0;
}

export const STATION_HEADERS = ["Station", "Region", "Plays", "Works", "Artists", "With evidence", "First play", "Last play"] as const;
export const WORK_HEADERS = ["#", "Title", "Artist", "Rights owner", "Plays", "Stations"] as const;

export function stationCsvRows(pack: MonthlyPack): string[][] {
  return pack.stations.map((s) => [
    s.station,
    s.region,
    String(s.spins),
    String(s.works),
    String(s.artists),
    String(s.withEvidence),
    s.firstPlay ? s.firstPlay.slice(0, 10) : "—",
    s.lastPlay ? s.lastPlay.slice(0, 10) : "—",
  ]);
}

export function workCsvRows(pack: MonthlyPack): string[][] {
  return pack.topWorks.map((w) => [String(w.rank), w.title, w.artist, w.owner, String(w.spins), String(w.stations)]);
}

/** `east-sound-station-report-2026-11.pdf` */
export function packFilename(month: string, ext: "pdf" | "csv" | "json"): string {
  const safe = MONTH_RE.test(month) ? month : monthKey();
  return `east-sound-station-report-${safe}.${ext}`;
}

// ── Read-only feed ─────────────────────────────────────────────────────────

export type FeedQuery = { month: string; from: string; to: string; format: "json" | "csv"; station: string | null; limit: number };

export const FEED_MAX_ROWS = 50_000;
export const FEED_DEFAULT_ROWS = 10_000;

/**
 * The public contract of `/api/feed/airplay`. Kept pure so the route, the docs
 * and the tests all read the same rules.
 */
export function parseFeedQuery(params: URLSearchParams, at: Date = new Date()): { ok: true; query: FeedQuery } | { ok: false; error: string } {
  const month = (params.get("month") || "").trim() || monthKey(at);
  if (!MONTH_RE.test(month)) return { ok: false, error: "month must look like 2026-11" };
  const format = ((params.get("format") || "json").trim().toLowerCase() === "csv" ? "csv" : "json") as "json" | "csv";
  const station = (params.get("station") || "").trim() || null;
  if (station && station.length > 120) return { ok: false, error: "station is too long" };
  const rawLimit = Number(params.get("limit"));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), FEED_MAX_ROWS) : FEED_DEFAULT_ROWS;
  const range = monthRange(month);
  return { ok: true, query: { month, from: range.from, to: range.to, format, station, limit } };
}

export const FEED_HEADERS = [
  "detected_at",
  "station",
  "region",
  "source",
  "title",
  "artist",
  "isrc",
  "confidence",
  "duration_sec",
  "evidence_path",
] as const;

export type FeedRow = {
  detected_at: string;
  station: string | null;
  region: string | null;
  source: string | null;
  title: string | null;
  artist: string | null;
  isrc: string | null;
  confidence: number | null;
  duration_sec: number | null;
  evidence_path: string | null;
};

/** Supabase's nested select returns `stations`/`recordings` as object or array. */
export function toFeedRow(raw: unknown): FeedRow {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const one = <T>(v: unknown): T | null => (Array.isArray(v) ? ((v[0] as T) ?? null) : ((v as T) ?? null));
  const st = one<{ name?: string; region?: string }>(r.stations);
  const rec = one<{ title?: string; artist_name?: string; isrc?: string }>(r.recordings);
  return {
    detected_at: String(r.detected_at ?? ""),
    station: st?.name ?? null,
    region: st?.region ?? null,
    source: r.source ? String(r.source) : null,
    title: rec?.title ?? (r.matched_title ? String(r.matched_title) : null),
    artist: rec?.artist_name ?? (r.matched_artist ? String(r.matched_artist) : null),
    isrc: rec?.isrc ?? null,
    confidence: r.confidence === null || r.confidence === undefined ? null : Number(r.confidence),
    duration_sec: r.duration_sec === null || r.duration_sec === undefined ? null : Number(r.duration_sec),
    evidence_path: r.evidence_path ? String(r.evidence_path) : null,
  };
}
