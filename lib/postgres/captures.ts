import "server-only";
import { isStoredCapturedSpin } from "@/lib/captured-airplay";
import type { BroadcastSpin } from "@/lib/playout";
import {
  inTransaction,
  postgresPool,
  postgresTenant,
} from "@/lib/postgres/pool";

export class CaptureIdentityConflict extends Error {
  constructor() {
    super(
      "A provider event ID already identifies a different immutable capture.",
    );
  }
}
export async function readPostgresSpins(): Promise<BroadcastSpin[]> {
  const rows = await postgresPool().query<{ record: unknown }>(
    `SELECT record FROM east_sound.airplay_logs
    WHERE tenant_id=$1 AND record->>'medium' IN ('FM','TV') ORDER BY played_at DESC,id DESC`,
    [postgresTenant()],
  );
  const values = rows.rows.map((row) => row.record);
  if (values.some((row) => !isStoredCapturedSpin(row)))
    throw new Error(
      "Invalid PostgreSQL capture data; no automatic reset is permitted.",
    );
  return values as BroadcastSpin[];
}
/** Log, global dedup key, FM counters and matching outbox jobs commit together. */
export async function appendPostgresSpins(
  incoming: BroadcastSpin[],
): Promise<{ inserted: number; duplicates: number }> {
  if (
    !incoming.length ||
    incoming.length > 100 ||
    incoming.some((spin) => !isStoredCapturedSpin(spin))
  )
    throw new Error("Send 1–100 validated captured records.");
  const tenant = postgresTenant();
  try {
    return await inTransaction(postgresPool(), async (db) => {
      // Consistent lock order prevents cycles between transactions containing several tracks/months.
      const ordered = [...incoming].sort(
        (a, b) =>
          (a.trackId ?? "~").localeCompare(b.trackId ?? "~") ||
          a.detectedAt.localeCompare(b.detectedAt) ||
          a.id.localeCompare(b.id),
      );
      for (const month of [
        ...new Set(incoming.map((spin) => spin.detectedAt.slice(0, 7))),
      ].sort())
        await db.query(
          "SELECT east_sound.ensure_airplay_partition($1::timestamptz)",
          [month + "-01T00:00:00Z"],
        );
      const stations = (
        await db.query<{ id: string; external_key: string }>(
          "SELECT id,external_key FROM east_sound.stations WHERE tenant_id=$1",
          [tenant],
        )
      ).rows;
      const tracks = (
        await db.query<{ id: string; external_key: string }>(
          "SELECT id,external_key FROM east_sound.tracks WHERE tenant_id=$1 AND deleted_at IS NULL",
          [tenant],
        )
      ).rows;
      let inserted = 0;
      for (const spin of ordered) {
        const station = stations.find(
          (row) => row.external_key === spin.stationId,
        );
        const track = tracks.find((row) => row.external_key === spin.trackId);
        if (!station || (spin.trackId && !track))
          throw new Error("Capture station or track is not in this workspace.");
        const row = await db.query(
          `INSERT INTO east_sound.airplay_logs(tenant_id,provider_event_id,station_id,track_id,played_at,
          duration_played,confidence_score,detected_isrc,audio_snippet_url,audio_snippet_sha256,snippet_duration)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
          [
            tenant,
            spin.id,
            station.id,
            track?.id ?? null,
            spin.detectedAt,
            spin.durationSec,
            spin.confidence * 100,
            spin.isrc,
            spin.evidence?.url ?? null,
            spin.evidence?.sha256 ?? null,
            spin.evidence ? 10 : null,
          ],
        );
        inserted += row.rowCount ?? 0;
      }
      return { inserted, duplicates: incoming.length - inserted };
    });
  } catch (error) {
    if (
      (error as { constraint?: string }).constraint ===
      "airplay_provider_event_conflict"
    )
      throw new CaptureIdentityConflict();
    throw error;
  }
}
