"use client";

// Airplay insights and shareable proof-of-play links for artists and labels.
// Live: one RPC (artist_airplay_insights) scoped to the caller's own songs.
// Demo: a fixed sample so the panel can be explored without an account.
import { safeArray } from "@/lib/safe";
import { db, must } from "./core";

export type StationPlays = { name: string; region: string | null; plays: number; last_play: string };
export type RecentPlay = {
  id: number; title: string; artist?: string | null; station: string | null; frequency: string | null;
  detected_at: string; duration_sec: number | null; evidence_path: string | null; share_token: string | null;
};
export type Insights = {
  days: number;
  plays: number;
  stationsPlaying: number;
  stationsMonitored: number;
  byStation: StationPlays[];
  notPlaying: { name: string; region: string }[];
  byHour: number[];
  byWeekday: number[];
  recent: RecentPlay[];
  demo: boolean;
};

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const pad = (a: unknown, len: number) => {
  const out = safeArray<number>(a as number[]).map(n);
  while (out.length < len) out.push(0);
  return out.slice(0, len);
};

export function parseInsights(raw: Record<string, unknown> | null, demo = false): Insights {
  const r = raw ?? {};
  return {
    days: n(r.days) || 30,
    plays: n(r.plays),
    stationsPlaying: n(r.stations_playing),
    stationsMonitored: n(r.stations_monitored),
    byStation: safeArray<StationPlays>(r.by_station as StationPlays[]).map((s) => ({ ...s, plays: n(s.plays) })),
    notPlaying: safeArray<{ name: string; region: string }>(r.not_playing as { name: string; region: string }[]),
    byHour: pad(r.by_hour, 24),
    byWeekday: pad(r.by_weekday, 7),
    recent: safeArray<RecentPlay>(r.recent as RecentPlay[]),
    demo,
  };
}

