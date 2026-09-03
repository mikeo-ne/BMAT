import { NextResponse } from "next/server";

import { MONITORED_STATIONS } from "@/lib/monitoring";
import { FM_STATIONS, REGIONS, type Region, type Station } from "@/lib/regions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PanelStation extends Station {
  monitored: boolean;
  medium: "FM" | "TV";
}

/**
 * GET /api/stations?region=Central
 *
 * The full spin panel with a `monitored` flag and broadcast medium, so the
 * monitoring, audit and alert surfaces share one station registry.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const region = searchParams.get("region");

  const monitoredById = new Map(MONITORED_STATIONS.map((s) => [s.id, s]));

  const stations: PanelStation[] = FM_STATIONS.map((station) => ({
    ...station,
    monitored: monitoredById.has(station.id),
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
        reach: 0,
        monitored: true,
        medium: "TV",
      });
    }
  }

  const filtered =
    region && (REGIONS as readonly string[]).includes(region)
      ? stations.filter((s) => s.region === (region as Region))
      : stations;

  return NextResponse.json({
    regions: REGIONS,
    stations: filtered,
    monitoredCount: MONITORED_STATIONS.length,
    panelSize: FM_STATIONS.length,
  });
}
