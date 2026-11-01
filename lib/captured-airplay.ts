import { isValidIsoDate } from "@/lib/format";
import { isValidIsrc, normaliseIsrc } from "@/lib/isrc";
import { FM_STATIONS, REGIONS } from "@/lib/regions";
import { blankAirplay, type Track } from "@/lib/types";
import { eatDate, type BroadcastSpin } from "@/lib/playout";
import { publicHttpsUrl } from "@/lib/public-url";

const TV_STATIONS = [
  { id: "nbs-tv-kla", name: "NBS TV", region: "Central" as const },
];

export function parseCapturedSpins(
  input: unknown,
  catalogue: Track[],
  now = new Date(),
): { spins: BroadcastSpin[]; errors: string[] } {
  const rows =
    input && typeof input === "object" && "records" in input
      ? (input as { records: unknown }).records
      : null;
  if (!Array.isArray(rows) || !rows.length || rows.length > 100)
    return { spins: [], errors: ["Send between 1 and 100 captured records."] };
  const errors: string[] = [];
  const spins: BroadcastSpin[] = [];
  for (const [index, raw] of rows.entries()) {
    const prefix = `Record ${index + 1}: `;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      errors.push(prefix + "invalid object.");
      continue;
    }
    const row = raw as Record<string, unknown>;
    if (row.source !== "captured") {
      errors.push(
        prefix +
          "only explicitly captured events are accepted; simulations cannot enter the audit log.",
      );
      continue;
    }
    const station = [...FM_STATIONS, ...TV_STATIONS].find(
      (entry) => entry.id === row.stationId,
    );
    const track = catalogue.find((entry) => entry.id === row.trackId);
    const timestamp =
      typeof row.detectedAt === "string" ? Date.parse(row.detectedAt) : NaN;
    if (typeof row.id !== "string" || !/^[a-zA-Z0-9:_-]{1,160}$/.test(row.id)) {
      errors.push(prefix + "a stable provider event ID is required.");
      continue;
    }
    if (!station) {
      errors.push(prefix + "unknown station ID.");
      continue;
    }
    if (
      !Number.isFinite(timestamp) ||
      timestamp > now.getTime() ||
      !/^\d{4}-\d{2}-\d{2}T/.test(String(row.detectedAt)) ||
      !/(?:Z|[+-]\d{2}:\d{2})$/.test(String(row.detectedAt)) ||
      !isValidIsoDate(String(row.detectedAt).slice(0, 10))
    ) {
      errors.push(prefix + "provide a valid, non-future broadcast timestamp.");
      continue;
    }
    if (row.trackId !== null && row.trackId !== undefined && !track) {
      errors.push(prefix + "unknown catalogue recording.");
      continue;
    }
    if (
      track &&
      eatDate(new Date(timestamp).toISOString()) < track.releaseDate
    ) {
      errors.push(prefix + "broadcast predates the selected release edition.");
      continue;
    }
    if (
      typeof row.durationSec !== "number" ||
      !Number.isFinite(row.durationSec) ||
      row.durationSec <= 0 ||
      row.durationSec > 86400
    ) {
      errors.push(prefix + "invalid broadcast duration.");
      continue;
    }
    if (
      typeof row.confidence !== "number" ||
      !Number.isFinite(row.confidence) ||
      row.confidence < 0 ||
      row.confidence > 1
    ) {
      errors.push(prefix + "confidence must be between zero and one.");
      continue;
    }
    if (
      row.isrc != null &&
      row.isrc !== "" &&
      (typeof row.isrc !== "string" || !isValidIsrc(row.isrc))
    ) {
      errors.push(prefix + "invalid supplied ISRC.");
      continue;
    }
    let evidence: BroadcastSpin["evidence"];
    if (row.evidence != null) {
      const clip = row.evidence as Record<string, unknown>;
      if (
        !clip ||
        typeof clip !== "object" ||
        typeof clip.url !== "string" ||
        !publicHttpsUrl(clip.url) ||
        typeof clip.sha256 !== "string" ||
        !/^[a-f\d]{64}$/i.test(clip.sha256) ||
        clip.durationSec !== 10
      ) {
        errors.push(
          prefix +
            "evidence requires a public HTTPS URL, SHA-256 and durationSec: 10.",
        );
        continue;
      }
      evidence = { url: clip.url, sha256: clip.sha256.toLowerCase() };
    }
    spins.push({
      id: row.id,
      stationId: station.id,
      stationName: station.name,
      region: station.region,
      medium: station.id === "nbs-tv-kla" ? "TV" : "FM",
      detectedAt: new Date(timestamp).toISOString(),
      trackId: track?.id ?? null,
      title: track?.title ?? null,
      primaryArtist: track?.primaryArtist ?? null,
      isrc:
        typeof row.isrc === "string" && row.isrc
          ? normaliseIsrc(row.isrc)
          : null,
      durationSec: row.durationSec,
      confidence: row.confidence,
      source: "captured",
      ...(evidence ? { evidence } : {}),
    });
  }
  return { spins: errors.length ? [] : spins, errors };
}

