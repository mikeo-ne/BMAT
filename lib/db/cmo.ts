"use client";

// CMO / Auditor data. RLS gives an approved CMO workspace-wide reads.
import * as demo from "@/lib/data/cmo";
import { safeArray } from "@/lib/safe";
import { buildMonthlyPack, monthRange, type MonthlyPack } from "@/lib/cmo-report";
import { db, must } from "./core";
import type { Mention, MentionStatus, TrackedBrand } from "@/lib/mentions";

export type WorkStatus = "Registered" | "Pending" | "Conflict";
export type Work = { id: string; title: string; artist: string; owner: string; isrc: string; status: WorkStatus };
export type ChartEntry = { rank: number; title: string; owner: string; spins: number; stations: number };
export type DisputeStatus = "open" | "resolved_a" | "resolved_b" | "resolved_split" | "escalated";
export type Dispute = {
  id: string; work: string; claimantA: string; claimantB: string; shareA: number; shareB: number;
  spinsAtStake: number; opened: string; status: DisputeStatus;
};
export type UnmatchedClip = { id: string; station: string; heardAt: string; evidencePath: string | null; seed: number };
export type CmoData = {
  stats: { detections24h: number; matchedRate: number; openDisputes: number; unmatched: number };
  registry: Work[];
  top100: ChartEntry[];
  regions: string[];
  heatmap: number[][][]; // [region][day 0=Mon][4-hour block]
  disputes: Dispute[];
  unmatched: UnmatchedClip[];
  works: { id: string; title: string }[];
};

export const REGIONS = ["Central", "Western", "Eastern", "Northern"];

function demoData(): CmoData {
  const statusMap: Record<string, DisputeStatus> = { Open: "open", "Resolved: A": "resolved_a", "Resolved: B": "resolved_b", "Resolved: Split": "resolved_split", Escalated: "escalated" };
  return {
    stats: { detections24h: demo.CMO_STATS.detections24h, matchedRate: demo.CMO_STATS.matchedRate, openDisputes: demo.DISPUTES.length, unmatched: demo.UNMATCHED.length },
    registry: demo.REGISTRY.map((w) => ({ id: w.id, title: w.title, artist: "—", owner: w.owner, isrc: w.isrc, status: w.status })),
    top100: demo.TOP100.map((t) => ({ rank: t.rank, title: t.title, owner: t.owner, spins: t.spins, stations: t.stations })),
    regions: REGIONS,
    heatmap: demo.HEATMAP,
    disputes: demo.DISPUTES.map((d) => ({ ...d, status: statusMap[d.status] ?? "open" })),
    unmatched: demo.UNMATCHED.map((u) => ({ id: u.id, station: u.station, heardAt: u.heardAt, evidencePath: null, seed: u.seed })),
    works: demo.REGISTRY.map((w) => ({ id: w.id, title: w.title })),
  };
}

