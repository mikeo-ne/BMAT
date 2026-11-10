/**
 * "This is my station" — the form a broadcaster fills in.
 *
 * The monitor can only fingerprint a station once someone tells it where the
 * audio lives and who is allowed to see the result. This module validates that
 * claim before it reaches the database, and previews the slug the station will
 * get, so nobody is surprised by a duplicate row later.
 */

export const REGIONS = ["Central", "Western", "Eastern", "Northern"] as const;
export type RegionName = (typeof REGIONS)[number];

export type StationRequestInput = {
  mode: "claim" | "new";
  stationId?: string;
  name?: string;
  frequency?: string;
  region?: string;
  kind?: "radio" | "tv";
  streamUrl?: string;
  note?: string;
};

export type StationRequestResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; errors: Record<string, string> };

/** The same slug rule the approval function applies in SQL. */
export function slugPreview(name: string, frequency = ""): string {
  return `${name} ${frequency}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Only http(s) streams: the worker hands the URL to ffmpeg, so a `file://` or
 * `pipe:` URL would be a way to read the monitoring box's own filesystem.
 */
export function isSafeStreamUrl(raw: string): boolean {
  const value = raw.trim();
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local")) return false;
    return true;
  } catch {
    return false;
  }
}

export function validateStationRequest(input: StationRequestInput): StationRequestResult {
  const errors: Record<string, string> = {};
  const streamUrl = (input.streamUrl ?? "").trim();
  const kind = input.kind === "tv" ? "tv" : "radio";

  if (input.mode === "claim") {
    if (!input.stationId) errors.stationId = "Pick the station from the list.";
  } else {
    const name = (input.name ?? "").trim();
    if (name.length < 2) errors.name = "Give the station its full name (at least 2 characters).";
    if (name.length > 80) errors.name = "That name is too long — use the on-air name.";
    if (!slugPreview(name, input.frequency ?? "")) errors.name = "Use letters and numbers in the station name.";
  }

  if (input.region && !(REGIONS as readonly string[]).includes(input.region)) {
    errors.region = "Choose Central, Western, Eastern or Northern.";
  }
  if ((input.frequency ?? "").trim().length > 20) {
    errors.frequency = "A frequency like 100.5 is enough.";
  }
  if (streamUrl && !isSafeStreamUrl(streamUrl)) {
    errors.streamUrl = "Enter the station's stream address (https://…mp3 or …m3u8).";
  }
  if ((input.note ?? "").length > 500) {
    errors.note = "Keep the note under 500 characters.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    payload: {
      ...(input.mode === "claim" ? { station_id: input.stationId } : {}),
      ...(input.mode === "new"
        ? {
            name: (input.name ?? "").trim(),
            frequency: (input.frequency ?? "").trim() || null,
            region: input.region || null,
          }
        : {}),
      kind,
      stream_url: streamUrl || null,
      note: (input.note ?? "").trim() || null,
    },
  };
}