/** Current EAT calendar day and thirteen prior days, never a synthetic reporting window. */
export function currentCapturedWindow(
  events: BroadcastSpin[],
  now = new Date(),
  days = 14,
): BroadcastSpin[] {
  const day = eatDate(now.toISOString());
  const start = Date.parse(`${day}T00:00:00+03:00`) - (days - 1) * 86400000;
  const seen = new Set<string>();
  return events.filter((spin) => {
    const at = Date.parse(spin.detectedAt);
    if (
      spin.source !== "captured" ||
      !Number.isFinite(at) ||
      at < start ||
      at > now.getTime() ||
      seen.has(spin.id)
    )
      return false;
    seen.add(spin.id);
    return true;
  });
}

export function catalogueWithCapturedStats(
  catalogue: Track[],
  events: BroadcastSpin[],
  now = new Date(),
): Track[] {
  const window = currentCapturedWindow(events, now);
  const days = Array.from({ length: 14 }, (_, index) =>
    new Date(
      Date.parse(`${eatDate(now.toISOString())}T00:00:00+03:00`) -
        (13 - index) * 86400000 +
        3 * 3600000,
    )
      .toISOString()
      .slice(0, 10),
  );
  return catalogue.map((track) => {
    const matched = window.filter((event) => event.trackId === track.id);
    const airplay = blankAirplay();
    for (const region of REGIONS) {
      const regional = matched.filter((event) => event.region === region);
      const bucket = airplay.find((entry) => entry.region === region)!;
      bucket.spins = regional.length;
      bucket.stations = new Set(regional.map((event) => event.stationId)).size;
      bucket.trend = days.map(
        (day) =>
          regional.filter((event) => eatDate(event.detectedAt) === day).length,
      );
      // Reach is unknown without a licensed audience source. Never impute a listener count.
      bucket.audience = 0;
    }
    return {
      ...track,
      totalSpins: matched.length,
      reportingStations: new Set(matched.map((event) => event.stationId)).size,
      airplay,
    };
  });
}

/** Validate persisted capture shape independently of the current catalogue (deleted works retain their audit history). */
export function isStoredCapturedSpin(value: unknown): value is BroadcastSpin {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const station = [...FM_STATIONS, ...TV_STATIONS].find(
    (entry) => entry.id === row.stationId,
  );
  if (
    !station ||
    row.stationName !== station.name ||
    row.region !== station.region ||
    row.medium !== (station.id === "nbs-tv-kla" ? "TV" : "FM") ||
    row.source !== "captured" ||
    typeof row.id !== "string" ||
    !/^[a-zA-Z0-9:_-]{1,160}$/.test(row.id) ||
    typeof row.detectedAt !== "string" ||
    !Number.isFinite(Date.parse(row.detectedAt)) ||
    new Date(row.detectedAt).toISOString() !== row.detectedAt ||
    typeof row.durationSec !== "number" ||
    !Number.isFinite(row.durationSec) ||
    row.durationSec <= 0 ||
    row.durationSec > 86400 ||
    typeof row.confidence !== "number" ||
    !Number.isFinite(row.confidence) ||
    row.confidence < 0 ||
    row.confidence > 1 ||
    (row.isrc !== null &&
      (typeof row.isrc !== "string" || !isValidIsrc(row.isrc)))
  )
    return false;
  if (row.trackId === null) {
    if (row.title !== null || row.primaryArtist !== null) return false;
  } else if (
    typeof row.trackId !== "string" ||
    !row.trackId ||
    row.trackId.length > 160 ||
    typeof row.title !== "string" ||
    !row.title ||
    row.title.length > 240 ||
    typeof row.primaryArtist !== "string" ||
    !row.primaryArtist ||
    row.primaryArtist.length > 500
  )
    return false;
  if (row.evidence !== undefined) {
    if (
      !row.evidence ||
      typeof row.evidence !== "object" ||
      Array.isArray(row.evidence)
    )
      return false;
    const clip = row.evidence as Record<string, unknown>;
    if (
      typeof clip.url !== "string" ||
      !publicHttpsUrl(clip.url) ||
      typeof clip.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(clip.sha256)
    )
      return false;
  }
  return true;
}
