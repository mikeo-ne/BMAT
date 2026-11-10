import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import {
  FEED_HEADERS,
  parseFeedQuery,
  toFeedRow,
  type FeedRow,
} from "@/lib/cmo-report";
import { csvBlobParts, toCsv } from "@/lib/export/csv";
import { SITE_URL, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";

/**
 * Read-only airplay feed for a CMO's own systems.
 *
 * Nothing here decides what a caller may see: the request runs with the
 * caller's access token, so Postgres row-level security answers that question
 * exactly as it does in the dashboard. This route only shapes the answer
 * (JSON or CSV) and validates the query.
 */
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store", ...extra },
  });

function bearer(req: Request): string {
  const raw = req.headers.get("authorization") ?? "";
  return raw.toLowerCase().startsWith("bearer ") ? raw.slice(7).trim() : "";
}

export async function GET(req: Request) {
  const parsed = parseFeedQuery(new URL(req.url).searchParams);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  const token = bearer(req);
  if (!token) {
    return json(
      {
        error: "Missing bearer token",
        hint: "Send a Supabase access token: Authorization: Bearer <token>. The feed returns only rows your account may already read.",
      },
      401,
      { "www-authenticate": 'Bearer realm="east-sound-airplay"' },
    );
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json({ error: "Feed is not configured on this deployment" }, 503);
  }

  const { month, from, to, format, station, limit } = parsed.query;

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: auth, error: authError } = await sb.auth.getUser(token);
  if (authError || !auth?.user) return json({ error: "Invalid or expired token" }, 401);

  const base = sb
    .from("detections")
    .select(
      "detected_at, source, confidence, duration_sec, evidence_path, matched_title, matched_artist, stations!inner(name, region, slug), recordings(title, artist_name, isrc)",
    )
    .gte("detected_at", `${from}T00:00:00+03:00`)
    .lte("detected_at", `${to}T23:59:59.999+03:00`);
  const filtered = station ? base.ilike("stations.slug", station) : base;
  const { data, error } = await filtered.order("detected_at", { ascending: true }).limit(limit);
  if (error) return json({ error: "Feed query failed", detail: error.message }, 400);

  const rows: FeedRow[] = (data ?? []).map(toFeedRow);
  const meta = {
    month,
    from,
    to,
    station,
    rows: rows.length,
    limit,
    generated_at: new Date().toISOString(),
    source: SITE_URL || "east-sound",
    note: "Rows are limited to what the bearer token's account may read (row-level security).",
  };

  if (format === "csv") {
    const body = csvBlobParts(toCsv([...FEED_HEADERS], rows.map((r) => FEED_HEADERS.map((h) => (r[h] === null ? "" : r[h])))));
    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="east-sound-airplay-${month}.csv"`,
        "cache-control": "no-store",
        "x-feed-rows": String(rows.length),
      },
    });
  }

  return json({ meta, rows });
}
