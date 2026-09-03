import { NextResponse } from "next/server";

import { buildWeeklyChart } from "@/lib/charts";
import { readTracks } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/charts
 *
 * The current weekly national airplay chart, built from the same pure chart
 * model the /dashboard/charts page renders on the server.
 */
export async function GET() {
  const catalogue = await readTracks();
  const chart = buildWeeklyChart(catalogue, new Date());

  return NextResponse.json({ chart });
}
