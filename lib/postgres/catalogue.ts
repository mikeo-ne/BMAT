import "server-only";
import type { Pool, PoolClient } from "pg";
import { buildSeedTracks } from "@/lib/catalog";
import { FM_STATIONS } from "@/lib/regions";
import { MONITORED_STATIONS } from "@/lib/monitoring";
import { normaliseIsrc, generateIsrc } from "@/lib/isrc";
import type { Track } from "@/lib/types";
import {
  inTransaction,
  postgresPool,
  postgresTenant,
} from "@/lib/postgres/pool";

type Database = Pool | PoolClient;
async function insertTrack(
  db: Database,
  tenant: string,
  track: Track,
  ignoreExisting = false,
) {
  return db.query(
    `INSERT INTO east_sound.tracks(tenant_id, external_key, isrc, title, artist_name, genre, release_date, duration_seconds, metadata)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
    ${ignoreExisting ? "ON CONFLICT (tenant_id, external_key) DO NOTHING" : ""} RETURNING id`,
    [
      tenant,
      track.id,
      track.isrc ? normaliseIsrc(track.isrc) : null,
      track.title,
      track.primaryArtist,
      track.genre ?? null,
      track.releaseDate,
      track.audio.durationSec,
      JSON.stringify(track),
    ],
  );
}
/** Public references and disconnected station directory only; never captures or rights. */
export async function seedPostgres(
  pool: Pool,
  tenant: string,
  name = "East Sound workspace",
) {
  return inTransaction(pool, async (db) => {
    await db.query(
      "INSERT INTO east_sound.tenants(id, name) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING",
      [tenant, name],
    );
    const directory = FM_STATIONS.map((s) => ({
      ...s,
      medium: "fm",
      frequency:
        MONITORED_STATIONS.find((row) => row.id === s.id)?.frequency ?? null,
    }));
    const tv = MONITORED_STATIONS.filter((s) => s.medium === "TV").map((s) => ({
      ...s,
      medium: "tv",
    }));
    for (const station of [...directory, ...tv])
      await db.query(
        `INSERT INTO east_sound.stations(tenant_id, external_key, name, frequency, region, location, stream_type)
        VALUES ($1,$2,$3,$4,$5,$6,$7::east_sound.stream_type_enum) ON CONFLICT (tenant_id, external_key) DO NOTHING`,
        [
          tenant,
          station.id,
          station.name,
          station.frequency,
          station.region,
          station.location,
          station.medium,
        ],
      );
    let references = 0;
    for (const track of buildSeedTracks())
      references += (await insertTrack(db, tenant, track, true)).rowCount ?? 0;
    return { referencesInserted: references, captureRecordsInserted: 0 };
  });
}
export async function readPostgresTracks(): Promise<Track[]> {
  const result = await postgresPool().query<{ metadata: Track }>(
    `SELECT metadata FROM east_sound.tracks
    WHERE tenant_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC, external_key`,
    [postgresTenant()],
  );
  return result.rows.map((row) => row.metadata);
}
export async function addPostgresTrack(
  track: Track,
  db: Database = postgresPool(),
): Promise<Track> {
  await insertTrack(db, postgresTenant(), track);
  return track;
}
export async function deletePostgresTrack(
  externalKey: string,
): Promise<{ deleted: boolean; track?: Track }> {
  const result = await postgresPool().query<{ metadata: Track }>(
    `UPDATE east_sound.tracks SET deleted_at=clock_timestamp()
    WHERE tenant_id=$1 AND external_key=$2 AND deleted_at IS NULL RETURNING metadata`,
    [postgresTenant(), externalKey],
  );
  return result.rows[0]
    ? { deleted: true, track: result.rows[0].metadata }
    : { deleted: false };
}
export async function reservePostgresIsrc(
  releaseDate: string,
): Promise<string> {
  const year = Number(releaseDate.slice(2, 4));
  return inTransaction(postgresPool(), async (db) => {
    const pattern = `UG-ESD-${String(year).padStart(2, "0")}-`;
    const highest = await db.query<{ maximum: number }>(
      `SELECT coalesce(max(substring(isrc from 11 for 5)::int),0)::int AS maximum
      FROM (SELECT isrc FROM east_sound.tracks WHERE isrc LIKE $1
        UNION ALL SELECT isrc FROM east_sound.isrc_reservations WHERE isrc LIKE $1) known`,
      [pattern + "%"],
    );
    const maximum = highest.rows[0].maximum;
    if (maximum >= 99999)
      throw new RangeError(
        "Local designation pool exhausted for that reference year.",
      );
    let next: number;
    try {
      const counter = await db.query<{ designation: number }>(
        `INSERT INTO east_sound.isrc_counters(reference_year, designation) VALUES ($1,$2+1)
        ON CONFLICT (reference_year) DO UPDATE SET designation=greatest(east_sound.isrc_counters.designation,$2)+1 RETURNING designation`,
        [year, maximum],
      );
      next = counter.rows[0].designation;
    } catch (error) {
      if (
        (error as { constraint?: string }).constraint ===
        "isrc_counters_designation_check"
      )
        throw new RangeError(
          "Local designation pool exhausted for that reference year.",
        );
      throw error;
    }
    const isrc = generateIsrc({
      registrant: "ESD",
      year: Number(releaseDate.slice(0, 4)),
      designation: next,
    });
    await db.query(
      "INSERT INTO east_sound.isrc_reservations(isrc,tenant_id) VALUES($1,$2)",
      [isrc, postgresTenant()],
    );
    return isrc;
  });
}
