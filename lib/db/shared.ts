"use client";

// Account-level settings shared by roles, plus public-site data.
import { CHARTS, type ChartRow, type Region } from "@/lib/data/public";
import { normaliseCoverage, type Coverage } from "@/lib/coverage";
import { safeArray } from "@/lib/safe";
import { db, must } from "./core";

export type AlertChannels = { email: boolean; whatsapp: boolean; sms: boolean };
export type AlertPrefs = { phone: string; events: Record<string, boolean>; channels: AlertChannels };
const DEFAULT_EVENTS = { firstSpin: true, dailySummary: true, everyPlay: false, chart: true, dispute: true, payout: false };
export const DEFAULT_CHANNELS: AlertChannels = { email: true, whatsapp: false, sms: false };

export async function loadAlertPrefs(): Promise<AlertPrefs | null> {
  const sb = db();
  if (!sb) return null; // demo mode keeps prefs in this browser
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return null;
  const row = must(await sb.from("alert_prefs").select("whatsapp_e164, events, channels").eq("profile_id", u.user.id).maybeSingle(), "alert settings") as
    { whatsapp_e164: string | null; events: Record<string, boolean> | null; channels: Partial<AlertChannels> | null } | null;
  return { phone: row?.whatsapp_e164 ?? "", events: { ...DEFAULT_EVENTS, ...(row?.events ?? {}) }, channels: { ...DEFAULT_CHANNELS, ...(row?.channels ?? {}) } };
}

/** Normalises "+256 772 123 456" → "+256772123456" (the format the database enforces). */
export function toE164(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, "");
  const m = digits.match(/^(?:\+?256|0)(7\d{8})$/);
  return m ? `+256${m[1]}` : null;
}

export async function saveAlertPrefs(p: AlertPrefs): Promise<void> {
  const sb = db();
  if (!sb) return;
  const { data: u } = await sb.auth.getUser();
  if (!u.user) throw new Error("Sign in again to save alert settings.");
  const phone = p.phone.trim() ? toE164(p.phone) : null;
  if (p.phone.trim() && !phone) throw new Error("Use a Ugandan mobile number, e.g. +256 772 123 456.");
  const channels = { ...DEFAULT_CHANNELS, ...p.channels };
  if ((channels.whatsapp || channels.sms) && !phone) throw new Error("Add your mobile number to get WhatsApp or SMS alerts.");
  must(await sb.from("alert_prefs").upsert({ profile_id: u.user.id, whatsapp_e164: phone, events: p.events, channels }).select("profile_id"), "save alert settings");
}

export type AlertLogRow = {
  id: string;
  kind: string;
  title: string;
  created_at: string;
  sent_at: string | null;
  channel: string | null;
  last_error: string | null;
  attempts: number;
};

/** The last few alerts for this account — proof that messages really went out. */
export async function loadAlertLog(limit = 10): Promise<AlertLogRow[] | null> {
  const sb = db();
  if (!sb) return null; // demo mode has no delivery, so there is nothing to log
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return null;
  const { data, error } = await sb
    .from("alert_outbox")
    .select("id, kind, title, created_at, sent_at, channel, last_error, attempts")
    .eq("profile_id", u.user.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return null;
  return safeArray(data) as AlertLogRow[];
}

/**
 * Live coverage counts for /coverage. The RPC is SECURITY DEFINER so an
 * anonymous visitor gets numbers per region and nothing else — no station
 * names, no stream URLs.
 */
export async function loadPublicCoverage(): Promise<Coverage | null> {
  const sb = db();
  if (!sb) return null;
  const { data, error } = await sb.rpc("public_coverage");
  if (error) return null;
  return normaliseCoverage(data);
}

export type PublicChart = { rows: ChartRow[]; live: boolean };

export async function loadPublicChart(region: "All" | Region): Promise<PublicChart> {
  const sb = db();
  if (!sb) return { rows: safeArray(CHARTS[region]), live: false };
  const data = must(await sb.rpc("public_top_chart", { p_region: region === "All" ? null : region, p_days: 7 }), "chart") as { rank: number; title: string; artist: string | null; spins: number }[];
  return {
    live: true,
    rows: safeArray(data).map((r) => ({ rank: Number(r.rank), title: r.title, artist: r.artist ?? "", spins: Number(r.spins), move: 0, seed: Number(r.rank) })),
  };
}

export type PublicStats = {
  /** Stations whose worker heartbeat is under ten minutes old — real monitoring. */
  streams: number;
  venues: number;
  /** Stations in the panel: true whether or not a worker is running. */
  panel: number;
  /** Panel stations with a stream URL we can actually read. */
  ready: number;
};

/**
 * Which line the header badge shows. Pure, so the honesty rule is testable:
 * "monitored live" only with a recent heartbeat, otherwise the panel size —
 * never a proud zero.
 */
export function badgeLine(
  stats: PublicStats | null,
  configured: boolean,
): { key: "live" | "liveTpl" | "liveStationsTpl" | "livePanelTpl"; values: Record<string, string> } | null {
  if (!stats) return configured ? null : { key: "live", values: {} };
  if (stats.venues > 0) return { key: "liveTpl", values: { s: String(stats.streams), v: String(stats.venues) } };
  if (stats.streams > 0) return { key: "liveStationsTpl", values: { s: String(stats.streams) } };
  if (stats.panel > 0) return { key: "livePanelTpl", values: { s: String(stats.panel), r: String(stats.ready) } };
  return null;
}

export async function loadPublicStats(): Promise<PublicStats | null> {
  const sb = db();
  if (!sb) return null;
  const { data, error } = await sb.rpc("public_platform_stats");
  if (error || !Array.isArray(data) || !data[0]) return null;
  const row = data[0] as Record<string, unknown>;
  const n = (v: unknown) => Number(v ?? 0);
  return { streams: n(row.streams_online), venues: n(row.venues), panel: n(row.panel_stations), ready: n(row.stream_ready) };
}
