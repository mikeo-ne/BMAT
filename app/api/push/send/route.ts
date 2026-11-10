import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import webpush from "web-push";

import { secretMatches } from "@/lib/alerts/auth";
import { SUPABASE_URL } from "@/lib/supabase/config";

/**
 * Sends one web-push notification to every subscribed device (or to one
 * person). Switched off unless VAPID keys and CRON_SECRET exist, so a
 * half-configured deployment never pretends push works.
 *
 *   POST /api/push/send
 *   Authorization: Bearer <CRON_SECRET>
 *   { "title": "…", "body": "…", "url": "/dashboard", "profileId": "optional" }
 *
 * This is the transport. Alert rules already live in the database
 * (`enqueue_alerts`) and reach email/WhatsApp/SMS from the worker; wiring the
 * same rules to this endpoint is the next step, not a hidden assumption.
 */
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

type Sub = { id: string; endpoint: string; p256dh: string; auth: string; profile_id: string };

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const privateKey = process.env.VAPID_PRIVATE_KEY ?? "";
  const subject = process.env.VAPID_SUBJECT ?? "mailto:alerts@eastsound.ug";

  if (!secret) return json({ error: "CRON_SECRET is not set — push sending is switched off." }, 503);
  if (!secretMatches(req, secret)) return json({ error: "unauthorized" }, 401);
  if (!publicKey || !privateKey) {
    return json({ error: "VAPID keys are not set — no device can be notified yet." }, 503);
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!SUPABASE_URL || !serviceKey) return json({ error: "Supabase service role is not configured." }, 503);

  let payload: { title?: string; body?: string; url?: string; profileId?: string; tag?: string } = {};
  try {
    payload = (await req.json()) as typeof payload;
  } catch {
    return json({ error: "Send a JSON body with title and body." }, 400);
  }
  if (!payload.title || !payload.body) return json({ error: "title and body are required." }, 400);

  webpush.setVapidDetails(subject, publicKey, privateKey);
  const sb = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } });

  let query = sb.from("push_subscriptions").select("id, endpoint, p256dh, auth, profile_id").limit(2000);
  if (payload.profileId) query = query.eq("profile_id", payload.profileId);
  const { data, error } = await query;
  if (error) return json({ error: "Could not load subscriptions", detail: error.message }, 500);

  const subs = (data ?? []) as Sub[];
  let sent = 0;
  const gone: string[] = [];
  const failed: { id: string; status: number; message: string }[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: payload.title, body: payload.body, url: payload.url ?? "/dashboard", tag: payload.tag }),
          { TTL: 3600 },
        );
        sent += 1;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode ?? 0;
        // 404/410 mean the browser dropped the subscription — remove it.
        if (status === 404 || status === 410) gone.push(s.id);
        else failed.push({ id: s.id, status, message: e instanceof Error ? e.message : "send failed" });
      }
    }),
  );

  if (gone.length) await sb.from("push_subscriptions").delete().in("id", gone);
  if (failed.length) {
    // Keep the row but record the failure so a broken device stops being retried blindly.
    try {
      await sb.rpc("bump_push_failures", { p_ids: failed.map((f) => f.id) });
    } catch {
      /* bookkeeping only — the send result is what matters */
    }
  }

  return json({ subscriptions: subs.length, sent, removed: gone.length, failed: failed.length, failures: failed.slice(0, 10) });
}

export async function GET() {
  return json(
    {
      endpoint: "/api/push/send",
      method: "POST",
      auth: "Authorization: Bearer <CRON_SECRET>",
      body: { title: "string", body: "string", url: "/dashboard", profileId: "optional uuid" },
      configured: Boolean(process.env.CRON_SECRET && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
    },
    200,
  );
}
