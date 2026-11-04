"use client";

// Account-level settings shared by roles, plus public-site data.
import { CHARTS, type ChartRow, type Region } from "@/lib/data/public";
import { safeArray } from "@/lib/safe";
import { db, must } from "./core";

export type AlertPrefs = { phone: string; events: Record<string, boolean> };
const DEFAULT_EVENTS = { firstSpin: true, chart: true, dispute: true, payout: false };

export async function loadAlertPrefs(): Promise<AlertPrefs | null> {
  const sb = db();
  if (!sb) return null; // demo mode keeps prefs in this browser
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return null;
  const row = must(await sb.from("alert_prefs").select("whatsapp_e164, events").eq("profile_id", u.user.id).maybeSingle(), "alert settings") as
    { whatsapp_e164: string | null; events: Record<string, boolean> | null } | null;
  return { phone: row?.whatsapp_e164 ?? "", events: { ...DEFAULT_EVENTS, ...(row?.events ?? {}) } };
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
  must(await sb.from("alert_prefs").upsert({ profile_id: u.user.id, whatsapp_e164: phone, events: p.events }).select("profile_id"), "save alert settings");
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
export async function loadAlertLog(limit = 5): Promise<AlertLogRow[] | null> {
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

export async function loadPublicStats(): Promise<{ streams: number; venues: number } | null> {
  const sb = db();
  if (!sb) return null;
  const { data, error } = await sb.rpc("public_platform_stats");
  if (error || !Array.isArray(data) || !data[0]) return null;
  return { streams: Number(data[0].streams_online), venues: Number(data[0].venues) };
}
