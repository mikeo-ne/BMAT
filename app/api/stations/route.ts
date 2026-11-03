import { guardedApi } from "@/lib/auth-core";
import { NextResponse } from "next/server";

import { MONITORED_STATIONS } from "@/lib/monitoring";
import { FM_STATIONS, REGIONS, type Region, type Station } from "@/lib/regions";
import {
  MONITORED_FEEDS,
  REFERENCE_FEEDS,
} from "@/lib/station-feeds";
import { readStationHealth } from "@/lib/station-health-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PanelStation extends Omit<Station, "reach"> {
  reach: number | null;
  monitored: boolean;
  frequencyVerified: boolean;
  medium: "FM" | "TV";
}

/**
 * GET /api/stations?region=Central
 *
 * The full spin panel with a `monitored` flag and broadcast medium, so the
 * monitoring, audit and alert surfaces share one station registry.
 */
export async function GET(request: Request) {
  return guardedApi(request, ["broadcaster"], false, async (actor) => {
    const { searchParams } = new URL(request.url);
    const region = searchParams.get("region");

    const stations: PanelStation[] = FM_STATIONS.map((station) => ({
      ...station,
      reach: null,
      monitored: false,
      frequencyVerified: false,
      medium: "FM",
    }));

    for (const tv of MONITORED_STATIONS.filter((s) => s.medium === "TV")) {
      if (!stations.some((s) => s.id === tv.id)) {
        stations.push({
          id: tv.id,
          name: tv.name,
          region: tv.region,
          location: tv.location,
          frequency: tv.frequency,
          reach: null,
          monitored: false,
          frequencyVerified: false,
          medium: "TV",
        });
      }
    }

    const filtered =
      region && (REGIONS as readonly string[]).includes(region)
        ? stations.filter((s) => s.region === (region as Region))
        : stations;

    const health = await readStationHealth();

    return NextResponse.json({
      regions: REGIONS,
      stations: filtered.filter((station) =>
        actor.stationIds.includes(station.id),
      ),
      realFeeds: [...MONITORED_FEEDS, ...REFERENCE_FEEDS].map((feed) => ({
        ...feed,
        health: health.get(feed.id) ?? null,
      })),
      monitoredCount: 0,
      source: "station-directory-only",
      notice:
        "Directory metadata is not live connectivity, an audience source or verified frequency licensing. Browser-configured playback is separate from capture.",
      panelSize: actor.stationIds.length,
    });
  });
}
