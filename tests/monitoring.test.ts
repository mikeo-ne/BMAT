import { describe, expect, it } from "vitest";

import { buildSeedTracks } from "@/lib/catalog";
import {
  driftTelemetry,
  generateTelemetry,
  isMatched,
  lastDetectionByStation,
  MATCH_THRESHOLD,
  MONITORED_STATIONS,
  monitoredCount,
  simulateScan,
  stationById,
  summariseMonitor,
  LEVEL_HISTORY,
  type Detection,
  type StationTelemetry,
} from "@/lib/monitoring";

const NOW = new Date("2026-09-03T12:00:00Z");
const CATALOGUE = buildSeedTracks(NOW);

function allTelemetry(status?: StationTelemetry["status"]): Record<string, StationTelemetry> {
  return Object.fromEntries(
    MONITORED_STATIONS.map((s) => [
      s.id,
      status
        ? {
            status,
            uptime: 1,
            latencyMs: 50,
            bufferHealth: 0.9,
            level: Array(LEVEL_HISTORY).fill(0.5),
            lastHeartbeat: NOW.toISOString(),
          }
        : generateTelemetry(s.id, NOW),
    ]),
  );
}

describe("MONITORED_STATIONS", () => {
  it("has unique ids", () => {
    expect(new Set(MONITORED_STATIONS.map((s) => s.id)).size).toBe(MONITORED_STATIONS.length);
  });

  it("carries the stations and frequencies the brief names", () => {
    expect(stationById("capital-kla")).toMatchObject({ name: "Capital FM", frequency: "91.3 MHz", medium: "FM" });
    expect(stationById("cbs-kla")).toMatchObject({ name: "CBS FM", frequency: "89.2 MHz" });
    expect(stationById("galaxy-kla")).toMatchObject({ name: "Galaxy FM", frequency: "100.2 MHz" });
    expect(stationById("nbs-tv-kla")).toMatchObject({ name: "NBS TV", medium: "TV" });
  });

  it("covers all four Ugandan regions", () => {
    const regions = new Set(MONITORED_STATIONS.map((s) => s.region));
    expect(regions).toEqual(new Set(["Central", "Eastern", "Western", "Northern"]));
  });

  it("counts by medium", () => {
    expect(monitoredCount()).toBe(MONITORED_STATIONS.length);
    expect(monitoredCount("FM") + monitoredCount("TV")).toBe(MONITORED_STATIONS.length);
    expect(monitoredCount("TV")).toBeGreaterThan(0);
  });
});

describe("generateTelemetry", () => {
  it("is deterministic per station", () => {
    expect(generateTelemetry("capital-kla", NOW)).toEqual(generateTelemetry("capital-kla", NOW));
  });

  it("differs between stations", () => {
    expect(generateTelemetry("capital-kla", NOW)).not.toEqual(generateTelemetry("cbs-kla", NOW));
  });

  it("stays inside its stated ranges", () => {
    for (const station of MONITORED_STATIONS) {
      const t = generateTelemetry(station.id, NOW);

      expect(["online", "degraded", "offline"]).toContain(t.status);
      expect(t.uptime).toBeGreaterThanOrEqual(0);
      expect(t.uptime).toBeLessThanOrEqual(1);
      expect(t.latencyMs).toBeGreaterThanOrEqual(0);
      expect(t.bufferHealth).toBeGreaterThanOrEqual(0);
      expect(t.bufferHealth).toBeLessThanOrEqual(1);
      expect(t.level).toHaveLength(LEVEL_HISTORY);
      expect(Number.isNaN(new Date(t.lastHeartbeat).getTime())).toBe(false);
    }
  });

  it("reports no latency or level for an offline feed", () => {
    const offline = MONITORED_STATIONS.map((s) => generateTelemetry(s.id, NOW)).find(
      (t) => t.status === "offline",
    );

    if (offline) {
      expect(offline.latencyMs).toBe(0);
      expect(offline.bufferHealth).toBe(0);
      expect(offline.level.every((v) => v === 0)).toBe(true);
    } else {
      expect(MONITORED_STATIONS.length).toBeGreaterThan(0);
    }
  });
});