export async function loadCmo(): Promise<CmoData> {
  const sb = db();
  if (!sb) return demoData();
  const since24 = new Date(Date.now() - 864e5).toISOString();

  const [recs, orgs, disputes, unmatched, chart, heat, det24, unm24, spins] = await Promise.all([
    sb.from("recordings").select("id, title, artist_name, isrc, label_org_id").order("title").limit(2000),
    sb.from("organizations").select("id, name"),
    sb.from("disputes").select("id, recording_id, claimant_a, claimant_b, share_a, share_b, status, opened_at").order("opened_at", { ascending: false }),
    sb.from("unmatched_clips").select("id, heard_at, evidence_path, station_id, stations(name)").eq("status", "open").order("heard_at", { ascending: false }).limit(100),
    sb.rpc("top_chart", { p_days: 7, p_region: null, p_limit: 100 }),
    sb.rpc("detection_heatmap", { p_days: 7 }),
    sb.from("detections").select("id", { count: "exact", head: true }).gte("detected_at", since24),
    sb.from("unmatched_clips").select("id", { count: "exact", head: true }).gte("heard_at", since24),
    sb.rpc("recording_spins", { p_days: 30 }),
  ]);

  const orgName = new Map(safeArray(must(orgs, "organisations") as { id: string; name: string }[]).map((o) => [o.id, o.name]));
  const recRows = safeArray(must(recs, "recordings") as { id: string; title: string; artist_name: string | null; isrc: string | null; label_org_id: string | null }[]);
  const dispRows = safeArray(must(disputes, "disputes") as {
    id: string; recording_id: string; claimant_a: string | null; claimant_b: string | null; share_a: number | null; share_b: number | null; status: DisputeStatus; opened_at: string;
  }[]);
  const spinRows = new Map(safeArray(must(spins, "spins") as { recording_id: string; spins: number }[]).map((s) => [s.recording_id, Number(s.spins)]));
  const conflict = new Set(dispRows.filter((d) => d.status === "open").map((d) => d.recording_id));
  const title = new Map(recRows.map((r) => [r.id, r.title]));

  const heatmap = REGIONS.map(() => Array.from({ length: 7 }, () => Array(6).fill(0)));
  for (const h of safeArray(must(heat, "heatmap") as { region: string; dow: number; block: number; detections: number }[])) {
    const ri = REGIONS.indexOf(h.region);
    if (ri >= 0 && h.dow >= 1 && h.dow <= 7 && h.block >= 0 && h.block < 6) heatmap[ri][h.dow - 1][h.block] = Number(h.detections);
  }

  const d24 = det24.count ?? 0;
  const u24 = unm24.count ?? 0;
  return {
    stats: {
      detections24h: d24,
      matchedRate: d24 + u24 ? Math.round((d24 / (d24 + u24)) * 1000) / 10 : 100,
      openDisputes: dispRows.filter((d) => d.status === "open").length,
      unmatched: safeArray(unmatched.data).length,
    },
    registry: recRows.map((r) => ({
      id: r.id,
      title: r.title,
      artist: r.artist_name ?? "—",
      owner: r.label_org_id ? orgName.get(r.label_org_id) ?? "—" : "Independent",
      isrc: r.isrc ?? "",
      status: conflict.has(r.id) ? "Conflict" : r.isrc ? "Registered" : "Pending",
    })),
    top100: safeArray(must(chart, "chart") as { rank: number; title: string; owner: string | null; spins: number; stations: number }[]).map((c) => ({
      rank: Number(c.rank), title: c.title, owner: c.owner ?? "Independent", spins: Number(c.spins), stations: Number(c.stations),
    })),
    regions: REGIONS,
    heatmap,
    disputes: dispRows.map((d) => ({
      id: d.id,
      work: title.get(d.recording_id) ?? "Unknown work",
      claimantA: (d.claimant_a && orgName.get(d.claimant_a)) || "—",
      claimantB: (d.claimant_b && orgName.get(d.claimant_b)) || "—",
      shareA: Number(d.share_a ?? 0),
      shareB: Number(d.share_b ?? 0),
      spinsAtStake: spinRows.get(d.recording_id) ?? 0,
      opened: d.opened_at.slice(0, 10),
      status: d.status,
    })),
    unmatched: safeArray(must(unmatched, "unmatched") as { id: number; heard_at: string; evidence_path: string | null; stations: { name: string } | { name: string }[] | null }[]).map((u, i) => ({
      id: String(u.id),
      station: (Array.isArray(u.stations) ? u.stations[0]?.name : u.stations?.name) ?? "—",
      heardAt: u.heard_at,
      evidencePath: u.evidence_path,
      seed: 900 + i,
    })),
    works: recRows.map((r) => ({ id: r.id, title: r.title })),
  };
}

// ── Monthly distribution pack (per-station report + top works) ─────────────

const SAMPLE_STATIONS: [string, string, number, number, number][] = [
  // station, region, plays, works, artists
  ["Capital FM", "Central", 2841, 412, 148],
  ["CBS FM", "Central", 2610, 398, 141],
  ["Galaxy FM", "Central", 2104, 366, 132],
  ["Radio Simba", "Central", 1873, 341, 124],
  ["Sanyu FM", "Central", 1642, 322, 118],
  ["Pearl FM", "Eastern", 1188, 274, 101],
  ["Jinja FM", "Eastern", 903, 231, 88],
  ["Mbale Times", "Eastern", 742, 198, 74],
  ["Voice of Toro", "Western", 688, 187, 71],
  ["Hope Radio", "Western", 512, 164, 63],
  ["Radio Gulu", "Northern", 431, 142, 57],
  ["Radio Lira", "Northern", 296, 118, 48],
];

