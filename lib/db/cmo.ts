"use client";

// CMO / Auditor data. RLS gives an approved CMO workspace-wide reads.
import * as demo from "@/lib/data/cmo";
import { safeArray } from "@/lib/safe";
import { db, must } from "./core";

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
