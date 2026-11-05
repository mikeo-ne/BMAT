import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { secretMatches } from "@/lib/alerts/auth";
import { configuredChannels, envFromProcess, httpPost } from "@/lib/alerts/deliver";
import { drain, supabaseStore } from "@/lib/alerts/outbox";
import { SITE_URL, SUPABASE_URL } from "@/lib/supabase/config";

/**
 * Alert sender. Called by a scheduler (Vercel cron once a day on Hobby, or any
 * 10-minute cron elsewhere — a GitHub Action is included in the repo).
 *
 * Two jobs, in this order:
 *   1. ask the database who should hear about something (`enqueue_alerts`)
 *   2. deliver whatever is pending over WhatsApp or email
 *
 * Switched off by design: no `CRON_SECRET` means the endpoint refuses to run,
 * and no provider credentials means nothing is queued at all — so a half-set-up
 * deployment never sends a broken message or fills the outbox with junk.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

async function handle(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) return json({ error: "CRON_SECRET is not set — the alert sender is switched off." }, 503);
  if (!secretMatches(req, secret)) return json({ error: "unauthorized" }, 401);

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!SUPABASE_URL || !serviceKey) {
    return json({ error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — nothing can be sent." }, 503);
  }

  const url = new URL(req.url);
  const weekly = url.searchParams.get("weekly") === "1";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 25) || 25, 1), 100);
  const env = envFromProcess(process.env, SITE_URL);
  const channels = configuredChannels(env);

  const sb = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  let enqueued = 0;
  if (channels.length > 0) {
    const { data, error } = await sb.rpc("enqueue_alerts");
    if (error) return json({ error: `could not enqueue alerts: ${error.message}` }, 500);
    enqueued += Number(data ?? 0);
    if (weekly) {
      const { data: weeklyData, error: weeklyError } = await sb.rpc("enqueue_chart_alerts");
      if (weeklyError) return json({ error: `could not enqueue chart alerts: ${weeklyError.message}` }, 500);
      enqueued += Number(weeklyData ?? 0);
    }
  }

  const summary = await drain(supabaseStore(sb), env, httpPost(fetch), { limit });
  return json({ ok: true, channels, enqueued, ...summary });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
