vi.mock("server-only", () => ({}));
import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/artists/route";
import {
  appleMusicEmbedUrl,
  artistSelectionFromHash,
  filterReferenceRecordings,
  isPublicArtistId,
  MUSIC_RESEARCHED_ON,
  MUSIC_SOURCES,
  PUBLIC_ARTISTS,
  REFERENCE_RECORDINGS,
  referenceMusicCsv,
} from "@/lib/artist-library";
import { buildSeedTracks } from "@/lib/catalog";
import { isValidIsoDate } from "@/lib/format";

const NOW = new Date("2026-11-01T12:00:00Z");

describe("researched artist identities and release provenance", () => {
  it("includes exactly the four requested identities, with the original artist-platform IDs", () => {
    expect(PUBLIC_ARTISTS.map((artist) => artist.displayName)).toEqual([
      "BARANGA",
      "MR FALLBACK",
      "SOUNDLYKBB",
      "TAI DAI",
    ]);
    expect(MUSIC_SOURCES["baranga-profile"].url).toContain("1764683984");
    expect(MUSIC_SOURCES["fallback-profile"].url).toContain("1795137555");
    expect(MUSIC_SOURCES["soundlykbb-profile"].url).toContain("1690023792");
    expect(MUSIC_SOURCES["tai-dai-profile"].url).toContain("1426402603");
  });
  it("has twelve unique references, not duplicate rows for shared artists", () => {
    expect(REFERENCE_RECORDINGS).toHaveLength(12);
    expect(
      new Set(REFERENCE_RECORDINGS.map((recording) => recording.id)).size,
    ).toBe(12);
    expect(
      new Set(REFERENCE_RECORDINGS.map((recording) => recording.appleMusicUrl))
        .size,
    ).toBe(12);
    expect(
      REFERENCE_RECORDINGS.filter((recording) => recording.id === "thursday"),
    ).toHaveLength(1);
  });
  it.each(REFERENCE_RECORDINGS)(
    "retains source and valid, already-published metadata for $id",
    (recording) => {
      expect(isValidIsoDate(recording.releaseDate)).toBe(true);
      expect(recording.releaseDate <= MUSIC_RESEARCHED_ON).toBe(true);
      expect(recording.durationSec).toBeGreaterThan(0);
      expect(
        MUSIC_SOURCES[recording.sourceId].url.startsWith(
          "https://music.apple.com/ug/",
        ),
      ).toBe(true);
      expect(recording.artistIds.every((id) => isPublicArtistId(id))).toBe(
        true,
      );
      expect(appleMusicEmbedUrl(recording.appleMusicUrl)).not.toBeNull();
      expect(recording.isrc).toBeNull();
      expect(recording.usage).toBe("public-reference");
      expect(recording).not.toHaveProperty("audio");
      expect(recording).not.toHaveProperty("totalSpins");
      expect(recording).not.toHaveProperty("ownership");
    },
  );
  it("keeps all highlighted recordings and profile citations resolvable", () => {
    for (const artist of PUBLIC_ARTISTS) {
      expect(
        REFERENCE_RECORDINGS.some(
          (recording) =>
            recording.id === artist.highlightRecordingId &&
            recording.artistIds.includes(artist.id),
        ),
      ).toBe(true);
      expect(
        artist.sourceIds.every((sourceId) => Boolean(MUSIC_SOURCES[sourceId])),
      ).toBe(true);
    }
  });
  it("preserves joint primary credits, rather than turning co-leads into features", () => {
    const byId = Object.fromEntries(
      REFERENCE_RECORDINGS.map((recording) => [recording.id, recording]),
    );
    expect(byId.thursday.primaryArtists).toEqual([
      "Kaboo",
      "Tai Dai",
      "Soundlykbb",
    ]);
    expect(byId["soundlykbb-sponsor"].primaryArtists).toEqual([
      "Denim Cartel",
      "Soundlykbb",
      "Big Tril",
    ]);
    expect(byId["soundlykbb-bunda-freestyle"].primaryArtists).toEqual([
      "Soundlykbb",
      "Khxli",
    ]);
    expect(byId["tai-dai-granted"].primaryArtists).toEqual([
      "Tai Dai",
      "Lukorito",
    ]);
    expect(byId["baranga-breathe"].featuredArtists).toEqual(["MR FALLBACK"]);
  });
  it("chooses an explicit edition when the source lists different versions", () => {
    expect(
      REFERENCE_RECORDINGS.find(
        (recording) => recording.id === "fallback-ekibobo",
      ),
    ).toMatchObject({ releaseDate: "2025-03-04", sourceId: "ekibobo" });
    expect(
      REFERENCE_RECORDINGS.find(
        (recording) => recording.id === "tai-dai-unforgettable",
      )?.appleMusicUrl,
    ).toContain("6768396763?i=6768396767");
  });
  it("seeds the twelve sourced real releases without inventing masters, identifiers, ownership or airplay", () => {
    const seed = buildSeedTracks(NOW);
    expect(seed.map((track) => track.id)).toEqual(
      REFERENCE_RECORDINGS.map((recording) => `ref_${recording.id}`),
    );
    for (const [index, track] of seed.entries()) {
      const reference = REFERENCE_RECORDINGS[index];
      expect(track.primaryArtists).toEqual(reference.primaryArtists);
      expect(track.title).toBe(reference.title);
      expect(track.origin).toBe("public-reference");
      expect(track.status).toBe("reference");
      expect(track.isrc).toBe("");
      expect(track.audio.storedName).toBeNull();
      expect(track.audio.format).toBeNull();
      expect(track.audio.fileName).toBe("");
      expect(track.ownership).toBeUndefined();
      expect(track.totalSpins).toBe(0);
      expect(track.reportingStations).toBe(0);
      expect(
        track.airplay.every((row) => row.spins === 0 && row.audience === 0),
      ).toBe(true);
    }
  });
});

