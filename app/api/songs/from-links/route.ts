import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { resolveLink, type LinkResult } from "@/lib/links/resolve";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";

/**
 * POST { urls: string[] } → song details for each link (title, artist, ISRC, UPC, …).
 *
 * Signed-in artists and labels only, up to 25 links a request. Details only — no
 * audio is fetched from any platform. Lookups run against an allow-list of music
 * sites (see lib/links/resolve.ts), so this cannot be used to reach other hosts.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_LINKS = 25;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

export async function POST(req: Request) {
  const raw = req.headers.get("authorization") ?? "";
  const token = raw.toLowerCase().startsWith("bearer ") ? raw.slice(7).trim() : "";
  if (!token) return json({ error: "Sign in to add songs from links." }, 401);
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return json({ error: "Not configured on this deployment." }, 503);

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: auth, error } = await sb.auth.getUser(token);
  if (error || !auth?.user) return json({ error: "Your session has expired. Sign in again." }, 401);
  const { data: profile } = await sb.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (!profile || !["artist", "label"].includes(String(profile.role))) return json({ error: "Only artist and label accounts can add songs." }, 403);

  let body: { urls?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Send { urls: [...] }." }, 400);
  }
  const urls = Array.isArray(body.urls) ? body.urls.filter((u): u is string => typeof u === "string" && u.trim().length > 0).map((u) => u.trim()) : [];
  if (!urls.length) return json({ error: "Paste at least one link." }, 400);
  if (urls.length > MAX_LINKS) return json({ error: `Up to ${MAX_LINKS} links at a time.` }, 400);

  const unique = Array.from(new Set(urls));
  const results: LinkResult[] = [];
  // A few at a time: fast enough for a page of links, gentle on the catalogues we ask.
  for (let i = 0; i < unique.length; i += 4) {
    results.push(...(await Promise.all(unique.slice(i, i + 4).map((u) => resolveLink(u)))));
  }
  return json({ results });
}
