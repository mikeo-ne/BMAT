import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildSeedTracks, buildTrack } from "@/lib/catalog";
import type { Track } from "@/lib/types";

/**
 * Tiny file-backed catalogue store.
 *
 * BMAT has no database wired up yet, so track rows live in `.data/tracks.json`
 * and delivered masters in `.data/uploads/`. Both are gitignored. The read/write
 * surface here is intentionally the same shape a real repository would expose,
 * so swapping in Postgres/Prisma later is a one-file change.
 *
 * The migration target is prisma/schema.prisma (User, Track, RadioStation,
 * AirplayMatch, RoyaltyReport, AdCampaign plus the supporting tables), validated
 * by tests/prisma-schema.test.ts so the schema stays in step with these shapes.
 */

export const DATA_DIR = path.join(process.cwd(), ".data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const TRACKS_FILE = path.join(DATA_DIR, "tracks.json");

async function ensureDirs(): Promise<void> {
  await mkdir(UPLOAD_DIR, { recursive: true });
}

export async function readTracks(): Promise<Track[]> {
  await ensureDirs();

  try {
    const raw = await readFile(TRACKS_FILE, "utf8");
    const parsed = JSON.parse(raw) as Track[];
    if (!Array.isArray(parsed)) throw new Error("Malformed tracks file");
    return parsed;
  } catch {
    const seeded = buildSeedTracks();
    await writeTracks(seeded);
    return seeded;
  }
}

export async function writeTracks(tracks: Track[]): Promise<Track[]> {
  await ensureDirs();
  await writeFile(TRACKS_FILE, JSON.stringify(tracks, null, 2), "utf8");
  return tracks;
}

export interface NewTrackInput {
  title: string;
  primaryArtist: string;
  featuredArtists: string[];
  releaseDate: string;
  isrc: string;
  fileName: string;
  format: "MP3" | "WAV";
  mimeType: string;
  sizeBytes: number;
  durationSec: number | null;
  storedName: string | null;
}

export async function addTrack(input: NewTrackInput): Promise<Track> {
  const existing = await readTracks();
  const id = `trk_${randomUUID().slice(0, 8)}`;

  const track = buildTrack({ ...input, id });

  await writeTracks([track, ...existing]);
  return track;
}

export async function deleteTrack(id: string): Promise<{ deleted: boolean; track?: Track }> {
  const existing = await readTracks();
  const track = existing.find((t) => t.id === id);
  if (!track) return { deleted: false };

  if (track.audio.storedName) {
    await rm(path.join(UPLOAD_DIR, track.audio.storedName), { force: true });
  }

  await writeTracks(existing.filter((t) => t.id !== id));
  return { deleted: true, track };
}

/** Persists a delivered master to disk; returns the stored file name. */
export async function saveUpload(buffer: Uint8Array, fileName: string): Promise<string> {
  await ensureDirs();
  const storedName = `${randomUUID()}${path.extname(fileName).toLowerCase()}`;
  await writeFile(path.join(UPLOAD_DIR, storedName), buffer);
  return storedName;
}