function demoPack(month: string): MonthlyPack {
  const offset = monthRange(month).days % 7;
  const stations = SAMPLE_STATIONS.map(([station, region, plays, works, artists], i) => {
    const spins = Math.max(0, plays - offset * (i % 3) * 12);
    return {
      station_id: `demo-${i}`,
      station,
      region,
      spins,
      works,
      artists,
      with_evidence: Math.round(spins * 0.97),
      first_play: `${month}-02T05:14:00Z`,
      last_play: `${month}-27T22:41:00Z`,
      kind: i % 7 === 6 ? "tv" : "radio",
      // Audience figures are sample values, and labelled as such in the UI.
      aqh: i < 6 ? [18_000, 15_400, 12_900, 9_800, 8_200, 4_100][i] : null,
      listen_seconds: spins * 198,
    };
  });
  const works = demo.TOP100.slice(0, 20).map((w) => ({
    rank: w.rank,
    title: w.title,
    artist: w.owner,
    owner: w.owner,
    spins: w.spins,
    stations: w.stations,
  }));
  return buildMonthlyPack(stations, works, month, false);
}

/**
 * The rows behind the CMO's monthly report. The two RPCs are SECURITY INVOKER,
 * so a CMO sees the whole panel and a label sees only its own catalogue —
 * exactly what the dashboard shows, no wider.
 */
export async function loadMonthlyPack(month: string): Promise<MonthlyPack> {
  const range = monthRange(month);
  const sb = db();
  if (!sb) return demoPack(month);
  const [stations, works] = await Promise.all([
    sb.rpc("station_month_report", { p_from: range.from, p_to: range.to }),
    sb.rpc("month_top_works", { p_from: range.from, p_to: range.to, p_limit: 20 }),
  ]);
  return buildMonthlyPack(must(stations, "station report"), must(works, "month top works"), month, true);
}

// ── Plan requests (self-serve upgrades waiting to be billed) ───────────────

export type PlanRequestRow = {
  id: string; reference: string; plan: string; billing: string; amountUgx: number;
  msisdn: string | null; status: string; created: string; note: string | null;
};

const DEMO_PLAN_REQUESTS: PlanRequestRow[] = [
  { id: "p1", reference: "ES-ART-7KQ4MP", plan: "artist", billing: "monthly", amountUgx: 35_000, msisdn: "+256772000111", status: "pending", created: "2026-11-08", note: "Catalogue of 12 songs" },
  { id: "p2", reference: "ES-LAB-3XF9RT", plan: "label", billing: "annual", amountUgx: 2_500_000, msisdn: "+256701000222", status: "contacted", created: "2026-11-05", note: null },
];

export async function loadPlanRequests(): Promise<{ rows: PlanRequestRow[]; live: boolean }> {
  const sb = db();
  if (!sb) return { rows: DEMO_PLAN_REQUESTS, live: false };
  const { data } = await sb
    .from("plan_requests")
    .select("id, reference, plan, billing, amount_ugx, msisdn, status, created_at, note")
    .order("created_at", { ascending: false })
    .limit(100);
  type Row = { id: string; reference: string; plan: string; billing: string; amount_ugx: number; msisdn: string | null; status: string; created_at: string; note: string | null };
  return {
    live: true,
    rows: safeArray(data as Row[]).map((r) => ({
      id: r.id, reference: r.reference, plan: r.plan, billing: r.billing,
      amountUgx: Number(r.amount_ugx ?? 0), msisdn: r.msisdn, status: r.status,
      created: String(r.created_at ?? "").slice(0, 10), note: r.note,
    })),
  };
}

export async function resolveDispute(id: string, status: DisputeStatus): Promise<void> {
  const sb = db();
  if (!sb) return;
  const { data: u } = await sb.auth.getUser();
  must(await sb.from("disputes").update({ status, resolved_at: new Date().toISOString(), resolved_by: u.user?.id ?? null }).eq("id", id).select("id"), "resolve dispute");
}

export async function resolveUnmatched(id: string, recordingId: string | null): Promise<void> {
  const sb = db();
  if (!sb) return;
  const { data: u } = await sb.auth.getUser();
  must(await sb.from("unmatched_clips").update({
    status: recordingId ? "matched" : "discarded",
    matched_recording_id: recordingId,
    resolved_by: u.user?.id ?? null,
    resolved_at: new Date().toISOString(),
  }).eq("id", Number(id)).select("id"), "update clip");
}

// ── Brand mentions (spoken on air) ──────────────────────────────────────────

export type MentionsData = { mentions: Mention[]; brands: TrackedBrand[] };

