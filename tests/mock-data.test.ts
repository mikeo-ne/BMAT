import { describe, expect, it } from "vitest";

import { buildSeedTracks } from "@/lib/catalog";
import { MONITORED_STATIONS } from "@/lib/monitoring";
import {
  activeHubs,
  FM_STATIONS,
  HUBS,
  REGIONS,
  stationById,
  STATIONS_BY_REGION,
} from "@/lib/regions";

const NOW = new Date("2026-09-03T00:00:00Z");

/**
 * Guard rails for the mock data.
 *
 * The fixture panel and catalogue are what make East Sound legible as a Ugandan
 * product rather than a generic dashboard, so these tests fail loudly if a
 * station loses its hub, a region goes unrepresented, or a track ships without
 * a genre.
 */

describe("station panel realism", () => {
  it("gives every station a known regional hub", () => {
    for (const station of FM_STATIONS) {
      expect(HUBS).toContain(station.location);
    }
  });

  it("reports from the four hubs the brief names", () => {
    const hubs = activeHubs();

    for (const hub of ["Kampala", "Mbarara", "Jinja", "Gulu"]) {
      expect(hubs).toContain(hub);
    }
  });

  it("spreads the panel across more than just Kampala", () => {
    const nonKampala = FM_STATIONS.filter((s) => s.location !== "Kampala").length;

    expect(nonKampala).toBeGreaterThan(FM_STATIONS.length / 2);
    expect(activeHubs().length).toBeGreaterThanOrEqual(8);
  });

  it("has stations in every region", () => {
    for (const region of REGIONS) {
      expect(STATIONS_BY_REGION[region].length).toBeGreaterThan(0);
    }
  });

  it("has unique ids and names", () => {
    expect(new Set(FM_STATIONS.map((s) => s.id)).size).toBe(FM_STATIONS.length);
    expect(new Set(FM_STATIONS.map((s) => s.name)).size).toBe(FM_STATIONS.length);
  });

  it("keeps each station in a plausible hub for its region", () => {
    const hubsByRegion: Record<string, string[]> = {
      Central: ["Kampala", "Mukono"],
      Eastern: ["Jinja", "Mbale", "Tororo", "Soroti"],
      Western: ["Mbarara", "Fort Portal", "Kasese", "Kabale"],
      Northern: ["Gulu", "Lira", "Arua"],
    };

    for (const station of FM_STATIONS) {
      expect(hubsByRegion[station.region]).toContain(station.location);
    }
  });
});

describe("monitored panel stays in step with the spin panel", () => {
  it("derives region and hub from the shared panel, never restating them", () => {
    for (const station of MONITORED_STATIONS) {
      const panel = stationById(station.id);
      if (!panel) continue; // NBS TV is monitoring-only

      expect(station.region).toBe(panel.region);
      expect(station.location).toBe(panel.location);
    }
  });

  it("includes Jinja and at least one television feed", () => {
    expect(MONITORED_STATIONS.some((s) => s.location === "Jinja")).toBe(true);
    expect(MONITORED_STATIONS.some((s) => s.medium === "TV")).toBe(true);
  });
});

describe("catalogue realism", () => {
  const tracks = buildSeedTracks(NOW);

  it("tags every recording with a Ugandan radio format", () => {
    const genres = new Set(tracks.map((t) => t.genre));

    for (const track of tracks) {
      expect(track.genre, `${track.title} has no genre`).toBeTruthy();
    }

    // Kidandali and Luganda pop are the formats the panel is actually worked to.
    expect(genres.has("Kidandali")).toBe(true);
    expect(genres.has("Luganda pop")).toBe(true);
  });

  it("carries Luganda-language titles, not only English ones", () => {
    const luganda = tracks.filter((t) =>
      ["Nkwagala", "Omukwano", "Mulongo", "Ggwe Ondabika", "Nalongo"].includes(t.title),
    );

    expect(luganda.length).toBeGreaterThanOrEqual(4);
  });

  it("uses East African artist names", () => {
    const artists = new Set(tracks.map((t) => t.primaryArtist));

    expect(artists.has("Ray Bwete")).toBe(true);
    expect(artists.has("Doreen Achieng")).toBe(true);
    expect(artists.has("Mukisa Collective")).toBe(true);
  });

  it("keeps delivery file names consistent with the title and artist", () => {
    for (const track of tracks) {
      const expected = `${track.primaryArtist} - ${track.title}.${track.audio.format.toLowerCase()}`;
      expect(track.audio.fileName).toBe(expected);
    }
  });
});
