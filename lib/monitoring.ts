import { createRandom, hashSeed } from "@/lib/airplay";
import { stationById as panelStation, type Hub, type Region } from "@/lib/regions";
import type { Track } from "@/lib/types";

/**
 * Live station monitoring.
 *
 * East Sound listens to each station's broadcast feed, fingerprints the audio and
 * matches it against the delivered catalogue. Until real stream capture is
 * running, this module models the ingest side: the monitored panel, per-station
 * telemetry, and the fingerprint match outcomes.
 *
 * The station list and every telemetry figure are demo fixtures. Frequencies for
 * Capital FM, CBS FM, Galaxy FM and NBS TV are the values the monitoring brief
 * specifies; the rest are indicative placeholders, not verified allocations.
 */

export type Medium = "FM" | "TV";

export interface MonitoredStation {
  id: string;
  name: string;
  /** "91.3 MHz" for radio, "Ch. 34 DTT" for television. */
  frequency: string;
  medium: Medium;
  region: Region;
  location: Hub;
}

/**
 * Region and hub are read off the spin panel rather than restated here, so the
 * two lists cannot drift apart. Only the frequency is monitoring-specific.
 */
function radio(id: string, name: string, frequency: string): MonitoredStation {
  const panel = panelStation(id);

  return {
    id,
    name,
    frequency,
    medium: "FM",
    region: panel?.region ?? "Central",
    location: panel?.location ?? "Kampala",
  };
}

export const MONITORED_STATIONS: MonitoredStation[] = [
  radio("capital-kla", "Capital FM", "91.3 MHz"),
  radio("cbs-kla", "CBS FM", "89.2 MHz"),
  radio("galaxy-kla", "Galaxy FM", "100.2 MHz"),
  {
    id: "nbs-tv-kla",
    name: "NBS TV",
    frequency: "Ch. 34 DTT",
    medium: "TV",
    region: "Central",
    location: "Kampala",
  },
  radio("kfm-kla", "KFM", "93.7 MHz"),
  radio("bukedde-kla", "Bukedde FM", "88.4 MHz"),
  radio("gaaki-jin", "Radio Gaaki", "89.7 MHz"),
  radio("better-mba", "Better FM", "92.9 MHz"),
  radio("radiowest-mbr", "Radio West", "95.4 MHz"),
  radio("mega-gul", "Mega FM", "97.0 MHz"),
  radio("upcountry-gul", "Upcountry FM", "96.3 MHz"),
];

export function stationById(id: string): MonitoredStation | undefined {
  return MONITORED_STATIONS.find((s) => s.id === id);
}

export function monitoredCount(medium?: Medium): number {
  return medium ? MONITORED_STATIONS.filter((s) => s.medium === medium).length : MONITORED_STATIONS.length;
}

/* -------------------------------------------------------------------------- */
/* Telemetry                                                                   */
/* -------------------------------------------------------------------------- */

export type StationStatus = "online" | "degraded" | "offline";

export interface StationTelemetry {
  status: StationStatus;
  /** Share of the last 24h the feed stayed up, 0..1. */
  uptime: number;
  latencyMs: number;
  /** Stream buffer health, 0..1. */
  bufferHealth: number;
  /** Rolling 24-point signal level history, 0..1. */
  level: number[];
  lastHeartbeat: string;
}

export const LEVEL_HISTORY = 24;

/**
 * Baseline telemetry for a station. Seeded from the station id so a station is
 * consistently "the healthy one" or "the flaky one" across reloads, then drifted
 * by the client to feel live.
 */
export function generateTelemetry(stationId: string, now: Date = new Date()): StationTelemetry {
  const rand = createRandom(hashSeed(`monitor:${stationId}`));
  const roll = rand();

  const status: StationStatus = roll > 0.9 ? "offline" : roll > 0.72 ? "degraded" : "online";

  const uptime =
    status === "offline"
      ? 0.62 + rand() * 0.12
      : status === "degraded"
        ? 0.9 + rand() * 0.06
        : 0.985 + rand() * 0.014;

  const latencyMs = Math.round(
    status === "offline" ? 0 : status === "degraded" ? 420 + rand() * 900 : 40 + rand() * 180,
  );

  const bufferHealth = status === "offline" ? 0 : status === "degraded" ? 0.28 + rand() * 0.3 : 0.78 + rand() * 0.2;

  const level = Array.from({ length: LEVEL_HISTORY }, () =>
    status === "offline" ? 0 : Math.min(1, Math.max(0.04, 0.35 + rand() * 0.6)),
  );

  const heartbeat = new Date(now);
  heartbeat.setUTCSeconds(heartbeat.getUTCSeconds() - Math.round(rand() * 12));

  return {
    status,
    uptime,
    latencyMs,
    bufferHealth,
    level,
    lastHeartbeat: heartbeat.toISOString(),
  };
}

/**
 * Advances telemetry by one tick: latency and level wander, and a station
 * occasionally drops out or recovers. Deterministic for a given tick + station.
 */
