import { currentCapturedWindow } from "@/lib/captured-airplay";
import { eatDate, type BroadcastSpin } from "@/lib/playout";
import type { Region } from "@/lib/regions";

/** Minimal public reporting fields: no evidence URLs, artist names, rights, providers or recipient settings. */
export type PublicCaptureRecord = Pick<
  BroadcastSpin,
  "detectedAt" | "region" | "stationId" | "trackId"
> & { source: "captured" };
export function publicCaptureRecords(
  events: BroadcastSpin[],
  now: string,
): PublicCaptureRecord[] {
  return currentCapturedWindow(events, new Date(now)).map(
    ({ detectedAt, region, stationId, trackId }) => ({
      source: "captured" as const,
      detectedAt,
      region,
      stationId,
      trackId,
    }),
  );
}
export function filterPublicCaptures(
  records: PublicCaptureRecord[],
  now: string,
  days: 7 | 14,
  region: Region | "All" = "All",
): PublicCaptureRecord[] {
  const end = Date.parse(now);
  const start =
    Date.parse(`${eatDate(now)}T00:00:00+03:00`) - (days - 1) * 86400000;
  return records.filter((record) => {
    const at = Date.parse(record.detectedAt);
    return (
      record.source === "captured" &&
      Number.isFinite(at) &&
      at >= start &&
      at <= end &&
      (region === "All" || record.region === region)
    );
  });
}
export function summarisePublicCaptures(records: PublicCaptureRecord[]) {
  const matched = records.filter((record) => record.trackId !== null);
  return {
    total: records.length,
    stations: new Set(records.map((record) => record.stationId)).size,
    recordings: new Set(matched.map((record) => record.trackId)).size,
    matchRate: records.length ? matched.length / records.length : null,
  };
}
