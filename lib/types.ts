import { REGIONS, type Region } from "@/lib/regions";
import type { DeliveryOwnership } from "@/lib/delivery-splits";

export type AudioFormat = "MP3" | "WAV";

export type TrackStatus = "processing" | "live" | "rejected" | "reference";

export interface RegionAirplay {
  region: Region;
  spins: number;
  stations: number;
  audience: number;
  /** Last 14 reporting days, oldest first. */
  trend: number[];
}

export interface TrackAudio {
  fileName: string;
  format: AudioFormat | null;
  mimeType: string;
  sizeBytes: number;
  durationSec: number | null;
  /** Server-side stored name under `.data/uploads/`, null for seeded fixtures. */
  storedName: string | null;
  /** Opaque server-side object reference; stripped from every client/API projection. */
  blob?: { provider: "vercel-blob"; uploadId: string; etag: string };
  /** Object URL for the staged file, client-side only. */
  previewUrl?: string;
}

export interface AudioSignature {
  version: 1;
  algorithm: "pcm-rms-fft-v1";
  sourceSha256: string;
  digest: string;
  sampleRate: 11025;
  durationSec: number;
  analysedSec: number;
  waveform: number[];
  bands: number[];
}

export interface Track {
  /** Immutable server-assigned owner; never accepted from an upload form. */
  ownerId?: string;
  agreementId?: string;
  fingerprint?: AudioSignature;
  publicCharts?: boolean;
  id: string;
  origin?: "public-reference" | "delivered" | "test-fixture";
  referenceId?: string;
  primaryArtists?: string[];
  title: string;
  primaryArtist: string;
  featuredArtists: string[];
  /** Ugandan radio format the recording is worked to, e.g. "Kidandali". */
  genre?: string;
  releaseDate: string;
  /** Empty until provided by an authoritative source; never inferred from a platform ID. */
  isrc: string;
  audio: TrackAudio;
  status: TrackStatus;
  uploadedAt: string;
  /** Total spins across the whole Ugandan FM panel. */
  totalSpins: number;
  reportingStations: number;
  airplay: RegionAirplay[];
  /** Approved delivery splits; absent on the original seeded catalogue. */
  ownership?: DeliveryOwnership;
}

export interface CatalogSummary {
  totalTracks: number;
  totalSpins: number;
  reportingStations: number;
  totalAudience: number;
  byRegion: Record<Region, RegionAirplay>;
  averageSpinsPerTrack: number;
}

export function emptyRegionAirplay(region: Region): RegionAirplay {
  return {
    region,
    spins: 0,
    stations: 0,
    audience: 0,
    trend: Array.from({ length: 14 }, () => 0),
  };
}

export function blankAirplay(): RegionAirplay[] {
  return REGIONS.map(emptyRegionAirplay);
}

/** Spins recorded in the last 7 reporting days, summed across regions. */
export function last7DaysSpins(track: Track): number {
  return track.airplay.reduce(
    (sum, r) => sum + r.trend.slice(-7).reduce((a, b) => a + b, 0),
    0,
  );
}

/** Region contributing the most spins to a track; Central as a tie-break. */
export function dominantRegion(track: Track): Region {
  return track.airplay.reduce<Region>((best, entry) => {
    const bestSpins = track.airplay.find((a) => a.region === best)?.spins ?? 0;
    return entry.spins > bestSpins ? entry.region : best;
  }, "Central" as Region);
}

/** Combined 14-day curve for a track, optionally limited to one region. */
export function trendFor(track: Track, region: Region | "All"): number[] {
  const entries =
    region === "All"
      ? track.airplay
      : track.airplay.filter((a) => a.region === region);
  const length = Math.max(0, ...entries.map((e) => e.trend.length));
  return Array.from({ length }, (_, i) =>
    entries.reduce((sum, e) => sum + (e.trend[i] ?? 0), 0),
  );
}

export function spinsFor(track: Track, region: Region | "All"): number {
  return region === "All"
    ? track.totalSpins
    : (track.airplay.find((a) => a.region === region)?.spins ?? 0);
}

export function stationsFor(track: Track, region: Region | "All"): number {
  return region === "All"
    ? track.reportingStations
    : (track.airplay.find((a) => a.region === region)?.stations ?? 0);
}

export function weekOverWeek(track: Track): number | null {
  const recent = track.airplay.reduce(
    (s, r) => s + r.trend.slice(-7).reduce((a, b) => a + b, 0),
    0,
  );
  const prior = track.airplay.reduce(
    (s, r) => s + r.trend.slice(-14, -7).reduce((a, b) => a + b, 0),
    0,
  );
  if (prior === 0) return recent > 0 ? null : 0;
  return (recent - prior) / prior;
}

export function summariseCatalog(tracks: Track[]): CatalogSummary {
  const byRegion = Object.fromEntries(
    REGIONS.map((region) => [region, emptyRegionAirplay(region)]),
  ) as Record<Region, RegionAirplay>;

  let totalSpins = 0;
  const stationIds = new Set<string>();

  for (const track of tracks) {
    totalSpins += track.totalSpins;

    for (const entry of track.airplay) {
      const bucket = byRegion[entry.region] ?? emptyRegionAirplay(entry.region);
      bucket.spins += entry.spins;
      bucket.stations += entry.stations;
      bucket.audience += entry.audience;
      bucket.trend = bucket.trend.map((v, i) => v + (entry.trend[i] ?? 0));
      byRegion[entry.region] = bucket;
    }
  }

  for (const track of tracks) {
    for (const entry of track.airplay) {
      if (entry.spins > 0) stationIds.add(`${track.id}:${entry.region}`);
    }
  }

  return {
    totalTracks: tracks.length,
    totalSpins,
    reportingStations: stationIds.size,
    totalAudience: Object.values(byRegion).reduce((s, r) => s + r.audience, 0),
    byRegion,
    averageSpinsPerTrack: tracks.length === 0 ? 0 : totalSpins / tracks.length,
  };
}
