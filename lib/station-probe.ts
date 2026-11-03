/**
 * Server-side stream probe service.
 *
 * Probes real broadcast stream URLs (Icecast/Shoutcast audio, HLS/DASH TV
 * playlists) from the Node runtime: reachability, latency, content type and
 * stream kind. The public app never talks to broadcast servers directly —
 * only this service does, so probes cannot be spoofed by page scripts.
 *
 * Streams are live media: reading the full body would never end, so the probe
 * reads a single chunk (a few KB max) and cancels the response immediately.
 */

import "server-only";

import type { StationFeed } from "./station-feeds";

export type StreamKind = "hls" | "audio" | "unknown";

export interface ProbeResult {
  /** True when the probe completed with a successful HTTP response. */
  ok: boolean;
  /** HTTP status when known (null when the request never completed). */
  status: number | null;
  /** Milliseconds from request start to the first response byte. */
  latencyMs: number;
  /** Best-effort stream classification from content type + first bytes. */
  streamKind: StreamKind;
  /** Response content-type header, when present. */
  contentType: string | null;
  /** ISO timestamp of this probe. */
  checkedAt: string;
  /** Human-readable failure reason when ok is false. */
  error: string | null;
}

export interface ProbeOptions {
  /** Per-request timeout; aborted probes are recorded as failures. */
  timeoutMs?: number;
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch;
}

const HLS_CONTENT_TYPES = new Set([
  "application/vnd.apple.mpegurl",
  "application/x-mpegurl",
  "audio/mpegurl",
]);

/** Classify a stream from its content-type header and first bytes. */
export function classifyStream(
  contentType: string | null,
  head: string,
): StreamKind {
  if (contentType) {
    const base = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
    if (HLS_CONTENT_TYPES.has(base)) return "hls";
    if (base.startsWith("audio/")) return "audio";
    // Some HLS endpoints answer with a video/* or generic type.
    if (base.includes("mpegurl")) return "hls";
    if (base.includes("mp4") || base.includes("mpeg")) return "audio";
  }
  if (head.trimStart().startsWith("#EXTM3U")) return "hls";
  return "unknown";
}

/**
 * Probe a single stream URL. Never throws: every outcome (success, HTTP
 * error, timeout, network failure) is returned as a ProbeResult so one dead
 * feed cannot break a batch run.
 */
export async function probeStream(
  url: string,
  options: ProbeOptions = {},
): Promise<ProbeResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  const checkedAt = new Date().toISOString();

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        // A range request keeps audio servers from streaming the full show.
        Range: "bytes=0-4095",
        "User-Agent": "EastSoundStreamMonitor/1.0 (public airplay monitoring)",
        Accept: "*/*",
      },
    });
    const latencyMs = Date.now() - startedAt;
    const contentType = response.headers?.get?.("content-type") ?? null;

    let head = "";
    if (response.ok) {
      try {
        // Read exactly one chunk, then cancel — media streams never end.
        const body = response.body as ReadableStream<Uint8Array> | null;
        const reader = body?.getReader();
        if (reader) {
          const { value } = await reader.read();
          if (value) {
            head = new TextDecoder("utf8", { fatal: false }).decode(
              value.subarray(0, 256),
            );
          }
          await reader.cancel().catch(() => {});
        } else {
          const buffer = await response.arrayBuffer();
          head = new TextDecoder("utf8", { fatal: false }).decode(
            new Uint8Array(buffer).subarray(0, 256),
          );
        }
      } catch {
        // Body read failures degrade classification but not reachability.
      }
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        latencyMs,
        streamKind: "unknown",
        contentType,
        checkedAt,
        error: `HTTP ${response.status}`,
      };
    }

    return {
      ok: true,
      status: response.status,
      latencyMs,
      streamKind: classifyStream(contentType, head),
      contentType,
      checkedAt,
      error: null,
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    return {
      ok: false,
      status: null,
      latencyMs,
      streamKind: "unknown",
      contentType: null,
      checkedAt,
      error: error instanceof Error ? error.message : "probe failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probe many feeds with bounded concurrency. Returns a map keyed by feed id;
 * results appear as each probe finishes, so callers always get complete data
 * for the batch (no partial maps).
 */
export async function probeFeeds(
  feeds: readonly StationFeed[],
  options: ProbeOptions & { concurrency?: number } = {},
): Promise<Map<string, ProbeResult>> {
  const concurrency = Math.min(
    Math.max(options.concurrency ?? 6, 1),
    feeds.length || 1,
  );
  const results = new Map<string, ProbeResult>();
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < feeds.length) {
      const feed = feeds[nextIndex];
      nextIndex += 1;
      results.set(feed.id, await probeStream(feed.streamUrl, options));
    }
  }

  await Promise.all(
    Array.from({ length: concurrency }, () => worker()),
  );
  return results;
}
