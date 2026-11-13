import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { lookupMusicBrainz, normalizeIsrc, validIsrc } from "@/lib/catalog/musicbrainz";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

export async function POST(req: Request) {
  const raw = req.headers.get("authorization") ?? "";
  const token = raw.toLowerCase().startsWith("bearer ") ? raw.slice(7).trim() : "";
  if (!token) return json({ error: "Sign in to look up an ISRC." }, 401);
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return json({ error: "ISRC lookup isn't configured." }, 503);
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: auth, error } = await sb.auth.getUser(token);
  if (error || !auth?.user) return json({ error: "Your session has expired. Sign in again." }, 401);
  const { data: profile } = await sb.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (!profile || !["artist", "label"].includes(String(profile.role))) return json({ error: "Only artist and label accounts can look up songs." }, 403);
  const agent = process.env.MUSICBRAINZ_USER_AGENT?.trim() ?? "";
  if (process.env.MUSICBRAINZ_ENABLED !== "true" || !agent || /[\r\n]/.test(agent)) {
    return json({ error: "MusicBrainz lookup isn't enabled yet. You can enter the song details manually." }, 503);
  }
  let body: { isrc?: unknown };
  try { body = await req.json(); } catch { return json({ error: "Enter an ISRC." }, 400); }
  const isrc = typeof body.isrc === "string" ? normalizeIsrc(body.isrc) : "";
  if (!validIsrc(isrc)) return json({ error: "Enter a valid 12-character ISRC." }, 400);
  // Fail closed if the migration is missing or the shared limiter is unavailable.
  const { data: admitted, error: gateError } = await sb.rpc("take_musicbrainz_lookup_slot");
  if (gateError) return json({ error: "ISRC lookup is temporarily unavailable. Enter details manually." }, 503);
  if (!admitted) return json({ error: "Please wait a moment before another lookup." }, 429);
  try {
    const candidates = await lookupMusicBrainz(isrc, agent);
    return json({ candidates });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "MusicBrainz lookup failed." }, 502);
  }
}