describe("driftTelemetry", () => {
  it("keeps the level history a fixed length", () => {
    const start = generateTelemetry("capital-kla", NOW);
    const next = driftTelemetry("capital-kla", start, 1, NOW);

    expect(next.level).toHaveLength(LEVEL_HISTORY);
    expect(next.level[next.level.length - 1]).not.toBe(start.level[start.level.length - 1]);
  });

  it("is deterministic for a given tick", () => {
    const start = generateTelemetry("cbs-kla", NOW);
    expect(driftTelemetry("cbs-kla", start, 7, NOW)).toEqual(driftTelemetry("cbs-kla", start, 7, NOW));
  });

  it("changes over successive ticks", () => {
    let current = generateTelemetry("galaxy-kla", NOW);
    const seen = new Set<number>([current.level[LEVEL_HISTORY - 1]]);

    for (let tick = 1; tick <= 10; tick++) {
      current = driftTelemetry("galaxy-kla", current, tick, NOW);
      seen.add(current.level[LEVEL_HISTORY - 1]);
    }

    expect(seen.size).toBeGreaterThan(1);
  });

  it("leaves an offline feed dark", () => {
    const offline: StationTelemetry = {
      status: "offline",
      uptime: 0.7,
      latencyMs: 0,
      bufferHealth: 0,
      level: Array(LEVEL_HISTORY).fill(0),
      lastHeartbeat: NOW.toISOString(),
    };

    const next = driftTelemetry("nbs-tv-kla", offline, 1, NOW);
    expect(next.level.every((v) => v === 0)).toBe(true);
  });

  it("keeps latency positive for a reporting feed", () => {
    let current = generateTelemetry("mega-gul", NOW);
    for (let tick = 1; tick <= 20; tick++) {
      current = driftTelemetry("mega-gul", current, tick, NOW);
      if (current.status !== "offline") expect(current.latencyMs).toBeGreaterThan(0);
    }
  });
});

describe("simulateScan", () => {
  it("produces one detection per reporting station", () => {
    const telemetry = allTelemetry("online");
    const detections = simulateScan({
      stations: MONITORED_STATIONS,
      catalogue: CATALOGUE,
      telemetry,
      now: NOW,
      seed: "scan-a",
    });

    expect(detections).toHaveLength(MONITORED_STATIONS.length);
    expect(new Set(detections.map((d) => d.stationId)).size).toBe(MONITORED_STATIONS.length);
  });

  it("skips stations whose feed is down", () => {
    const telemetry = allTelemetry("online");
    telemetry["cbs-kla"] = { ...telemetry["cbs-kla"], status: "offline" };

    const detections = simulateScan({
      stations: MONITORED_STATIONS,
      catalogue: CATALOGUE,
      telemetry,
      now: NOW,
      seed: "scan-b",
    });

    expect(detections.map((d) => d.stationId)).not.toContain("cbs-kla");
    expect(detections).toHaveLength(MONITORED_STATIONS.length - 1);
  });

  it("keeps confidence inside 0..1 and honours the threshold", () => {
    const detections = simulateScan({
      stations: MONITORED_STATIONS,
      catalogue: CATALOGUE,
      telemetry: allTelemetry("online"),
      now: NOW,
      seed: "scan-c",
    });

    for (const detection of detections) {
      expect(detection.confidence).toBeGreaterThanOrEqual(0);
      expect(detection.confidence).toBeLessThanOrEqual(1);
      expect(detection.matchedSeconds).toBeGreaterThan(0);

      if (detection.track === null) {
        expect(detection.confidence).toBeLessThan(MATCH_THRESHOLD);
        expect(isMatched(detection)).toBe(false);
      } else {
        expect(detection.confidence).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
        expect(isMatched(detection)).toBe(true);
      }
    }
  });

  it("carries the catalogue identity onto a match", () => {
    const detections = simulateScan({
      stations: MONITORED_STATIONS,
      catalogue: CATALOGUE,
      telemetry: allTelemetry("online"),
      now: NOW,
      seed: "scan-d",
    });

    const matched = detections.find((d) => d.track !== null)!;
    const source = CATALOGUE.find((t) => t.isrc === matched.track!.isrc)!;

    expect(matched.track!.title).toBe(source.title);
    expect(matched.track!.primaryArtist).toBe(source.primaryArtist);
  });

  it("reports every candidate as unmatched when the catalogue is empty", () => {
    const detections = simulateScan({
      stations: MONITORED_STATIONS,
      catalogue: [],
      telemetry: allTelemetry("online"),
      now: NOW,
      seed: "scan-empty",
    });

    expect(detections.length).toBeGreaterThan(0);
    expect(detections.every((d) => d.track === null)).toBe(true);
    expect(detections.every((d) => !isMatched(d))).toBe(true);
  });

  it("is reproducible for the same seed and varies otherwise", () => {
    const telemetry = allTelemetry("online");
    const input = {
      stations: MONITORED_STATIONS,
      catalogue: CATALOGUE,
      telemetry,
      now: NOW,
    };

    expect(simulateScan({ ...input, seed: "same" })).toEqual(simulateScan({ ...input, seed: "same" }));

    const other = simulateScan({ ...input, seed: "different" });
    const first = simulateScan({ ...input, seed: "same" });
    expect(other.map((d) => d.confidence)).not.toEqual(first.map((d) => d.confidence));
  });

  it("produces a mix of matched and unmatched over enough scans", () => {
    const telemetry = allTelemetry("online");
    const all: Detection[] = [];

    for (let i = 0; i < 20; i++) {
      all.push(
        ...simulateScan({
          stations: MONITORED_STATIONS,
          catalogue: CATALOGUE,
          telemetry,
          now: NOW,
          seed: `scan-${i}`,
        }),
      );
    }

    expect(all.some((d) => d.track === null)).toBe(true);
    expect(all.some((d) => d.track !== null)).toBe(true);
  });

  it("tags the method by medium", () => {
    const detections = simulateScan({
      stations: MONITORED_STATIONS,
      catalogue: CATALOGUE,
      telemetry: allTelemetry("online"),
      now: NOW,
      seed: "scan-e",
    });

    const tv = detections.find((d) => d.medium === "TV")!;
    expect(tv.method).toMatch(/video audio bus/);
    expect(detections.find((d) => d.medium === "FM")!.method).toMatch(/spectral peak/);
  });
});

