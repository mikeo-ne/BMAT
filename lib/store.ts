import "server-only";
import {
  referenceStorageOnly,
  assertMutableStorage,
  masterUploadsAvailable,
  MASTER_STORAGE_NOTICE,
} from "@/lib/runtime-storage";
import { postgresStorageEnabled } from "@/lib/postgres/pool";
import {
  readPostgresTracks,
  addPostgresTrack,
  deletePostgresTrack,
  reservePostgresIsrc,
} from "@/lib/postgres/catalogue";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildSeedTracks,
  buildTrack,
  migrateLegacyCatalogue,
} from "@/lib/catalog";
import { isValidIsoDate } from "@/lib/format";
import {
  generateIsrc,
  isValidIsrc,
  normaliseIsrc,
  parseIsrc,
} from "@/lib/isrc";
import type { DeliveryOwnership } from "@/lib/delivery-splits";
import type { AudioSignature, Track } from "@/lib/types";

/** Explicit SQL repository or single-process JSON store. Master bytes remain filesystem-backed. */
export const DATA_DIR =
  process.env.EAST_SOUND_DATA_DIR ?? path.join(process.cwd(), ".data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const TRACKS_FILE = path.join(DATA_DIR, "tracks.json");
const RESERVATIONS_FILE = path.join(DATA_DIR, "isrc-reservations.json");
let mutations: Promise<unknown> = Promise.resolve();
function serialise<T>(operation: () => Promise<T>): Promise<T> {
  const next = mutations.then(operation);
  mutations = next.catch(() => undefined);
  return next;
}
async function ensureDirs() {
  await mkdir(UPLOAD_DIR, { recursive: true, mode: 0o700 });
}
async function atomicJson(file: string, value: unknown): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2), {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}
function parseCatalogue(raw: string): Track[] {
  const value: unknown = JSON.parse(raw);
  if (
    !Array.isArray(value) ||
    value.some(
      (track) =>
        !track ||
        typeof track !== "object" ||
        typeof track.id !== "string" ||
        !track.id ||
        typeof track.title !== "string" ||
        !track.title ||
        typeof track.primaryArtist !== "string" ||
        !track.primaryArtist ||
        !Array.isArray(track.featuredArtists) ||
        track.featuredArtists.some(
          (artist: unknown) => typeof artist !== "string",
        ) ||
        typeof track.releaseDate !== "string" ||
        !isValidIsoDate(track.releaseDate) ||
        typeof track.isrc !== "string" ||
        (track.isrc !== "" && !isValidIsrc(track.isrc)) ||
        !track.audio ||
        typeof track.audio.fileName !== "string" ||
        !["MP3", "WAV", null].includes(track.audio.format) ||
        (track.audio.storedName !== null &&
          typeof track.audio.storedName !== "string") ||
        !Number.isFinite(track.audio.sizeBytes) ||
        track.audio.sizeBytes < 0 ||
        !["live", "processing", "rejected", "reference"].includes(
          track.status,
        ) ||
        !Array.isArray(track.airplay) ||
        track.airplay.some(
          (row: Track["airplay"][number]) =>
            !row ||
            !["Central", "Eastern", "Western", "Northern"].includes(
              row.region,
            ) ||
            !Array.isArray(row.trend) ||
            row.trend.some((n) => !Number.isFinite(n) || n < 0),
        ),
    )
  )
    throw new Error(
      "Malformed tracks file; restore the catalogue before editing.",
    );
  if (new Set(value.map((track) => track.id)).size !== value.length)
    throw new Error(
      "Duplicate catalogue IDs; restore the catalogue before editing.",
    );
  return value as Track[];
}
export async function readTracks(): Promise<Track[]> {
  if (referenceStorageOnly()) return buildSeedTracks();
  if (postgresStorageEnabled())
    return parseCatalogue(JSON.stringify(await readPostgresTracks()));
  await ensureDirs();
  try {
    const parsed = parseCatalogue(await readFile(TRACKS_FILE, "utf8"));
    if (!Array.isArray(parsed)) throw new Error("Malformed tracks file");
    if (migrateLegacyCatalogue(parsed).changed) {
      return serialise(async () => {
        const latest = parseCatalogue(await readFile(TRACKS_FILE, "utf8"));
        const migrated = migrateLegacyCatalogue(latest);
        if (migrated.changed) await atomicJson(TRACKS_FILE, migrated.tracks);
        return migrated.tracks;
      });
    }
    return parsed;
  } catch (error) {
    // Never overwrite a corrupt or unreadable catalogue with demo data.
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return serialise(async () => {
      try {
        return parseCatalogue(await readFile(TRACKS_FILE, "utf8"));
      } catch (again) {
        if ((again as NodeJS.ErrnoException).code !== "ENOENT") throw again;
        const seeded = buildSeedTracks();
        await atomicJson(TRACKS_FILE, seeded);
        return seeded;
      }
    });
  }
}
export async function writeTracks(tracks: Track[]): Promise<Track[]> {
  assertMutableStorage();
  if (postgresStorageEnabled())
    throw new Error(
      "Bulk JSON catalogue replacement is disabled in PostgreSQL mode. Use explicit migrations and record operations.",
    );
  await ensureDirs();
  return serialise(async () => {
    parseCatalogue(JSON.stringify(tracks));
    await atomicJson(TRACKS_FILE, tracks);
    return tracks;
  });
}

