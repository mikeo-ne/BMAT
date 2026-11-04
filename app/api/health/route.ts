import { NextResponse } from "next/server";
import { buildReadiness, httpFetcher, summarize } from "@/lib/health";
import { SITE_URL, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";

/** Liveness + readiness for uptime monitors and the /setup console. */
export const dynamic = "force-dynamic";

export async function GET() {
  const report = await buildReadiness({
    supabaseUrl: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
    siteUrl: SITE_URL,
    fetch: httpFetcher,
  });
  return NextResponse.json(
    { ...report, summary: summarize(report) },
    { status: report.ready ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
