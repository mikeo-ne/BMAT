import { createRandom, hashSeed } from "@/lib/airplay";
import {
  FM_STATIONS,
  REGIONS,
  stationsForRegion,
  type Region,
} from "@/lib/regions";
import type { Detection, Medium } from "@/lib/monitoring";
import type { Track } from "@/lib/types";

export interface BroadcastSpin {
  id: string;
  detectedAt: string;
  stationId: string;
  stationName: string;
  region: Region;
  medium: Medium;
  trackId: string | null;
  title: string | null;
  primaryArtist: string | null;
  isrc: string | null;
  durationSec: number;
  confidence: number;
  source: "demo" | "captured";
  evidence?: { url: string; sha256: string };
}

/** 14 completed EAT reporting days. All events are fixtures, NOT recognition results. */
export function buildBroadcastLog(
  catalogue: Track[],
  now: Date = new Date(),
): BroadcastSpin[] {
  catalogue = catalogue.filter((track) => track.origin === "test-fixture");
  const eat = new Date(now.getTime() + 3 * 3_600_000);
  const midnight =
    Date.UTC(eat.getUTCFullYear(), eat.getUTCMonth(), eat.getUTCDate()) -
    3 * 3_600_000;
  const events: BroadcastSpin[] = [];
  const hours = [
    0, 2, 4, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 11, 12, 13, 14, 15, 16, 16, 17, 17,
    18, 18, 19, 19, 20, 21, 22, 23,
  ];

  for (const track of catalogue) {
    for (const regional of track.airplay) {
      const stations = stationsForRegion(regional.region).slice(
        0,
        Math.max(1, regional.stations),
      );
      if (!stations.length) continue;
      const reach = stations.reduce((sum, station) => sum + station.reach, 0);
      for (const [day, count] of regional.trend.slice(-14).entries()) {
        const rand = createRandom(
          hashSeed(`playout:${track.id}:${regional.region}:${day}`),
        );
        for (let i = 0; i < count; i++) {
          let target = rand() * reach;
          const station =
            stations.find((entry) => (target -= entry.reach) <= 0) ??
            stations[0];
          const hour = hours[Math.floor(rand() * hours.length)];
          const detectedAt = new Date(
            midnight -
              (14 - day) * 86_400_000 +
              (hour * 3600 + Math.floor(rand() * 3600)) * 1000,
          ).toISOString();
          // Never fabricate a spin before a recording's release.
          if (detectedAt.slice(0, 10) < track.releaseDate) continue;
          events.push({
            id: `spin:${track.id}:${regional.region}:${day}:${i}`,
            detectedAt,
            stationId: station.id,
            stationName: station.name,
            region: regional.region,
            medium: "FM",
            trackId: track.id,
            title: track.title,
            primaryArtist: track.primaryArtist,
            isrc: track.isrc,
            durationSec: track.audio.durationSec ?? 180,
            confidence: 0.88 + rand() * 0.119,
            source: "demo",
          });
        }
      }
    }
  }

  // A visible work queue, rather than silently dropping unknown material.
  for (const region of REGIONS) {
    const count = Math.floor(
      events.filter((event) => event.region === region).length / 32,
    );
    const stations = stationsForRegion(region);
    const rand = createRandom(hashSeed(`unmatched:${region}`));
    for (let i = 0; i < count; i++) {
      const station = stations[Math.floor(rand() * stations.length)];
      events.push({
        id: `unknown:${region}:${i}`,
        detectedAt: new Date(
          midnight -
            (1 + Math.floor(rand() * 14)) * 86_400_000 +
            Math.floor(rand() * 86_400_000),
        ).toISOString(),
        stationId: station.id,
        stationName: station.name,
        region,
        medium: "FM",
        trackId: null,
        title: null,
        primaryArtist: null,
        isrc: null,
        durationSec: 30 + Math.floor(rand() * 150),
        confidence: 0.18 + rand() * 0.36,
        source: "demo",
      });
    }
  }

  // TV is a distinct, explicitly simulated panel; never added to the FM catalogue totals.
  if (catalogue.length) {
    for (let day = 0; day < 14; day++) {
      const available = catalogue.filter(
        (track) =>
          track.releaseDate <=
          new Date(midnight - (14 - day) * 86_400_000)
            .toISOString()
            .slice(0, 10),
      );
      if (!available.length) continue;
      const track = available[day % available.length];
      events.push({
        id: `tv:${day}:${track.id}`,
        detectedAt: new Date(
          midnight - (14 - day) * 86_400_000 + 18.5 * 3_600_000,
        ).toISOString(),
        stationId: "nbs-tv-kla",
        stationName: "NBS TV",
        region: "Central",
        medium: "TV",
        trackId: track.id,
        title: track.title,
        primaryArtist: track.primaryArtist,
        isrc: track.isrc,
        durationSec: track.audio.durationSec ?? 180,
        confidence: 0.96,
        source: "demo",
      });
    }
  }
  return events.sort(
    (a, b) =>
      b.detectedAt.localeCompare(a.detectedAt) || a.id.localeCompare(b.id),
  );
}