export function driftTelemetry(
  stationId: string,
  current: StationTelemetry,
  tick: number,
  now: Date = new Date(),
): StationTelemetry {
  const rand = createRandom(hashSeed(`${stationId}:${tick}`));

  // ~1.5% of ticks flip a station between healthy and degraded.
  const flip = rand();
  let status = current.status;
  if (flip > 0.992 && status !== "offline") {
    status = "degraded";
  } else if (flip < 0.006 && status !== "online") {
    status = "online";
  }

  if (status === "offline") {
    return {
      ...current,
      status,
      latencyMs: 0,
      bufferHealth: 0,
      level: Array.from({ length: LEVEL_HISTORY }, () => 0),
      lastHeartbeat: current.lastHeartbeat,
    };
  }

  const degraded = status === "degraded";
  const base = degraded ? 0.45 : 0.72;
  const lastLevel = current.level[current.level.length - 1] ?? base;
  const nextLevel = Math.min(1, Math.max(0.05, lastLevel + (rand() - 0.5) * 0.34));

  const baseLatency = degraded ? 620 : 90;
  const latencyMs = Math.max(18, Math.round(baseLatency + (rand() - 0.5) * (degraded ? 700 : 110)));

  return {
    ...current,
    status,
    uptime: Math.min(1, current.uptime + (rand() - 0.4) * 0.0004),
    latencyMs,
    bufferHealth: Math.min(1, Math.max(0.05, current.bufferHealth + (rand() - 0.5) * 0.06)),
    level: [...current.level.slice(1), nextLevel],
    lastHeartbeat: now.toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/* Fingerprint matching                                                        */
/* -------------------------------------------------------------------------- */

export const MATCH_THRESHOLD = 0.6;

export interface DetectedTrack {
  title: string;
  primaryArtist: string;
  isrc: string;
}

export interface Detection {
  id: string;
  detectedAt: string;
  stationId: string;
  stationName: string;
  medium: Medium;
  /** Null when the fingerprint matched nothing in the catalogue. */
  track: DetectedTrack | null;
  confidence: number;
  matchedSeconds: number;
  method: string;
}

export function isMatched(detection: Detection): boolean {
  return detection.track !== null && detection.confidence >= MATCH_THRESHOLD;
}

/**
 * Runs one fingerprint pass over the monitored panel.
 *
 * Offline stations are skipped entirely — a feed that is down cannot produce a
 * match. Each reporting station yields one detection; roughly one in eight falls
 * below the match threshold and is recorded as unmatched rather than discarded,
 * because unmatched audio is the signal that a delivery is missing from the
 * catalogue.
 */
export function simulateScan(input: {
  stations: MonitoredStation[];
  catalogue: Track[];
  telemetry: Record<string, StationTelemetry>;
  now: Date;
  /** Varies per scan so consecutive scans differ. */
  seed: string;
}): Detection[] {
  const rand = createRandom(hashSeed(`scan:${input.seed}`));
  const detections: Detection[] = [];

  for (const station of input.stations) {
    const telemetry = input.telemetry[station.id];
    if (!telemetry || telemetry.status === "offline") continue;

    const roll = rand();
    const unmatched = input.catalogue.length === 0 || roll > 0.875;

    // Confidence clusters high for a real match and low for a near miss.
    const confidence = unmatched
      ? 0.18 + rand() * 0.34
      : MATCH_THRESHOLD + 0.08 + rand() * (0.995 - MATCH_THRESHOLD - 0.08);

    const track = unmatched
      ? null
      : input.catalogue[Math.min(input.catalogue.length - 1, Math.floor(rand() * input.catalogue.length))];

    detections.push({
      id: `det_${hashSeed(`${input.seed}:${station.id}`).toString(36).slice(0, 8)}`,
      detectedAt: input.now.toISOString(),
      stationId: station.id,
      stationName: station.name,
      medium: station.medium,
      track: track
        ? { title: track.title, primaryArtist: track.primaryArtist, isrc: track.isrc }
        : null,
      confidence,
      matchedSeconds: Math.round(6 + rand() * 18),
      method: station.medium === "TV" ? "Chromaprint v2 · video audio bus" : "Chromaprint v2 · spectral peak",
    });
  }

  return detections;
}

export interface MonitorSummary {
  stations: number;
  online: number;
  degraded: number;
  offline: number;
  detections: number;
  matched: number;
  unmatched: number;
  averageConfidence: number;
  matchRate: number;
}

export function summariseMonitor(
  telemetry: Record<string, StationTelemetry>,
  detections: Detection[],
): MonitorSummary {
  const entries = Object.values(telemetry);
  const matched = detections.filter(isMatched);

  return {
    stations: entries.length,
    online: entries.filter((t) => t.status === "online").length,
    degraded: entries.filter((t) => t.status === "degraded").length,
    offline: entries.filter((t) => t.status === "offline").length,
    detections: detections.length,
    matched: matched.length,
    unmatched: detections.length - matched.length,
    averageConfidence:
      detections.length === 0 ? 0 : detections.reduce((s, d) => s + d.confidence, 0) / detections.length,
    matchRate: detections.length === 0 ? 0 : matched.length / detections.length,
  };
}

/** Most recent detection per station, for the "Last Detected Track" badges. */
export function lastDetectionByStation(
  detections: Detection[],
): Record<string, Detection> {
  const latest: Record<string, Detection> = {};

  for (const detection of detections) {
    const current = latest[detection.stationId];
    if (!current || detection.detectedAt >= current.detectedAt) {
      latest[detection.stationId] = detection;
    }
  }

  return latest;
}
