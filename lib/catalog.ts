import { reportingStations, totalSpins } from "@/lib/airplay";
import { generateIsrc, normaliseIsrc, parseIsrc } from "@/lib/isrc";
import { FM_STATIONS, REGIONS, type Region } from "@/lib/regions";
import {
  MUSIC_RESEARCHED_ON,
  REFERENCE_RECORDINGS,
} from "@/lib/artist-library";
import { blankAirplay, type Track } from "@/lib/types";

/** Actual sourced releases. No masters, ISRCs, ownership or airplay are invented. */
export function buildSeedTracks(_now: Date = new Date()): Track[] {
  void _now; // Kept for compatibility: release facts do not shift with the caller’s clock.
  return REFERENCE_RECORDINGS.map((recording) => ({
    id: `ref_${recording.id}`,
    title: recording.title,
    primaryArtist: recording.primaryArtists.join(" · "),
    primaryArtists: [...recording.primaryArtists],
    featuredArtists: [...recording.featuredArtists],
    genre: recording.genre,
    releaseDate: recording.releaseDate,
    isrc: "",
    audio: {
      fileName: "",
      format: null,
      mimeType: "",
      sizeBytes: 0,
      durationSec: recording.durationSec,
      storedName: null,
    },
    status: "reference",
    origin: "public-reference",
    referenceId: recording.id,
    uploadedAt: `${MUSIC_RESEARCHED_ON}T00:00:00Z`,
    totalSpins: 0,
    reportingStations: 0,
    airplay: blankAirplay(),
  }));
}

/** Only these obsolete, asset-less demo rows are removed. User deliveries are retained. */
export function migrateLegacyCatalogue(tracks: Track[]): {
  tracks: Track[];
  changed: boolean;
} {
  const legacyIds = new Set(
    Array.from({ length: 7 }, (_, index) => `trk_0${index + 1}`),
  );
  const isLegacy = (track: Track) =>
    legacyIds.has(track.id) &&
    !track.audio?.storedName &&
    /^UG-ESD-26-0000[1-7]$/.test(track.isrc);
  if (!tracks.some(isLegacy)) return { tracks, changed: false };
  const retained = tracks.filter((track) => !isLegacy(track));
  const ids = new Set(retained.map((track) => track.id));
  return {
    tracks: [
      ...retained,
      ...buildSeedTracks().filter((track) => !ids.has(track.id)),
    ],
    changed: true,
  };
}

/**
 * Build a delivered master with zero observed airplay. Uploading audio is not a
 * broadcast detection, a registry assignment or a grant of rights.
 */
export function buildTrack(input: {
  id: string;
  title: string;
  primaryArtist: string;
  featuredArtists: string[];
  genre?: string;
  releaseDate: string;
  isrc: string;
  fileName: string;
  format: "MP3" | "WAV";
  mimeType: string;
  sizeBytes: number;
  durationSec: number | null;
  storedName: string | null;
  now?: Date;
}): Track {
  const now = input.now ?? new Date();
  const airplay = blankAirplay();

  return {
    id: input.id,
    title: input.title,
    primaryArtist: input.primaryArtist,
    featuredArtists: input.featuredArtists,
    genre: input.genre,
    releaseDate: input.releaseDate,
    isrc: normaliseIsrc(input.isrc) ?? input.isrc.toUpperCase(),
    audio: {
      fileName: input.fileName,
      format: input.format,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      durationSec: input.durationSec,
      storedName: input.storedName,
    },
    status: "processing",
    origin: "delivered",
    uploadedAt: now.toISOString(),
    totalSpins: totalSpins(airplay),
    reportingStations: reportingStations(airplay),
    airplay,
  };
}

/** Next free designation number for a registrant/year pair. */
export function nextDesignation(existing: Track[], isrc: string): number {
  const parts = parseIsrc(isrc);
  if (!parts) return 1;

  const used = existing
    .map((t) => parseIsrc(t.isrc))
    .filter((p): p is NonNullable<ReturnType<typeof parseIsrc>> => p !== null)
    .filter((p) => p.registrant === parts.registrant && p.year === parts.year)
    .map((p) => Number(p.designation));

  return used.length === 0 ? 1 : Math.min(99_999, Math.max(...used) + 1);
}

export function suggestIsrc(
  existing: Track[],
  registrant: string,
  releaseDate: string,
): string {
  const year = Number(releaseDate.slice(0, 4)) || new Date().getUTCFullYear();
  const candidate = generateIsrc({ registrant, year, designation: 1 });
  return generateIsrc({
    registrant,
    year,
    designation: nextDesignation(existing, candidate),
  });
}

export const PANEL_SIZE = FM_STATIONS.length;
export const PANEL_REGIONS: Region[] = [...REGIONS];