export interface PlayoutFilters {
  region?: Region | "All";
  days?: 7 | 14;
  stationId?: string;
  artist?: string;
  medium?: Medium | "All";
  status?: "all" | "matched" | "unmatched";
  query?: string;
}

export function filterBroadcastLog(
  events: BroadcastSpin[],
  filters: PlayoutFilters,
): BroadcastSpin[] {
  const newest = events.reduce(
    (latest, event) => (event.detectedAt > latest ? event.detectedAt : latest),
    "",
  );
  const latestDay = newest ? eatDate(newest) : "";
  const cutoff = latestDay
    ? Date.parse(`${latestDay}T00:00:00+03:00`) -
      ((filters.days ?? 14) - 1) * 86_400_000
    : 0;
  const query = filters.query?.trim().toLowerCase();
  return events.filter((event) => {
    if (Date.parse(event.detectedAt) < cutoff) return false;
    if (
      filters.region &&
      filters.region !== "All" &&
      event.region !== filters.region
    )
      return false;
    if (filters.stationId && event.stationId !== filters.stationId)
      return false;
    if (filters.artist && event.primaryArtist !== filters.artist) return false;
    if (
      filters.medium &&
      filters.medium !== "All" &&
      event.medium !== filters.medium
    )
      return false;
    if (filters.status === "matched" && !event.trackId) return false;
    if (filters.status === "unmatched" && event.trackId) return false;
    return (
      !query ||
      [event.title, event.primaryArtist, event.isrc, event.stationName].some(
        (value) => value?.toLowerCase().includes(query),
      )
    );
  });
}

export function eatDate(iso: string): string {
  return new Date(Date.parse(iso) + 3 * 3_600_000).toISOString().slice(0, 10);
}
export function eatTime(iso: string): string {
  return new Date(Date.parse(iso) + 3 * 3_600_000).toISOString().slice(11, 19);
}
export function eatHour(iso: string): number {
  return new Date(Date.parse(iso) + 3 * 3_600_000).getUTCHours();
}

export function summariseBroadcastLog(events: BroadcastSpin[]) {
  const stations = new Map<string, { name: string; count: number }>();
  const windows = new Map<number, number>();
  for (const event of events) {
    if (!event.trackId) continue;
    const station = stations.get(event.stationId) ?? {
      name: event.stationName,
      count: 0,
    };
    station.count++;
    stations.set(event.stationId, station);
    const start = Math.floor(eatHour(event.detectedAt) / 4) * 4;
    windows.set(start, (windows.get(start) ?? 0) + 1);
  }
  const topStation =
    [...stations.values()].sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name),
    )[0] ?? null;
  const peak = [...windows.entries()].sort(
    (a, b) => b[1] - a[1] || a[0] - b[0],
  )[0];
  return {
    total: events.length,
    matched: events.filter((event) => event.trackId).length,
    unmatched: events.filter((event) => !event.trackId).length,
    stationCount: new Set(events.map((event) => event.stationId)).size,
    topStation,
    peakWindow: peak
      ? `${String(peak[0]).padStart(2, "0")}:00–${String(peak[0] + 4).padStart(2, "0")}:00`
      : "—",
  };
}

export function evidenceFromDetection(detection: Detection): BroadcastSpin {
  return {
    id: detection.id,
    detectedAt: detection.detectedAt,
    stationId: detection.stationId,
    stationName: detection.stationName,
    medium: detection.medium,
    region:
      FM_STATIONS.find((station) => station.id === detection.stationId)
        ?.region ?? "Central",
    trackId: null,
    title: detection.track?.title ?? null,
    primaryArtist: detection.track?.primaryArtist ?? null,
    isrc: detection.track?.isrc ?? null,
    durationSec: detection.matchedSeconds,
    confidence: detection.confidence,
    source: "demo",
  };
}
