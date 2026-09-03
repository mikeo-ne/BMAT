import { NextResponse } from "next/server";

import { PANEL_SIZE } from "@/lib/catalog";
import { readTracks } from "@/lib/store";
import { summariseCatalog } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/catalogue
 *
 * The delivered catalogue plus the panel-wide summary every dashboard header
 * uses. Suitable for client components that want to refresh after a delivery
 * without a full page navigation.
 */
export async function GET() {
  const tracks = await readTracks();

  return NextResponse.json({
    summary: summariseCatalog(tracks),
    panelSize: PANEL_SIZE,
    tracks,
  });
}