/** Hours (Kampala time) with the most plays, best first, ignoring empty hours. */
export function peakHours(byHour: number[], top = 3): number[] {
  return byHour
    .map((v, h) => ({ v, h }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v || a.h - b.h)
    .slice(0, top)
    .map((x) => x.h);
}

export const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** Group station names by region, regions in a fixed order. */
export function byRegion(list: { name: string; region: string }[]): [string, string[]][] {
  const order = ["Central", "Eastern", "Northern", "Western"];
  const m = new Map<string, string[]>();
  for (const s of list) {
    const k = s.region || "Other";
    m.set(k, [...(m.get(k) ?? []), s.name]);
  }
  return [...m.entries()].sort((a, b) => {
    const ia = order.indexOf(a[0]);
    const ib = order.indexOf(b[0]);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a[0].localeCompare(b[0]);
  });
}

export async function loadInsights(days = 30): Promise<Insights> {
  const sb = db();
  if (!sb) return demoInsights(days);
  const res = await sb.rpc("artist_airplay_insights", { p_days: days });
  return parseInsights(must(res, "airplay insights") as Record<string, unknown>);
}

export function proofLink(token: string, origin = typeof window !== "undefined" ? window.location.origin : "") {
  return `${origin}/proof/${token}`;
}

/** Publish one play as a link anyone can open. Returns the token. */
export async function shareDetection(id: number): Promise<string> {
  const sb = db();
  if (!sb) return demoToken(id);
  return String(must(await sb.rpc("share_detection", { p_id: id }), "share link"));
}

export async function unshareDetection(id: number): Promise<void> {
  const sb = db();
  if (!sb) return;
  must(await sb.rpc("unshare_detection", { p_id: id }), "share link");
}

export type Proof = {
  title: string; artist: string; featuring: string | null; isrc: string | null;
  station: string | null; frequency: string | null; region: string | null;
  detected_at: string; duration_sec: number | null; confidence: number | null; evidence_path: string | null;
};

export async function loadProof(token: string): Promise<Proof | null> {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const sb = db();
  if (!sb) return token === DEMO_TOKEN ? DEMO_PROOF : null;
  const d = must(await sb.rpc("proof_by_token", { p_token: token }), "proof") as Proof | null | unknown[];
  return d && !Array.isArray(d) ? (d as Proof) : null;
}

// ---- demo sample -------------------------------------------------------

export const DEMO_TOKEN = "d3e0c1a5b7f94e2a8c6d0b1f2e3a4c5d";
const demoToken = (_id: number) => DEMO_TOKEN;

const DEMO_PROOF: Proof = {
  title: "Kampala Nights", artist: "Lamaro Grace", featuring: null, isrc: "UG-A1B-26-00012",
  station: "Capital FM", frequency: "91.3", region: "Central",
  detected_at: "2026-11-11T16:42:10Z", duration_sec: 214, confidence: 96.4, evidence_path: null,
};

function demoInsights(days: number): Insights {
  const at = (d: number, h: number, m: number) => new Date(Date.UTC(2026, 10, 11 - d, h - 3, m)).toISOString();
  return parseInsights({
    days, plays: 47, stations_playing: 9, stations_monitored: 25,
    by_station: [
      { name: "Capital FM", region: "Central", plays: 11, last_play: at(0, 19, 42) },
      { name: "Galaxy FM", region: "Central", plays: 9, last_play: at(0, 17, 5) },
      { name: "NBS Radio (Next Radio)", region: "Central", plays: 7, last_play: at(1, 21, 15) },
      { name: "Busoga One FM", region: "Eastern", plays: 6, last_play: at(1, 8, 30) },
      { name: "Radio Simba", region: "Central", plays: 5, last_play: at(2, 13, 10) },
      { name: "Crooze FM", region: "Western", plays: 4, last_play: at(2, 20, 2) },
      { name: "Akaboozi FM", region: "Central", plays: 3, last_play: at(4, 11, 47) },
      { name: "Bugwere FM", region: "Eastern", plays: 1, last_play: at(6, 9, 21) },
      { name: "Radio Pacis", region: "Northern", plays: 1, last_play: at(9, 18, 33) },
    ],
    not_playing: [
      { name: "Sanyu FM", region: "Central" }, { name: "Radio One", region: "Central" }, { name: "Beat FM", region: "Central" },
      { name: "Pearl FM", region: "Central" }, { name: "NRG Radio", region: "Central" }, { name: "Bukedde FM", region: "Central" },
      { name: "Kfm", region: "Central" }, { name: "Radio 4", region: "Central" }, { name: "Open Gate FM", region: "Eastern" },
      { name: "Voice of Toro", region: "Western" },
    ],
    by_hour: [0, 0, 0, 0, 0, 1, 2, 3, 4, 2, 1, 2, 3, 2, 1, 1, 2, 4, 5, 6, 4, 3, 1, 0],
    by_weekday: [5, 6, 7, 6, 9, 8, 6],
    recent: [
      { id: 9001, title: "Kampala Nights", artist: "Lamaro Grace", station: "Capital FM", frequency: "91.3", detected_at: at(0, 19, 42), duration_sec: 214, evidence_path: null, share_token: null },
      { id: 9002, title: "Kampala Nights", artist: "Lamaro Grace", station: "Galaxy FM", frequency: "100.2", detected_at: at(0, 17, 5), duration_sec: 198, evidence_path: null, share_token: null },
      { id: 9003, title: "Omukwano", artist: "Kato Brian", station: "Busoga One FM", frequency: "90.6", detected_at: at(1, 8, 30), duration_sec: 187, evidence_path: null, share_token: null },
      { id: 9004, title: "Kampala Nights", artist: "Lamaro Grace", station: "NBS Radio (Next Radio)", frequency: "96.6", detected_at: at(1, 21, 15), duration_sec: 205, evidence_path: null, share_token: null },
      { id: 9005, title: "Omukwano", artist: "Kato Brian", station: "Crooze FM", frequency: "91.2", detected_at: at(2, 20, 2), duration_sec: 176, evidence_path: null, share_token: null },
    ],
  }, true);
}
