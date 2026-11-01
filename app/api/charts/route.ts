import { NextResponse } from "next/server";

import { buildWeeklyChart } from "@/lib/charts";
import { readWorkspaceData } from "@/lib/workspace-data";
import { catalogueWithCapturedStats } from "@/lib/captured-airplay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/charts
 *
 * The current weekly national airplay chart, built from the same pure chart
 * model the /dashboard/charts page renders on the server.
 */
export async function GET() {
  const data = await readWorkspaceData();
  const catalogue = catalogueWithCapturedStats(
    data.catalogue,
    data.history.filter((event) => event.medium === "FM"),
    new Date(data.now),
  );
  const chart = buildWeeklyChart(catalogue, new Date(data.now));

  return NextResponse.json({ chart });
}
