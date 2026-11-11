"use client";

// Broadcaster data. RLS limits queries to stations owned by the caller's organisation.
import * as demo from "@/lib/data/broadcaster";
import { safeArray } from "@/lib/safe";
import { db, must, EAT } from "./core";
import type { StationRequestInput } from "@/lib/station-request";
import { validateStationRequest } from "@/lib/station-request";
import type { Mention, MentionStatus } from "@/lib/mentions";

export type SegmentKind = "music" | "ad" | "talk";
export type Segment = { start: number; end: number; kind: SegmentKind; label: string; composer?: string; publisher?: string; isrc?: string; evidencePath?: string | null };
export type AdLine = { id: string; advertiser: string; spot: string; booked: number; aired: number; daypart: string };
/** What the worker last said about this station's stream. */
export type Monitoring = {
  status: string;
  error: string | null;
  errorAt: string | null;
  heartbeatAt: string | null;
} | null;

export type BroadcasterData = {
  station: { name: string; licence: string; monitoring?: Monitoring } | null;
  date: string;
  segments: Segment[];
  ads: AdLine[];
};

/** Minutes after Kampala midnight for an ISO instant. */
function minuteOfDay(iso: string): number {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: EAT, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  return Number(p.find((x) => x.type === "hour")?.value ?? 0) * 60 + Number(p.find((x) => x.type === "minute")?.value ?? 0);
}

/** Music and ads come from detections/ad spots; the gaps between them are talk. */
function withTalk(items: Segment[]): Segment[] {
  const sorted = [...items].sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let t = 0;
  for (const s of sorted) {
    if (s.start > t + 1) out.push({ start: t, end: s.start, kind: "talk", label: "Talk / unmatched audio" });
    out.push(s);
    t = Math.max(t, s.end);
  }
  return out;
}

export async function loadBroadcaster(date: string): Promise<BroadcasterData> {
  const sb = db();
  if (!sb)
    return {
      station: { ...demo.STATION, monitoring: { status: "online", error: null, errorAt: null, heartbeatAt: new Date().toISOString() } },
      date,
      segments: demo.PLAYOUT,
      ads: demo.AD_BOOKINGS,
    };

  const stations = safeArray(must(
    await sb.from("stations").select("id, name, frequency, stream_status, stream_error, stream_error_at, last_heartbeat").order("name"),
    "stations",
  ) as {
    id: string; name: string; frequency: string | null; stream_status: string | null;
    stream_error: string | null; stream_error_at: string | null; last_heartbeat: string | null;
  }[]);
  const st = stations[0];
  if (!st) return { station: null, date, segments: [], ads: [] };

  const from = new Date(`${date}T00:00:00+03:00`).toISOString();
  const to = new Date(new Date(from).getTime() + 864e5).toISOString();
  const [dets, spots, bookings] = await Promise.all([
    sb.from("detections").select("detected_at, duration_sec, evidence_path, recordings(title, artist_name, isrc, composer, publisher)")
      .eq("station_id", st.id).gte("detected_at", from).lt("detected_at", to).order("detected_at").limit(2000),
    sb.from("ad_spots").select("aired_at, duration_sec, ad_bookings(advertiser, spot)").eq("station_id", st.id).gte("aired_at", from).lt("aired_at", to).limit(2000),
    sb.from("ad_bookings").select("id, advertiser, spot, daypart, booked, period_start, period_end").eq("station_id", st.id).lte("period_start", date).gte("period_end", date),
  ]);

  type Rec = { title: string; artist_name: string | null; isrc: string | null; composer: string | null; publisher: string | null };
  const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? x[0] ?? null : x);
  const music: Segment[] = safeArray(must(dets, "playout") as { detected_at: string; duration_sec: number | null; evidence_path: string | null; recordings: Rec | Rec[] | null }[]).map((d) => {
    const r = one(d.recordings);
    const start = minuteOfDay(d.detected_at);
    return {
      start, end: Math.min(1440, start + Math.max(1, Math.round((d.duration_sec ?? 180) / 60))), kind: "music",
      label: r ? `${r.title}${r.artist_name ? ` — ${r.artist_name}` : ""}` : "Matched recording",
      composer: r?.composer ?? "", publisher: r?.publisher ?? "", isrc: r?.isrc ?? "", evidencePath: d.evidence_path,
    };
  });
  const adSegs: Segment[] = safeArray(must(spots, "ad spots") as { aired_at: string; duration_sec: number; ad_bookings: { advertiser: string; spot: string } | { advertiser: string; spot: string }[] | null }[]).map((a) => {
    const b = one(a.ad_bookings);
    const start = minuteOfDay(a.aired_at);
    return { start, end: Math.min(1440, start + Math.max(1, Math.round(a.duration_sec / 60))), kind: "ad", label: b ? `${b.advertiser} · ${b.spot}` : "Unbooked ad" };
  });

  // Aired = spots linked to each booking across its whole period.
  const bRows = safeArray(must(bookings, "bookings") as { id: string; advertiser: string; spot: string; daypart: string | null; booked: number; period_start: string; period_end: string }[]);
  const aired = await Promise.all(bRows.map((b) => sb.from("ad_spots").select("id", { count: "exact", head: true }).eq("booking_id", b.id)));

  return {
    station: {
      name: `${st.name}${st.frequency ? ` · ${st.frequency} FM` : ""}`,
      licence: "",
      monitoring: {
        status: st.stream_status ?? "starting",
        error: st.stream_error,
        errorAt: st.stream_error_at,
        heartbeatAt: st.last_heartbeat,
      },
    },
    date,
    segments: withTalk([...music, ...adSegs]),
    ads: bRows.map((b, i) => ({ id: b.id, advertiser: b.advertiser, spot: b.spot, booked: b.booked, aired: aired[i].count ?? 0, daypart: b.daypart ?? "All day" })),
  };
}