let demoBrands: TrackedBrand[] | null = null;
let demoMentions: Mention[] | null = null;
function demoMentionStore() {
  demoBrands ??= [
    { id: "b1", brand: "MTN", terms: ["mtn", "m t n"], aliases: ["mt and"], active: true },
    { id: "b2", brand: "Airtel", terms: ["airtel", "air tel"], aliases: [], active: true },
    { id: "b3", brand: "Stanbic Bank", terms: ["stanbic", "stanbic bank"], aliases: [], active: true },
    { id: "b4", brand: "Nile Special", terms: ["nile special"], aliases: [], active: true },
  ];
  demoMentions ??= [
    { id: "m1", station: "Capital FM", brand: "MTN", heard: "mtn", transcript: "This hour is brought to you by MTN Uganda, everywhere you go.", heardAt: new Date(Date.now() - 36e5).toISOString(), score: 100, status: "unreviewed", evidencePath: null },
    { id: "m2", station: "CBS FM", brand: "Stanbic Bank", heard: "stambic bank", transcript: "And remember, Stambic Bank, Uganda, it can be.", heardAt: new Date(Date.now() - 72e5).toISOString(), score: 86, status: "unreviewed", evidencePath: null },
    { id: "m3", station: "Capital FM", brand: "Airtel", heard: "airtel", transcript: "Airtel gives you more data this weekend.", heardAt: new Date(Date.now() - 108e5).toISOString(), score: 100, status: "confirmed", evidencePath: null },
  ];
  return { brands: demoBrands, mentions: demoMentions };
}

export async function loadMentions(days = 7): Promise<MentionsData> {
  const sb = db();
  if (!sb) {
    const st = demoMentionStore();
    return { brands: st.brands.map((b) => ({ ...b })), mentions: st.mentions.map((m) => ({ ...m })) };
  }
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const [ms, ks] = await Promise.all([
    sb.from("mentions").select("id, brand, heard, transcript, heard_at, score, status, evidence_path, stations(name)")
      .gte("heard_at", since).order("heard_at", { ascending: false }).limit(500),
    sb.from("tracked_keywords").select("id, brand, terms, aliases, active").order("brand"),
  ]);
  type Row = { id: number; brand: string; heard: string; transcript: string; heard_at: string; score: number | null; status: MentionStatus; evidence_path: string | null; stations: { name: string } | { name: string }[] | null };
  return {
    mentions: safeArray(must(ms, "mentions") as Row[]).map((m) => ({
      id: String(m.id), station: (Array.isArray(m.stations) ? m.stations[0]?.name : m.stations?.name) ?? "—",
      brand: m.brand, heard: m.heard, transcript: m.transcript, heardAt: m.heard_at, score: Number(m.score ?? 0),
      status: m.status, evidencePath: m.evidence_path,
    })),
    brands: safeArray(must(ks, "tracked brands") as TrackedBrand[]).map((b) => ({ ...b, terms: safeArray(b.terms), aliases: safeArray(b.aliases) })),
  };
}

export async function reviewMention(id: string, status: MentionStatus, learn?: { brandId: string; alias: string; aliases: string[] }): Promise<void> {
  const sb = db();
  if (!sb) {
    const st = demoMentionStore();
    const m = st.mentions.find((x) => x.id === id);
    if (m) m.status = status;
    const b = learn && st.brands.find((x) => x.id === learn.brandId);
    if (b && learn && !b.aliases.includes(learn.alias)) b.aliases.push(learn.alias);
    return;
  }
  const { data: u } = await sb.auth.getUser();
  must(await sb.from("mentions").update({ status, reviewed_by: u.user?.id ?? null, reviewed_at: new Date().toISOString() }).eq("id", Number(id)).select("id"), "review mention");
  if (learn && !learn.aliases.includes(learn.alias)) {
    must(await sb.from("tracked_keywords").update({ aliases: [...learn.aliases, learn.alias].slice(-50) }).eq("id", learn.brandId).select("id"), "learn alias");
  }
}

export async function addTrackedBrand(brand: string, terms: string[]): Promise<void> {
  const name = brand.trim();
  if (!name || !terms.length) throw new Error("Give the brand a name and at least one way it is said.");
  const sb = db();
  if (!sb) {
    const st = demoMentionStore();
    if (st.brands.some((b) => b.brand.toLowerCase() === name.toLowerCase())) throw new Error(`${name} is already tracked.`);
    st.brands.push({ id: `demo-${Date.now()}`, brand: name, terms, aliases: [], active: true });
    return;
  }
  const res = await sb.from("tracked_keywords").insert({ brand: name, terms }).select("id");
  if (res.error?.code === "23505") throw new Error(`${name} is already tracked.`);
  must(res, "add brand");
}

export async function setBrandActive(id: string, active: boolean): Promise<void> {
  const sb = db();
  if (!sb) {
    const b = demoMentionStore().brands.find((x) => x.id === id);
    if (b) b.active = active;
    return;
  }
  must(await sb.from("tracked_keywords").update({ active }).eq("id", id).select("id"), "update brand");
}
