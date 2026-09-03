import { describe, expect, it } from "vitest";

import { buildSeedTracks, buildTrack, nextDesignation, suggestIsrc } from "@/lib/catalog";
import { REGIONS } from "@/lib/regions";
import { dominantRegion, spinsFor, summariseCatalog, trendFor } from "@/lib/types";

const NOW = new Date("2026-09-03T00:00:00Z");

describe("buildSeedTracks", () => {
  const tracks = buildSeedTracks(NOW);

  it("produces a non-empty catalogue", () => {
    expect(tracks.length).toBeGreaterThan(0);
  });

  it("gives every track a unique id and ISRC", () => {
    expect(new Set(tracks.map((t) => t.id)).size).toBe(tracks.length);
    expect(new Set(tracks.map((t) => t.isrc)).size).toBe(tracks.length);
  });

  it("keeps totalSpins consistent with the regional breakdown", () => {
    for (const track of tracks) {
      const sum = track.airplay.reduce((s, r) => s + r.spins, 0);
      expect(track.totalSpins).toBe(sum);
      expect(track.totalSpins).toBeGreaterThan(0);
    }
  });

  it("covers all four regions on every track", () => {
    for (const track of tracks) {
      expect(track.airplay.map((a) => a.region)).toEqual([...REGIONS]);
    }
  });

  it("is reproducible for a given clock", () => {
    expect(buildSeedTracks(NOW)).toEqual(tracks);
  });

  it("names a dominant region that actually leads", () => {
    for (const track of tracks) {
      const top = Math.max(...track.airplay.map((a) => a.spins));
      expect(track.airplay.find((a) => a.region === dominantRegion(track))?.spins).toBe(top);
    }
  });
});

describe("buildTrack", () => {
  it("normalises the ISRC it is handed", () => {
    const track = buildTrack({
      id: "trk_x",
      title: "Test",
      primaryArtist: "Artist",
      featuredArtists: [],
      releaseDate: "2026-08-01",
      isrc: "ugbmt2600001",
      fileName: "test.mp3",
      format: "MP3",
      mimeType: "audio/mpeg",
      sizeBytes: 1000,
      durationSec: 120,
      storedName: "abc.mp3",
      now: NOW,
    });

    expect(track.isrc).toBe("UG-BMT-26-00001");
    expect(track.status).toBe("live");
    expect(track.totalSpins).toBeGreaterThan(0);
    expect(trendFor(track, "All")).toHaveLength(14);
  });
});

describe("nextDesignation / suggestIsrc", () => {
  const tracks = buildSeedTracks(NOW);

  it("starts at 1 for an unused registrant/year block", () => {
    expect(nextDesignation(tracks, "UG-ZZZ-40-00001")).toBe(1);
  });

  it("continues after the highest designation already used", () => {
    // Seeded demo rows occupy UG-BMT-26-00001..00007.
    expect(nextDesignation(tracks, "UG-BMT-26-00001")).toBe(8);
  });

  it("ignores other years of the same registrant", () => {
    expect(nextDesignation(tracks, "UG-BMT-27-00001")).toBe(1);
  });

  it("suggests the next free ISRC for a registrant", () => {
    expect(suggestIsrc(tracks, "Nyege Nyege Tapes", "2026-10-02")).toBe("UG-NNT-26-00001");
    expect(suggestIsrc(tracks, "Ray Bwete", "2026-05-01")).toBe("UG-RAY-26-00001");
  });

  it("bumps the designation once that registrant already has a row", () => {
    const withRow = [
      ...tracks,
      buildTrack({
        id: "trk_new",
        title: "Fresh",
        primaryArtist: "Ray Bwete",
        featuredArtists: [],
        releaseDate: "2026-05-01",
        isrc: "UG-RAY-26-00001",
        fileName: "fresh.mp3",
        format: "MP3",
        mimeType: "audio/mpeg",
        sizeBytes: 1000,
        durationSec: 120,
        storedName: null,
        now: NOW,
      }),
    ];

    expect(suggestIsrc(withRow, "Ray Bwete", "2026-05-01")).toBe("UG-RAY-26-00002");
  });
});

describe("summariseCatalog", () => {
  it("sums spins and track counts", () => {
    const tracks = buildSeedTracks(NOW);
    const summary = summariseCatalog(tracks);

    expect(summary.totalTracks).toBe(tracks.length);
    expect(summary.totalSpins).toBe(tracks.reduce((s, t) => s + t.totalSpins, 0));
    expect(summary.averageSpinsPerTrack).toBeCloseTo(summary.totalSpins / tracks.length, 6);

    const regionTotal = REGIONS.reduce((s, r) => s + summary.byRegion[r].spins, 0);
    expect(regionTotal).toBe(summary.totalSpins);
  });

  it("handles an empty catalogue without dividing by zero", () => {
    const summary = summariseCatalog([]);

    expect(summary.totalTracks).toBe(0);
    expect(summary.totalSpins).toBe(0);
    expect(summary.averageSpinsPerTrack).toBe(0);
    expect(summary.byRegion.Central.spins).toBe(0);
  });

  it("filters spins per region through spinsFor", () => {
    const [track] = buildSeedTracks(NOW);
    const perRegion = REGIONS.reduce((s, r) => s + spinsFor(track, r), 0);

    expect(perRegion).toBe(track.totalSpins);
    expect(spinsFor(track, "All")).toBe(track.totalSpins);
  });
});
