import { describe, expect, it } from "vitest";

import { buildSeedTracks } from "@/lib/catalog";
import {
  buildMixTimeline,
  buildMixWaveform,
  buildTransitions,
  buildUnidentifiedQueue,
  CONFIDENCE_FLOOR,
  formatTimeline,
  MIX_DURATION_SEC,
  searchCatalogue,
} from "@/lib/mix-parser";

const CATALOGUE = buildSeedTracks(new Date("2026-09-03T00:00:00Z"));
const SEGMENTS = buildMixTimeline("capital-kla", CATALOGUE);

describe("mix timeline", () => {
  it("covers exactly one hour with contiguous segments", () => {
    expect(SEGMENTS.length).toBeGreaterThan(5);
    expect(SEGMENTS[0].startSec).toBe(0);
    expect(SEGMENTS[SEGMENTS.length - 1].endSec).toBe(MIX_DURATION_SEC);

    for (let i = 1; i < SEGMENTS.length; i++) {
      expect(SEGMENTS[i].startSec).toBe(SEGMENTS[i - 1].endSec);
    }
  });

  it("is deterministic per station and differs between stations", () => {
    const again = buildMixTimeline("capital-kla", CATALOGUE);
    expect(again.map((s) => s.kind)).toEqual(SEGMENTS.map((s) => s.kind));

    const other = buildMixTimeline("mega-gul", CATALOGUE);
    expect(other.map((s) => s.kind)).not.toEqual(SEGMENTS.map((s) => s.kind));
  });

  it("names matched tracks and leaves the rest unnamed", () => {
    for (const segment of SEGMENTS) {
      if (segment.kind === "track") {
        expect(segment.title).toBeTruthy();
        expect(segment.isrc).toBeTruthy();
        expect(segment.confidence).not.toBeNull();
      } else {
        expect(segment.title).toBeNull();
        expect(segment.isrc).toBeNull();
      }
    }
  });

  it("keeps matched confidence above the floor", () => {
    for (const segment of SEGMENTS.filter((s) => s.kind === "track")) {
      expect(segment.confidence!).toBeGreaterThanOrEqual(CONFIDENCE_FLOOR);
    }
  });

  it("only names recordings that are actually in the catalogue", () => {
    const isrcs = new Set(CATALOGUE.map((t) => t.isrc));
    for (const segment of SEGMENTS.filter((s) => s.isrc)) {
      expect(isrcs.has(segment.isrc!)).toBe(true);
    }
  });
});

describe("transitions", () => {
  it("only marks hand-overs between music segments", () => {
    const transitions = buildTransitions(SEGMENTS);
    expect(transitions.length).toBeGreaterThan(0);

    for (const t of transitions) {
      expect(["track", "unidentified"]).toContain(t.from.kind);
      expect(["track", "unidentified"]).toContain(t.to.kind);
    }
  });

  it("never reports a negative gap", () => {
    for (const t of buildTransitions(SEGMENTS)) {
      expect(t.gapSec).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("unidentified queue", () => {
  it("contains everything the parser could not name", () => {
    const queue = buildUnidentifiedQueue(SEGMENTS);
    expect(queue.length).toBeGreaterThan(0);

    for (const segment of queue) {
      const unnamed = segment.kind === "unidentified";
      const lowConfidence =
        segment.confidence !== null && segment.confidence < CONFIDENCE_FLOOR;
      expect(unnamed || lowConfidence).toBe(true);
    }
  });

  it("is a subset of the timeline", () => {
    const ids = new Set(SEGMENTS.map((s) => s.id));
    for (const segment of buildUnidentifiedQueue(SEGMENTS)) {
      expect(ids.has(segment.id)).toBe(true);
    }
  });
});

describe("waveform", () => {
  it("produces one sample per step across the hour", () => {
    const wave = buildMixWaveform(SEGMENTS);
    expect(wave).toHaveLength(Math.ceil(MIX_DURATION_SEC / 2));
  });

  it("stays inside the 0-1 amplitude range", () => {
    for (const value of buildMixWaveform(SEGMENTS)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("handles an empty timeline without throwing", () => {
    expect(buildMixWaveform([]).length).toBe(Math.ceil(MIX_DURATION_SEC / 2));
  });
});

describe("formatTimeline", () => {
  it("formats minutes and seconds", () => {
    expect(formatTimeline(0)).toBe("00:00");
    expect(formatTimeline(75)).toBe("01:15");
    expect(formatTimeline(195)).toBe("03:15");
    expect(formatTimeline(3600)).toBe("1:00:00");
  });

  it("clamps negative input", () => {
    expect(formatTimeline(-30)).toBe("00:00");
  });
});

describe("searchCatalogue", () => {
  it("matches on title, artist and ISRC", () => {
    expect(searchCatalogue(CATALOGUE, "Nkwagala").length).toBeGreaterThan(0);
    expect(searchCatalogue(CATALOGUE, "Ray Bwete").length).toBeGreaterThan(0);
    expect(searchCatalogue(CATALOGUE, "UG-BMT-26-00007").length).toBe(1);
  });

  it("is case-insensitive and trims", () => {
    expect(searchCatalogue(CATALOGUE, "  nkwagala  ")).toEqual(
      searchCatalogue(CATALOGUE, "Nkwagala"),
    );
  });

  it("returns nothing for an empty query", () => {
    expect(searchCatalogue(CATALOGUE, "")).toEqual([]);
    expect(searchCatalogue(CATALOGUE, "   ")).toEqual([]);
  });

  it("returns nothing for a miss", () => {
    expect(searchCatalogue(CATALOGUE, "zzzz")).toEqual([]);
  });
});
