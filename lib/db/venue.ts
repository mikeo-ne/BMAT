"use client";

// Venue-operator data. RLS limits queries to venues owned by the caller's organisation.
import * as demo from "@/lib/data/venue";
import { safeArray } from "@/lib/safe";
import { db, must } from "./core";

export type NodeStatus = "online" | "degraded" | "offline";
export type ListenerNode = { id: string; code: string; location: string; type: string; status: NodeStatus; lastHeartbeat: string; tracksToday: number };
export type DjSet = { id: string; dj: string; start: string; end: string; tracks: number; matched: number };
export type Compliance = "compliant" | "at-risk" | "non-compliant";
export type VenueData = {
  venueId: string | null;
  venueName: string;
  compliance: { status: Compliance; licence: string; renews: string };
  nodes: ListenerNode[];
  sets: DjSet[];
};

function age(iso: string | null): { label: string; status: NodeStatus } {
  if (!iso) return { label: "never", status: "offline" };
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  const label = s < 60 ? `${Math.round(s)}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
  return { label, status: s < 120 ? "online" : s < 1800 ? "degraded" : "offline" };
}

export async function loadVenue(): Promise<VenueData> {
  const sb = db();
  if (!sb) {
    return {
      venueId: null, venueName: "Your venue",
      // Same rule as live mode: a valid licence is "compliant" only while every node reports.
      compliance: {
        status: new Date(demo.COMPLIANCE.renews) <= new Date() ? "non-compliant" : demo.NODES.some((n) => n.status === "offline") ? "at-risk" : "compliant",
        licence: demo.COMPLIANCE.licence, renews: demo.COMPLIANCE.renews,
      },
      nodes: demo.NODES.map((n) => ({ id: n.id, code: n.id, location: n.location, type: n.type, status: n.status, lastHeartbeat: n.lastHeartbeat, tracksToday: n.tracksToday })),
      sets: [...demoSets, ...demo.DJ_SETS.map((s) => ({ id: s.id, dj: s.dj, start: `${s.date} ${s.start}`, end: s.end, tracks: s.tracks, matched: s.matched }))],
    };
  }
  const venues = safeArray(must(await sb.from("venues").select("id, name, uprs_licence, licence_expires").order("name"), "venues") as { id: string; name: string; uprs_licence: string | null; licence_expires: string | null }[]);
  const v = venues[0];
  if (!v) return { venueId: null, venueName: "No venue linked", compliance: { status: "non-compliant", licence: "—", renews: "—" }, nodes: [], sets: [] };

  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Kampala" }));
  today.setHours(0, 0, 0, 0);
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const [nodes, sets, dets] = await Promise.all([
    sb.from("venue_nodes").select("id, code, location, kind, last_heartbeat").eq("venue_id", v.id).order("code"),
    sb.from("dj_sets").select("id, dj, starts_at, ends_at").eq("venue_id", v.id).order("starts_at", { ascending: false }).limit(50),
    sb.from("detections").select("node_id, detected_at, recording_id").eq("venue_id", v.id).gte("detected_at", since).limit(5000),
  ]);
  const detRows = safeArray(must(dets, "detections") as { node_id: string | null; detected_at: string; recording_id: string | null }[]);
  const dayStart = Date.now() - 864e5;

  const nodeRows = safeArray(must(nodes, "nodes") as { id: string; code: string; location: string; kind: string | null; last_heartbeat: string | null }[]).map((n) => {
    const a = age(n.last_heartbeat);
    return {
      id: n.id, code: n.code, location: n.location, type: n.kind ?? "Other", status: a.status, lastHeartbeat: a.label,
      tracksToday: detRows.filter((d) => d.node_id === n.id && new Date(d.detected_at).getTime() >= dayStart).length,
    };
  });
  const fmt = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Kampala", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  const setRows = safeArray(must(sets, "dj sets") as { id: string; dj: string; starts_at: string; ends_at: string }[]).map((s) => {
    const a = new Date(s.starts_at).getTime();
    const b = new Date(s.ends_at).getTime();
    const inSet = detRows.filter((d) => { const t = new Date(d.detected_at).getTime(); return t >= a && t <= b; });
    return { id: s.id, dj: s.dj, start: fmt(s.starts_at), end: fmt(s.ends_at).slice(-5), tracks: inSet.length, matched: inSet.filter((d) => d.recording_id).length };
  });

  const licenceValid = Boolean(v.uprs_licence && v.licence_expires && new Date(v.licence_expires) > new Date());
  const anyOffline = nodeRows.some((n) => n.status === "offline");
  return {
    venueId: v.id,
    venueName: v.name,
    compliance: { status: !licenceValid ? "non-compliant" : anyOffline ? "at-risk" : "compliant", licence: v.uprs_licence ?? "No licence on file", renews: v.licence_expires ?? "—" },
    nodes: nodeRows,
    sets: setRows,
  };
}

const demoSets: DjSet[] = []; // demo mode: kept in memory for the session

export async function addDjSet(venueId: string | null, dj: string, startsAt: string, endsAt: string): Promise<void> {
  const sb = db();
  if (!sb) {
    const f = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Kampala", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    demoSets.unshift({ id: `demo-${Date.now()}`, dj, start: f(startsAt), end: f(endsAt).slice(-5), tracks: 0, matched: 0 });
    return;
  }
  if (!venueId) throw new Error("Your account isn't linked to a venue yet.");
  must(await sb.from("dj_sets").insert({ venue_id: venueId, dj, starts_at: startsAt, ends_at: endsAt }).select("id"), "log DJ set");
}