describe("reference filtering, links and export", () => {
  it("filters both leads and featured appearances without duplicating collaborations", () => {
    expect(
      filterReferenceRecordings({ artist: "mr-fallback" })
        .map((recording) => recording.id)
        .sort(),
    ).toEqual([
      "baranga-breathe",
      "baranga-wagwuan",
      "fallback-abeyoo",
      "fallback-ekibobo",
    ]);
    expect(
      filterReferenceRecordings({ artist: "tai-dai" }).some(
        (recording) => recording.id === "thursday",
      ),
    ).toBe(true);
    expect(
      filterReferenceRecordings({ artist: "soundlykbb" }).some(
        (recording) => recording.id === "thursday",
      ),
    ).toBe(true);
  });
  it("searches collaborators and releases with case-insensitive, token-based matching", () => {
    expect(
      filterReferenceRecordings({ query: "  sopreno   ABEYOO " }).map(
        (recording) => recording.id,
      ),
    ).toEqual(["fallback-abeyoo"]);
    expect(
      filterReferenceRecordings({ artist: "tai-dai", query: "lukorito" }).map(
        (recording) => recording.id,
      ),
    ).toEqual(["tai-dai-granted"]);
    expect(filterReferenceRecordings({ query: "no-such-recording" })).toEqual(
      [],
    );
  });
  it("sorts without mutating the source catalogue", () => {
    const original = REFERENCE_RECORDINGS.map((recording) => recording.id);
    expect(filterReferenceRecordings()[0].id).toBe("soundlykbb-sponsor");
    const titles = filterReferenceRecordings({ sort: "title" }).map(
      (recording) => recording.title,
    );
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
    expect(REFERENCE_RECORDINGS.map((recording) => recording.id)).toEqual(
      original,
    );
  });
  it("supports safe shareable artist fragments and rejects malformed ones", () => {
    expect(artistSelectionFromHash("#mr-fallback")).toBe("mr-fallback");
    expect(artistSelectionFromHash("#tai-dai")).toBe("tai-dai");
    expect(artistSelectionFromHash("#%")).toBe("all");
    expect(artistSelectionFromHash("#philly-fallback")).toBe("all");
  });
  it.each([
    "javascript:alert(1)",
    "https://music.apple.com.evil.example/ug/album/salo/1?i=2",
    "https://evil.example/ug/album/salo/1?i=2",
    "http://music.apple.com/ug/album/salo/1?i=2",
    "https://music.apple.com:444/ug/album/salo/1?i=2",
    "https://music.apple.com/ug/album/salo/1?i=not-a-track",
    "https://music.apple.com/ug/artist/baranga/1764683984",
  ])("does not create an embed for an unapproved URL: %s", (url) => {
    expect(appleMusicEmbedUrl(url)).toBeNull();
  });
  it("keeps only the track ID and theme when deriving the official embed URL", () => {
    const original = REFERENCE_RECORDINGS[0].appleMusicUrl;
    const embed = new URL(
      appleMusicEmbedUrl(original + "&autoplay=true&tracking=extra#fragment")!,
    );
    expect(embed.origin).toBe("https://embed.music.apple.com");
    expect(embed.searchParams.get("i")).toBe("1764795019");
    expect([...embed.searchParams.keys()].sort()).toEqual(["i", "theme"]);
    expect(embed.hash).toBe("");
  });
  it("exports only the selected metadata with provenance, blank ISRC and no audio asset", () => {
    const csv = referenceMusicCsv(
      filterReferenceRecordings({ artist: "baranga", query: "SALO" }),
    );
    expect(csv.split("\r\n")).toHaveLength(2);
    expect(csv).toContain("SALO,Baranga");
    expect(csv).toContain("2024-08-24,154");
    expect(csv).toContain("Records DK,,https://music.apple.com/");
    expect(csv).toContain("No master licence");
    expect(csv).not.toContain("UG-ESD");
    expect(csv).not.toContain("OLA MUMMY");
  });
  it("requires an authenticated artist for the research API; public charts expose only their minimal projection", async () => {
    const response = await GET();
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