export class DuplicateIsrcError extends Error {
  constructor() {
    super(
      "That ISRC is already in the catalogue. Keep its existing recording or allocate a different tag.",
    );
  }
}
export interface NewTrackInput {
  ownerId?: string;
  fingerprint?: AudioSignature;
  agreementId?: string;
  publicCharts?: boolean;
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
  ownership?: DeliveryOwnership;
}
export async function addTrack(input: NewTrackInput): Promise<Track> {
  assertMutableStorage();
  if (postgresStorageEnabled()) {
    const track = {
      ...buildTrack({ ...input, id: `trk_${randomUUID()}` }),
      ...(input.ownership ? { ownership: input.ownership } : {}),
      ...(input.ownerId ? { ownerId: input.ownerId } : {}),
      ...(input.fingerprint ? { fingerprint: input.fingerprint } : {}),
      ...(input.agreementId ? { agreementId: input.agreementId } : {}),
      publicCharts: input.publicCharts === true,
    };
    try {
      return await addPostgresTrack(track);
    } catch (error) {
      if (
        (error as { constraint?: string }).constraint ===
        "tracks_tenant_isrc_key"
      )
        throw new DuplicateIsrcError();
      throw error;
    }
  }
  await readTracks(); // Ensure the seed exists before entering the mutation queue.
  return serialise(async () => {
    const existing = parseCatalogue(await readFile(TRACKS_FILE, "utf8"));
    if (
      input.agreementId &&
      existing.some((t) => t.agreementId === input.agreementId)
    )
      throw new Error("That release agreement was already delivered.");
    if (
      existing.some(
        (track) => normaliseIsrc(track.isrc) === normaliseIsrc(input.isrc),
      )
    )
      throw new DuplicateIsrcError();
    const track = {
      ...buildTrack({ ...input, id: `trk_${randomUUID().slice(0, 8)}` }),
      ...(input.ownership ? { ownership: input.ownership } : {}),
      ...(input.ownerId ? { ownerId: input.ownerId } : {}),
      ...(input.fingerprint ? { fingerprint: input.fingerprint } : {}),
      ...(input.agreementId ? { agreementId: input.agreementId } : {}),
      publicCharts: input.publicCharts === true,
    };
    await atomicJson(TRACKS_FILE, [track, ...existing]);
    return track;
  });
}
export async function deleteTrack(
  id: string,
): Promise<{ deleted: boolean; track?: Track }> {
  assertMutableStorage();
  if (postgresStorageEnabled()) return deletePostgresTrack(id);
  await readTracks();
  return serialise(async () => {
    const existing = parseCatalogue(await readFile(TRACKS_FILE, "utf8"));
    const track = existing.find((entry) => entry.id === id);
    if (!track) return { deleted: false };
    await atomicJson(
      TRACKS_FILE,
      existing.filter((entry) => entry.id !== id),
    );
    if (track.audio.storedName)
      await rm(path.join(UPLOAD_DIR, path.basename(track.audio.storedName)), {
        force: true,
      });
    return { deleted: true, track };
  });
}
export async function saveUpload(
  buffer: Uint8Array,
  fileName: string,
): Promise<string> {
  if (!masterUploadsAvailable()) throw new Error(MASTER_STORAGE_NOTICE);
  await ensureDirs();
  const storedName = `${randomUUID()}${path.extname(fileName).toLowerCase()}`;
  await writeFile(path.join(UPLOAD_DIR, storedName), buffer, {
    mode: 0o600,
    flag: "wx",
  });
  return storedName;
}
export async function removeUpload(storedName: string): Promise<void> {
  await rm(path.join(UPLOAD_DIR, path.basename(storedName)), { force: true });
}

/** Reserve immediately, so concurrently staged files cannot receive the same local tag. */
export async function reserveIsrc(releaseDate: string): Promise<string> {
  assertMutableStorage();
  if (postgresStorageEnabled()) return reservePostgresIsrc(releaseDate);
  await readTracks();
  return serialise(async () => {
    const existing = parseCatalogue(await readFile(TRACKS_FILE, "utf8"));
    let reservations: string[] = [];
    try {
      reservations = JSON.parse(await readFile(RESERVATIONS_FILE, "utf8"));
      if (
        !Array.isArray(reservations) ||
        reservations.some((value) => typeof value !== "string")
      )
        throw new Error("Malformed ISRC reservations file.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const year = Number(releaseDate.slice(0, 4));
    const block = parseIsrc(generateIsrc({ registrant: "ESD", year }))!;
    const used = [...existing.map((track) => track.isrc), ...reservations]
      .map(parseIsrc)
      .filter(
        (parts) =>
          parts?.country === "UG" &&
          parts.registrant === "ESD" &&
          parts.year === block.year,
      )
      .map((parts) => Number(parts!.designation));
    const designation = Math.max(0, ...used) + 1;
    if (designation > 99_999)
      throw new RangeError(
        "The local ISRC block is exhausted. Use an authorised external registrant code.",
      );
    const isrc = generateIsrc({ registrant: "ESD", year, designation });
    await atomicJson(RESERVATIONS_FILE, [...reservations, isrc]);
    return isrc;
  });
}