// ── Brand mentions on this broadcaster's own stations (read-only) ───────────

export async function loadStationMentions(days = 7): Promise<Mention[]> {
  const sb = db();
  if (!sb) {
    return [
      { id: "m1", station: "Your station", brand: "MTN", heard: "mtn", transcript: "This hour is brought to you by MTN Uganda, everywhere you go.", heardAt: new Date(Date.now() - 36e5).toISOString(), score: 100, status: "confirmed", evidencePath: null },
      { id: "m2", station: "Your station", brand: "Stanbic Bank", heard: "stambic bank", transcript: "And remember, Stambic Bank, Uganda, it can be.", heardAt: new Date(Date.now() - 72e5).toISOString(), score: 86, status: "unreviewed", evidencePath: null },
    ];
  }
  const since = new Date(Date.now() - days * 864e5).toISOString();
  type Row = { id: number; brand: string; heard: string; transcript: string; heard_at: string; score: number | null; status: MentionStatus; evidence_path: string | null; stations: { name: string } | { name: string }[] | null };
  const rows = must(await sb.from("mentions").select("id, brand, heard, transcript, heard_at, score, status, evidence_path, stations(name)")
    .gte("heard_at", since).order("heard_at", { ascending: false }).limit(500), "brand mentions") as Row[];
  return safeArray(rows).map((m) => ({
    id: String(m.id), station: (Array.isArray(m.stations) ? m.stations[0]?.name : m.stations?.name) ?? "—",
    brand: m.brand, heard: m.heard, transcript: m.transcript, heardAt: m.heard_at, score: Number(m.score ?? 0),
    status: m.status, evidencePath: m.evidence_path,
  }));
}


// ── Station onboarding ─────────────────────────────────────────────────────
//
// A broadcaster sees only its own organisation's station (RLS). When nothing is
// linked yet, they can claim an unclaimed station from the panel or add a new
// one; approval stays with a CMO, because linking an organisation to a station
// decides whose playout data that organisation can read.

