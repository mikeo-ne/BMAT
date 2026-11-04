import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

vi.mock("server-only", () => ({}));

import {
  FEED_COUNTRIES,
  MONITORED_FEEDS,
  REFERENCE_FEEDS,
  REAL_STATION_FEEDS,
  isFeedCountry,
} from "@/lib/station-feeds";
import {
  classifyStream,
  probeFeeds,
  probeStream,
} from "@/lib/station-probe";

const VALID_SOURCES = ["RadioBrowser", "iptv-org", "BBC"];

describe("station feed registry", () => {
  it("covers all four East African markets", () => {
    const countries = new Set(REAL_STATION_FEEDS.map((feed) => feed.country));
    expect(countries).toEqual(new Set(FEED_COUNTRIES));
    expect(countries).toEqual(new Set(["UG", "KE", "TZ", "RW"]));
  });

  it("has unique feed ids", () => {
    const ids = [...REAL_STATION_FEEDS, ...REFERENCE_FEEDS].map(
      (feed) => feed.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("carries only http(s) stream URLs and homepages", () => {
    for (const feed of [...REAL_STATION_FEEDS, ...REFERENCE_FEEDS]) {
      expect(feed.streamUrl).toMatch(/^https?:\/\//);
      expect(feed.homepage).toMatch(/^https?:\/\//);
    }
  });

  it("includes radio and TV streams in every market", () => {
    for (const country of FEED_COUNTRIES) {
      const feeds = REAL_STATION_FEEDS.filter((f) => f.country === country);
      expect(feeds.some((f) => f.medium === "FM"), `${country} FM`).toBe(true);
      expect(feeds.some((f) => f.medium === "TV"), `${country} TV`).toBe(true);
    }
  });

  it("uses recognised source attribution", () => {
    for (const feed of REAL_STATION_FEEDS) {
      expect(VALID_SOURCES).toContain(feed.source);
      expect(feed.medium).toMatch(/^(FM|TV)$/);
      expect(isFeedCountry(feed.country)).toBe(true);
    }
  });

  it("keeps the panel live (no retired feeds)", () => {
    for (const feed of MONITORED_FEEDS) {
      expect(feed.retired).toBeUndefined();
    }
  });
});

describe("classifyStream", () => {
  it("classifies HLS content types", () => {
    expect(
      classifyStream("application/vnd.apple.mpegurl", ""),
    ).toBe("hls");
    expect(classifyStream("application/x-mpegurl; charset=utf-8", "")).toBe(
      "hls",
    );
  });

  it("classifies audio content types", () => {
    expect(classifyStream("audio/mpeg", "")).toBe("audio");
    expect(classifyStream("audio/aac", "")).toBe("audio");
  });

  it("classifies HLS from playlist body when content type is generic", () => {
    expect(
      classifyStream("text/plain", "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\n"),
    ).toBe("hls");
  });

  it("returns unknown for unrecognised feeds", () => {
    expect(classifyStream(null, "garbage bytes")).toBe("unknown");
    expect(classifyStream("image/jpeg", "binary")).toBe("unknown");
  });
});

function makeResponse(
  status: number,
  contentType: string | null,
  body: string | Uint8Array,
): Response {
  const headers = new Headers();
  if (contentType) headers.set("content-type", contentType);
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        body instanceof Uint8Array
          ? body
          : new TextEncoder().encode(body),
      );
      controller.close();
    },
  });
  return new Response(stream, { status, headers });
}

describe("probeStream", () => {
  it("records reachable audio streams with latency", async () => {
    const result = await probeStream(
      "https://example.test/stream",
      {
        fetchImpl: async () =>
          makeResponse(200, "audio/mpeg", "ID3fake-mp3-bytes"),
      },
    );
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.streamKind).toBe("audio");
    expect(result.error).toBeNull();
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("records HLS TV streams", async () => {
    const result = await probeStream(
      "https://example.test/live/index.m3u8",
      {
        fetchImpl: async () =>
          makeResponse(
            200,
            "application/vnd.apple.mpegurl",
            "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=900000\ntrack.m3u8\n",
          ),
      },
    );
    expect(result.ok).toBe(true);
    expect(result.streamKind).toBe("hls");
  });

  it("records HTTP errors as failures with the status", async () => {
    const result = await probeStream("https://example.test/dead", {
      fetchImpl: async () => makeResponse(404, "text/html", "not found"),
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
    expect(result.error).toBe("HTTP 404");
  });

  it("records timed-out probes as failures", async () => {
    const hanging = (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new Error("The operation was aborted."));
        });
      });
    const result = await probeStream("https://example.test/hang", {
      timeoutMs: 30,
      fetchImpl: hanging as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBeNull();
    expect(result.error).toContain("abort");
  });

  it("never throws on network rejection", async () => {
    const failing = () => Promise.reject(new Error("ECONNREFUSED"));
    const result = await probeStream(
      "https://example.test/gone",
      { fetchImpl: failing as unknown as typeof fetch },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("ECONNREFUSED");
  });
});

describe("probeFeeds", () => {
  it("probes every feed and returns a complete map", async () => {
    const feeds = REAL_STATION_FEEDS.slice(0, 7);
    const results = await probeFeeds(feeds, {
      fetchImpl: (async (input: URL | RequestInfo) =>
        makeResponse(
          200,
          "audio/mpeg",
          String(input).endsWith(".m3u8")
            ? "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nx.m3u8\n"
            : "ID3",
        )) as unknown as typeof fetch,
    });
    expect(results.size).toBe(feeds.length);
    for (const feed of feeds) {
      const result = results.get(feed.id);
      expect(result?.ok).toBe(true);
    }
  });
});

describe("station health store", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), "east-sound-health-"));
    vi.stubEnv("EAST_SOUND_DATA_DIR", directory);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("round-trips recorded results through the file store", async () => {
    const { recordStationHealth, readStationHealth } = await import(
      "@/lib/station-health-store"
    );
    const results = new Map([
      ["ntv-uganda", {
        ok: true,
        status: 200,
        latencyMs: 120,
        streamKind: "hls" as const,
        contentType: "application/vnd.apple.mpegurl",
        checkedAt: new Date().toISOString(),
        error: null,
      }],
    ]);
    await recordStationHealth(results);
    expect((await readStationHealth()).get("ntv-uganda")?.ok).toBe(true);
  });

  it("reads persisted history from a fresh module (cold cache)", async () => {
    const { recordStationHealth } = await import("@/lib/station-health-store");
    await recordStationHealth(
      new Map([
        ["k24", {
          ok: false,
          status: 500,
          latencyMs: 8,
          streamKind: "unknown",
          contentType: null,
          checkedAt: new Date().toISOString(),
          error: "HTTP 500",
        }],
      ]),
    );
    // Simulate a fresh instance: reset modules, cache is cold, file remains.
    vi.resetModules();
    const { readStationHealth } = await import("@/lib/station-health-store");
    const loaded = await readStationHealth();
    expect(loaded.get("k24")?.ok).toBe(false);
    expect(loaded.get("k24")?.error).toBe("HTTP 500");
  });

  it("survives a missing or corrupt health file", async () => {
    const { readStationHealth } = await import("@/lib/station-health-store");
    // No file has been written yet in this temp directory.
    expect((await readStationHealth()).size).toBe(0);

    const { writeFileSync } = await import("node:fs");
    writeFileSync(path.join(directory, "station-health.json"), "not json");
    vi.resetModules();
    const { readStationHealth: readAfterCorrupt } = await import(
      "@/lib/station-health-store"
    );
    expect((await readAfterCorrupt()).size).toBe(0);
  });
});
