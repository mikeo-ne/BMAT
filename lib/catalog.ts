import { generateAirplay, reportingStations, totalSpins } from "@/lib/airplay";
import { generateIsrc, normaliseIsrc, parseIsrc } from "@/lib/isrc";
import { FM_STATIONS, REGIONS, type Region } from "@/lib/regions";
import type { Track } from "@/lib/types";

/**
 * Synthetic catalogue used to seed a fresh East Sound instance so the portal renders
 * with data in it. Every row here is invented demo data — names, ISRCs and spin
 * counts are not real reporting for real artists.
 */

interface SeedRow {
  id: string;
  title: string;
  primaryArtist: string;
  featuredArtists: string[];
  genre: string;
  releaseDate: string;
  isrc: string;
  fileName: string;
  format: "MP3" | "WAV";
  sizeBytes: number;
  durationSec: number;
  status: Track["status"];
  daysAgo: number;
}

const SEED_ROWS: SeedRow[] = [
  {
    id: "trk_01",
    title: "Nkwagala",
    primaryArtist: "Ray Bwete",
    featuredArtists: ["Aisha Nakato"],
    genre: "Luganda pop",
    releaseDate: "2026-07-24",
    isrc: "UG-ESD-26-00001",
    fileName: "Ray Bwete - Nkwagala.mp3",
    format: "MP3",
    sizeBytes: 9_216_512,
    durationSec: 214,
    status: "live",
    daysAgo: 6,
  },
  {
    id: "trk_02",
    title: "Omukwano",
    primaryArtist: "Doreen Achieng",
    featuredArtists: [],
    genre: "Afro-fusion",
    releaseDate: "2026-06-05",
    isrc: "UG-ESD-26-00002",
    fileName: "Doreen Achieng - Omukwano.wav",
    format: "WAV",
    sizeBytes: 41_223_168,
    durationSec: 247,
    status: "live",
    daysAgo: 32,
  },
  {
    id: "trk_03",
    title: "Mulongo",
    primaryArtist: "Mukisa Collective",
    featuredArtists: ["Peter Okoth", "Lillian Kyomukama"],
    genre: "Kidandali",
    releaseDate: "2026-08-14",
    isrc: "UG-ESD-26-00003",
    fileName: "Mukisa Collective - Mulongo.mp3",
    format: "MP3",
    sizeBytes: 7_982_144,
    durationSec: 189,
    status: "live",
    daysAgo: 4,
  },
  {
    id: "trk_04",
    title: "Ggwe Ondabika",
    primaryArtist: "Kasese Sound System",
    featuredArtists: [],
    genre: "Afrobeats",
    releaseDate: "2026-03-20",
    isrc: "UG-ESD-26-00004",
    fileName: "Kasese Sound System - Ggwe Ondabika.mp3",
    format: "MP3",
    sizeBytes: 8_642_048,
    durationSec: 203,
    status: "live",
    daysAgo: 96,
  },
  {
    id: "trk_05",
    title: "Boda Boda Anthem",
    primaryArtist: "Tessy Nakimuli",
    featuredArtists: ["Ray Bwete"],
    genre: "Afrobeats",
    releaseDate: "2026-08-28",
    isrc: "UG-ESD-26-00005",
    fileName: "Tessy Nakimuli - Boda Boda Anthem.wav",
    format: "WAV",
    sizeBytes: 36_700_160,
    durationSec: 178,
    status: "live",
    daysAgo: 1,
  },
  {
    id: "trk_06",
    title: "Nalongo",
    primaryArtist: "Peter Okoth",
    featuredArtists: [],
    genre: "Kidandali",
    releaseDate: "2026-05-02",
    isrc: "UG-ESD-26-00006",
    fileName: "Peter Okoth - Nalongo.mp3",
    format: "MP3",
    sizeBytes: 6_815_744,
    durationSec: 231,
    status: "live",
    daysAgo: 58,
  },
  {
    id: "trk_07",
    title: "Katono",
    primaryArtist: "Ray Bwete",
    featuredArtists: ["Doreen Achieng"],
    genre: "Luganda pop",
    releaseDate: "2026-07-19",
    isrc: "UG-ESD-26-00007",
    fileName: "Ray Bwete - Katono.mp3",
    format: "MP3",
    sizeBytes: 7_442_180,
    durationSec: 214,
    status: "live",
    daysAgo: 46,
  },
];

export function buildSeedTracks(now: Date = new Date()): Track[] {
  return SEED_ROWS.map((row) => {
    const uploaded = new Date(now);
    uploaded.setUTCDate(uploaded.getUTCDate() - row.daysAgo);
    uploaded.setUTCHours(9, 15, 0, 0);

    const airplay = generateAirplay({ seed: row.isrc, releaseDate: row.releaseDate, now });

    return {
      id: row.id,
      title: row.title,
      primaryArtist: row.primaryArtist,
      featuredArtists: row.featuredArtists,
      genre: row.genre,
      releaseDate: row.releaseDate,
      isrc: row.isrc,
      audio: {
        fileName: row.fileName,
        format: row.format,
        mimeType: row.format === "MP3" ? "audio/mpeg" : "audio/wav",
        sizeBytes: row.sizeBytes,
        durationSec: row.durationSec,
        storedName: null,
      },
      status: row.status,
      uploadedAt: uploaded.toISOString(),
      totalSpins: totalSpins(airplay),
      reportingStations: reportingStations(airplay),
      airplay,
    } satisfies Track;
  });
}

/**
 * Builds a live track from a freshly delivered master: assigns the next ISRC in
 * the registrant's year block and models its first panel read-out.
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
  const airplay = generateAirplay({ seed: `${input.isrc}:${input.id}`, releaseDate: input.releaseDate, now });

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
    status: "live",
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

export function suggestIsrc(existing: Track[], registrant: string, releaseDate: string): string {
  const year = Number(releaseDate.slice(0, 4)) || new Date().getUTCFullYear();
  const candidate = generateIsrc({ registrant, year, designation: 1 });
  return generateIsrc({ registrant, year, designation: nextDesignation(existing, candidate) });
}

export const PANEL_SIZE = FM_STATIONS.length;
export const PANEL_REGIONS: Region[] = [...REGIONS];
