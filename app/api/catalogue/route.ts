import { guardedApi } from "@/lib/auth-core";
import { readWorkspaceData } from "@/lib/workspace-data";
import { NextResponse } from "next/server";

import { PANEL_SIZE } from "@/lib/catalog";
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
export async function GET(request?: Request) {
  return guardedApi(request, ["artist"], false, async (actor) => {
    const tracks = (await readWorkspaceData(new Date(), actor)).catalogue;

    return NextResponse.json({
      summary: summariseCatalog(tracks),
      panelSize: PANEL_SIZE,
      tracks,
    });
  });
}