export type ClaimableStation = { id: string; name: string; region: string | null; frequency: string | null; kind: string };
export type StationRequestRow = {
  id: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  kind: string;
  name: string | null;
  frequency: string | null;
  region: string | null;
  streamUrl: string | null;
  note: string | null;
  createdAt: string;
  reviewNote: string | null;
};

const DEMO_CLAIMABLE: ClaimableStation[] = [
  { id: "demo-1", name: "Next Radio", region: "Central", frequency: "106.1", kind: "radio" },
  { id: "demo-2", name: "Pearl FM", region: "Central", frequency: "107.9", kind: "radio" },
  { id: "demo-3", name: "Radio Pacis", region: "Northern", frequency: "90.9", kind: "radio" },
];

let demoRequests: StationRequestRow[] = [];

export async function loadStationSetup(): Promise<{
  live: boolean;
  requests: StationRequestRow[];
  claimable: ClaimableStation[];
}> {
  const sb = db();
  if (!sb) return { live: false, requests: demoRequests.map((r) => ({ ...r })), claimable: DEMO_CLAIMABLE };

  const [req, claim] = await Promise.all([
    sb
      .from("station_requests")
      .select("id, status, kind, name, frequency, region, stream_url, note, created_at, review_note")
      .order("created_at", { ascending: false })
      .limit(20),
    sb.rpc("claimable_stations"),
  ]);

  type Row = {
    id: string; status: StationRequestRow["status"]; kind: string; name: string | null; frequency: string | null;
    region: string | null; stream_url: string | null; note: string | null; created_at: string; review_note: string | null;
  };
  return {
    live: true,
    requests: safeArray(must(req, "station requests") as Row[]).map((r) => ({
      id: r.id, status: r.status, kind: r.kind, name: r.name, frequency: r.frequency, region: r.region,
      streamUrl: r.stream_url, note: r.note, createdAt: String(r.created_at ?? "").slice(0, 10), reviewNote: r.review_note,
    })),
    claimable: safeArray((claim.data ?? []) as ClaimableStation[]),
  };
}

export async function submitStationRequest(input: StationRequestInput): Promise<{ reference: string }> {
  const check = validateStationRequest(input);
  if (!check.ok) {
    const first = Object.values(check.errors)[0] ?? "Check the form.";
    throw new Error(first);
  }
  const sb = db();
  if (!sb) {
    // Demo mode keeps the request in memory so the flow can be walked through.
    const ref = `DEMO-${String(demoRequests.length + 1).padStart(3, "0")}`;
    demoRequests = [
      {
        id: ref,
        status: "pending",
        kind: String(check.payload.kind ?? "radio"),
        name: (check.payload.name as string) ?? DEMO_CLAIMABLE.find((s) => s.id === input.stationId)?.name ?? null,
        frequency: (check.payload.frequency as string) ?? null,
        region: (check.payload.region as string) ?? null,
        streamUrl: (check.payload.stream_url as string) ?? null,
        note: (check.payload.note as string) ?? null,
        createdAt: new Date().toISOString().slice(0, 10),
        reviewNote: null,
      },
      ...demoRequests,
    ];
    return { reference: ref };
  }

  const { data: user } = await sb.auth.getUser();
  if (!user.user) throw new Error("Sign in again — the session expired.");
  const { data: profile } = await sb.from("profiles").select("org_id").eq("id", user.user.id).single();
  const orgId = (profile as { org_id: string | null } | null)?.org_id ?? null;

  const { error } = await sb.from("station_requests").insert({
    profile_id: user.user.id,
    org_id: orgId,
    ...check.payload,
  });
  if (error) throw new Error(error.message);
  return { reference: "submitted" };
}

export async function cancelStationRequest(id: string): Promise<void> {
  const sb = db();
  if (!sb) {
    demoRequests = demoRequests.map((r) => (r.id === id ? { ...r, status: "cancelled" } : r));
    return;
  }
  must(await sb.from("station_requests").update({ status: "cancelled" }).eq("id", id).select("id"), "cancel request");
}
