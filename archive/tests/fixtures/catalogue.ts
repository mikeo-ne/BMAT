import { generateAirplay, reportingStations, totalSpins } from "@/lib/airplay";
import type { Track } from "@/lib/types";

/**
 * Synthetic test-only fixtures. Never imported by application code or stored as the
 * real artist catalogue. All names and counts below are deliberately generic.
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
    id: "qa_01",
    title: "Fixture A",
    primaryArtist: "QA Artist Alpha",
    featuredArtists: ["QA Guest One"],
    genre: "Luganda pop",
    releaseDate: "2026-07-24",
    isrc: "UG-ESD-26-00001",
    fileName: "QA Artist Alpha - Fixture A.mp3",
    format: "MP3",
    sizeBytes: 9_216_512,
    durationSec: 214,
    status: "live",
    daysAgo: 6,
  },
  {
    id: "qa_02",
    title: "Fixture B",
    primaryArtist: "QA Artist Beta",
    featuredArtists: [],
    genre: "Afro-fusion",
    releaseDate: "2026-06-05",
    isrc: "UG-ESD-26-00002",
    fileName: "QA Artist Beta - Fixture B.wav",
    format: "WAV",
    sizeBytes: 41_223_168,
    durationSec: 247,
    status: "live",
    daysAgo: 32,
  },
  {
    id: "qa_03",
    title: "Fixture C",
    primaryArtist: "QA Ensemble",
    featuredArtists: ["QA Guest Two", "QA Guest Three"],
    genre: "Kidandali",
    releaseDate: "2026-08-14",
    isrc: "UG-ESD-26-00003",
    fileName: "QA Ensemble - Fixture C.mp3",
    format: "MP3",
    sizeBytes: 7_982_144,
    durationSec: 189,
    status: "live",
    daysAgo: 4,
  },
  {
    id: "qa_04",
    title: "Fixture D",
    primaryArtist: "QA Artist Gamma",
    featuredArtists: [],
    genre: "Afrobeats",
    releaseDate: "2026-03-20",
    isrc: "UG-ESD-26-00004",
    fileName: "QA Artist Gamma - Fixture D.mp3",
    format: "MP3",
    sizeBytes: 8_642_048,
    durationSec: 203,
    status: "live",
    daysAgo: 96,
  },
  {
    id: "qa_05",
    title: "Fixture E",
    primaryArtist: "QA Artist Delta",
    featuredArtists: ["QA Artist Alpha"],
    genre: "Afrobeats",
    releaseDate: "2026-08-28",
    isrc: "UG-ESD-26-00005",
    fileName: "QA Artist Delta - Fixture E.wav",
    format: "WAV",
    sizeBytes: 36_700_160,
    durationSec: 178,
    status: "live",
    daysAgo: 1,
  },
  {
    id: "qa_06",
    title: "Fixture F",
    primaryArtist: "QA Guest Two",
    featuredArtists: [],
    genre: "Kidandali",
    releaseDate: "2026-05-02",
    isrc: "UG-ESD-26-00006",
    fileName: "QA Guest Two - Fixture F.mp3",
    format: "MP3",
    sizeBytes: 6_815_744,
    durationSec: 231,
    status: "live",
    daysAgo: 58,
  },
  {
    id: "qa_07",
    title: "Fixture G",
    primaryArtist: "QA Artist Alpha",
    featuredArtists: ["QA Artist Beta"],
    genre: "Luganda pop",
    releaseDate: "2026-07-19",
    isrc: "UG-ESD-26-00007",
    fileName: "QA Artist Alpha - Fixture G.mp3",
    format: "MP3",
    sizeBytes: 7_442_180,
    durationSec: 214,
    status: "live",
    daysAgo: 46,
  },
];

export function buildFixtureTracks(now: Date = new Date()): Track[] {
  return SEED_ROWS.map((row) => {
    const uploaded = new Date(now);
    uploaded.setUTCDate(uploaded.getUTCDate() - row.daysAgo);
    uploaded.setUTCHours(9, 15, 0, 0);

    const airplay = generateAirplay({
      seed: row.isrc,
      releaseDate: row.releaseDate,
      now,
    });

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
      origin: "test-fixture",
      uploadedAt: uploaded.toISOString(),
      totalSpins: totalSpins(airplay),
      reportingStations: reportingStations(airplay),
      airplay,
    } satisfies Track;
  });
}