describe("summariseMonitor", () => {
  it("counts status and detection outcomes", () => {
    const telemetry = allTelemetry("online");
    telemetry["cbs-kla"] = { ...telemetry["cbs-kla"], status: "degraded" };
    telemetry["galaxy-kla"] = { ...telemetry["galaxy-kla"], status: "offline" };

    const detections = simulateScan({
      stations: MONITORED_STATIONS,
      catalogue: CATALOGUE,
      telemetry,
      now: NOW,
      seed: "summary",
    });

    const summary = summariseMonitor(telemetry, detections);

    expect(summary.stations).toBe(MONITORED_STATIONS.length);
    expect(summary.online + summary.degraded + summary.offline).toBe(summary.stations);
    expect(summary.degraded).toBe(1);
    expect(summary.offline).toBe(1);
    expect(summary.detections).toBe(detections.length);
    expect(summary.matched + summary.unmatched).toBe(summary.detections);
    expect(summary.matchRate).toBeCloseTo(summary.matched / summary.detections, 6);
  });

  it("avoids dividing by zero with no detections", () => {
    const summary = summariseMonitor(allTelemetry("online"), []);

    expect(summary.detections).toBe(0);
    expect(summary.averageConfidence).toBe(0);
    expect(summary.matchRate).toBe(0);
  });
});

describe("lastDetectionByStation", () => {
  it("keeps the newest detection per station", () => {
    const telemetry = allTelemetry("online");
    const older = simulateScan({
      stations: MONITORED_STATIONS,
      catalogue: CATALOGUE,
      telemetry,
      now: new Date("2026-09-03T10:00:00Z"),
      seed: "old",
    });
    const newer = simulateScan({
      stations: MONITORED_STATIONS,
      catalogue: CATALOGUE,
      telemetry,
      now: new Date("2026-09-03T11:00:00Z"),
      seed: "new",
    });

    // Feed order is newest-first, so the older batch goes in second.
    const latest = lastDetectionByStation([...newer, ...older]);

    expect(Object.keys(latest).length).toBe(MONITORED_STATIONS.length);
    for (const detection of Object.values(latest)) {
      expect(detection.detectedAt).toBe("2026-09-03T11:00:00.000Z");
    }
  });
});
