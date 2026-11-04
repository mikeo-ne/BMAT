import { describe, expect, it } from "vitest";
import {
  buildSeedTracks,
  buildTrack,
  migrateLegacyCatalogue,
} from "@/lib/catalog";
import {
  catalogueWithCapturedStats,
  currentCapturedWindow,
  isStoredCapturedSpin,
  parseCapturedSpins,
} from "@/lib/captured-airplay";
import {
  buildBroadcastLog,
  filterBroadcastLog,
  summariseBroadcastLog,
} from "@/lib/playout";
import { buildSplitSheets, buildDisputes } from "@/lib/splits";
import { buildMembers, buildPlayLedger } from "@/lib/uprs";
import { buildMixTimeline } from "@/lib/mix-parser";
import { buildHitPredictor, buildHubMetrics } from "@/lib/geography";
import { buildWeeklyChart } from "@/lib/charts";
import {
  capturedPlayLedger,
  complianceLoggingCsv,
  priceSpin,
} from "@/lib/compliance";
import { buildCapturedRoyaltiesModel } from "@/lib/royalties";
import type { Track } from "@/lib/types";
import { buildFixtureTracks } from "@/tests/fixtures/catalogue";
import {
  CAPTURE_NOW,
  capturedSpin,
  REFERENCE_CATALOGUE,
} from "@/tests/fixtures/captured";

const parse = (row: unknown) =>
  parseCapturedSpins({ records: [row] }, REFERENCE_CATALOGUE, CAPTURE_NOW);

describe("actual catalogue and legacy fixture migration", () => {
  it("replaces only identifiable asset-less legacy rows, and is idempotent", () => {
    const legacy = buildFixtureTracks(CAPTURE_NOW).map((track, i) => ({
      ...track,
      id: `trk_0${i + 1}`,
    }));
    const delivered = buildTrack({
      id: "genuine-delivery",
      title: "User supplied recording",
      primaryArtist: "QA rights holder",
      featuredArtists: [],
      releaseDate: "2026-11-01",
      isrc: "UG-QAT-26-00100",
      fileName: "master.wav",
      format: "WAV",
      mimeType: "audio/wav",
      sizeBytes: 2048,
      durationSec: 10,
      storedName: "genuine.wav",
      now: CAPTURE_NOW,
    });
    const migrated = migrateLegacyCatalogue([...legacy, delivered]);
    expect(migrated.changed).toBe(true);
    expect(migrated.tracks).toHaveLength(13);
    expect(migrated.tracks.find((track) => track.id === delivered.id)).toEqual(
      delivered,
    );
    expect(
      migrated.tracks.filter((track) => track.origin === "public-reference"),
    ).toHaveLength(12);
    expect(migrateLegacyCatalogue(migrated.tracks)).toEqual({
      changed: false,
      tracks: migrated.tracks,
    });
  });
  it("preserves a master-bearing row even if an old fixture ID was reused", () => {
    const row = {
      ...buildFixtureTracks(CAPTURE_NOW)[0],
      id: "trk_01",
      audio: {
        ...buildFixtureTracks(CAPTURE_NOW)[0].audio,
        storedName: "owned.wav",
      },
    };
    expect(migrateLegacyCatalogue([row])).toEqual({
      changed: false,
      tracks: [row],
    });
    expect(migrateLegacyCatalogue([])).toEqual({ changed: false, tracks: [] });
  });
  it("does not synthesize real-artist logs, shares, rights disputes, mixes or royalty ledgers", () => {
    const catalogue = buildSeedTracks(CAPTURE_NOW);
    expect(buildBroadcastLog(catalogue, CAPTURE_NOW)).toEqual([]);
    expect(buildMembers(catalogue)).toEqual([]);
    expect(buildPlayLedger({ catalogue, now: CAPTURE_NOW })).toEqual([]);
    expect(buildSplitSheets(catalogue)).toEqual([]);
    expect(buildDisputes(buildSplitSheets(catalogue))).toEqual([]);
    expect(buildMixTimeline("capital-kla", catalogue)).toEqual([]);
    expect(buildHitPredictor(catalogue)).toEqual([]);
    expect(
      buildCapturedRoyaltiesModel(catalogue, [], CAPTURE_NOW).statements,
    ).toEqual([]);
  });
  it("does not let a mixed test catalogue fabricate a real recording's activity", () => {
    const mixed = [...REFERENCE_CATALOGUE, ...buildFixtureTracks(CAPTURE_NOW)];
    const references = new Set(REFERENCE_CATALOGUE.map((track) => track.id));
    expect(
      buildBroadcastLog(mixed, CAPTURE_NOW).some(
        (spin) => spin.trackId && references.has(spin.trackId),
      ),
    ).toBe(false);
    expect(
      buildMixTimeline("capital-kla", mixed).some(
        (segment) =>
          segment.isrc === "" ||
          REFERENCE_CATALOGUE.some((track) => track.title === segment.title),
      ),
    ).toBe(false);
    expect(
      buildHitPredictor(mixed).some((row) => references.has(row.trackId)),
    ).toBe(false);
  });
});

describe("bounded authenticated-ingester capture schema", () => {
  it("accepts a known real release without inventing an ISRC and normalises its station", () => {
    const result = parse({
      ...capturedSpin(),
      stationName: "client cannot override canonical station",
      detectedAt: "2026-11-01T16:00:00+03:00",
    });
    expect(result.errors).toEqual([]);
    expect(result.spins[0]).toMatchObject({
      source: "captured",
      stationName: "Capital FM",
      detectedAt: "2026-11-01T13:00:00.000Z",
      isrc: null,
    });
    expect(isStoredCapturedSpin(result.spins[0])).toBe(true);
  });
  it("keeps unmatched audio as a real flag without borrowing a catalogue identity", () => {
    const result = parse({
      ...capturedSpin({ trackId: null }),
      title: "untrusted title",
    });
    expect(result.errors).toEqual([]);
    expect(result.spins[0]).toMatchObject({
      trackId: null,
      title: null,
      primaryArtist: null,
    });
  });
  it.each([
    { source: "demo" },
    { source: "simulator" },
    { source: undefined },
    { stationId: "invented-station" },
    { trackId: "unknown-track" },
    { detectedAt: "2026-11-02T00:00:00Z" },
    { detectedAt: "2026-11-01T12:00:00" },
    { detectedAt: "2026-02-30T12:00:00Z" },
    { detectedAt: "2020-01-01T00:00:00Z" },
    { confidence: 1.1 },
    { confidence: -1 },
    { durationSec: 0 },
    { durationSec: 86401 },
    { isrc: "invented" },
    { id: "bad\nheader" },
    {
      evidence: {
        url: "https://127.0.0.1/evidence",
        sha256: "a".repeat(64),
        durationSec: 10,
      },
    },
    {
      evidence: {
        url: "https://evidence.example.com/clip.wav",
        sha256: "not-a-digest",
        durationSec: 10,
      },
    },
    {
      evidence: {
        url: "https://evidence.example.com/clip.wav",
        sha256: "a".repeat(64),
        durationSec: 30,
      },
    },
  ])("rejects invalid capture fields: %o", (fields) => {
    const result = parse({ ...capturedSpin(), ...fields });
    expect(result.spins).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
  });
  it("accepts a supplied ten-second capture reference, but does not claim its digest was verified", () => {
    const result = parse({
      ...capturedSpin(),
      evidence: {
        url: "https://evidence.example.com/clip.wav",
        sha256: "A".repeat(64),
        durationSec: 10,
      },
    });
    expect(result.errors).toEqual([]);
    expect(result.spins[0].evidence?.sha256).toBe("a".repeat(64));
    expect(isStoredCapturedSpin(result.spins[0])).toBe(true);
  });
  it("rejects empty/oversized batches and never partially accepts a mixed-validity batch", () => {
    expect(
      parseCapturedSpins({ records: [] }, REFERENCE_CATALOGUE).errors.length,
    ).toBeGreaterThan(0);
    expect(
      parseCapturedSpins(
        { records: Array(101).fill(capturedSpin()) },
        REFERENCE_CATALOGUE,
      ).spins,
    ).toEqual([]);
    expect(
      parseCapturedSpins(
        { records: [capturedSpin(), { source: "demo" }] },
        REFERENCE_CATALOGUE,
        CAPTURE_NOW,
      ).spins,
    ).toEqual([]);
  });
  it("validates stored capture shape instead of trusting a source label", () => {
    for (const fields of [
      { confidence: "99%" },
      { detectedAt: "invalid" },
      { stationName: "Wrong station" },
      { region: "Western" },
      { evidence: { url: "javascript:alert(1)" } },
      { durationSec: NaN },
    ])
      expect(isStoredCapturedSpin({ ...capturedSpin(), ...fields })).toBe(
        false,
      );
  });
});

describe("capture-backed counters, geographies, unknown chart history and royalty boundaries", () => {
  it("deduplicates and restricts current activity to today plus 13 prior EAT days", () => {
    const start = capturedSpin({
      id: "start",
      detectedAt: "2026-10-18T21:00:00.000Z",
    });
    const rows = [
      start,
      start,
      capturedSpin({ id: "old", detectedAt: "2026-10-18T20:59:59.000Z" }),
      capturedSpin({ id: "today" }),
      capturedSpin({ id: "future", detectedAt: "2026-11-02T00:00:00.000Z" }),
      capturedSpin({ id: "demo", source: "demo" }),
    ];
    expect(
      currentCapturedWindow(rows, CAPTURE_NOW).map((row) => row.id),
    ).toEqual(["start", "today"]);
    const catalogue = catalogueWithCapturedStats(
      REFERENCE_CATALOGUE,
      rows,
      CAPTURE_NOW,
    );
    expect(catalogue[0]).toMatchObject({
      totalSpins: 2,
      reportingStations: 1,
      isrc: "",
    });
    expect(catalogue[0].airplay[0].trend[0]).toBe(1);
    expect(catalogue[0].airplay[0].trend[13]).toBe(1);
    expect(catalogue[0].airplay.every((row) => row.audience === 0)).toBe(true);
  });
  it("a missing ISRC does not turn a matched recording into an unmatched audio flag", () => {
    const rows = [
      capturedSpin(),
      capturedSpin({ id: "unmatched", trackId: null }),
    ];
    expect(summariseBroadcastLog(rows)).toMatchObject({
      total: 2,
      matched: 1,
      unmatched: 1,
    });
    expect(filterBroadcastLog(rows, { status: "matched" })).toHaveLength(1);
    expect(complianceLoggingCsv(rows, REFERENCE_CATALOGUE)).toContain(
      "Matched recording; supplied ISRC missing",
    );
  });
  it("uses station locations for hub counts without assigning audience or streaming/search demand", () => {
    const row = capturedSpin();
    const metrics = buildHubMetrics(
      REFERENCE_CATALOGUE,
      [row, row],
      CAPTURE_NOW,
    );
    const kampala = metrics.find((metric) => metric.hub.id === "kla")!;
    expect(kampala).toMatchObject({
      spins7d: 1,
      tracks: 1,
      searchIndex: 0,
      searchGrowth: null,
    });
    expect(kampala.hub).toMatchObject({ stations: 1, reach: 0 });
    expect(
      metrics
        .filter((metric) => metric.hub.country !== "Uganda")
        .every((metric) => metric.spins7d === 0 && metric.hub.stations === 0),
    ).toBe(true);
  });
  it("does not invent all-time peak or weeks on chart for positive captured counts", () => {
    const catalogue = catalogueWithCapturedStats(
      REFERENCE_CATALOGUE,
      [capturedSpin()],
      CAPTURE_NOW,
    );
    const chart = buildWeeklyChart(catalogue, CAPTURE_NOW);
    expect(chart.entries[0]).toMatchObject({
      spins7d: 1,
      peakPosition: null,
      weeksOnChart: null,
    });
  });
  it("requires supplied identifiers and complete signed ownership before allocating a captured play", () => {
    expect(capturedPlayLedger([capturedSpin()], REFERENCE_CATALOGUE)).toEqual(
      [],
    );
    const track = rightsTrack();
    const row = capturedSpin({ trackId: track.id, isrc: track.isrc });
    const ledger = capturedPlayLedger([row, row], [track]);
    expect(ledger).toHaveLength(3);
    expect(ledger.reduce((sum, entry) => sum + entry.allocationUgx, 0)).toBe(
      priceSpin(row).allocationUgx,
    );
    expect(ledger.reduce((sum, entry) => sum + entry.plays, 0)).toBeCloseTo(1);
    expect(
      ledger.every(
        (entry) =>
          entry.memberId.startsWith("ES-") &&
          entry.timeBand === "prime" &&
          entry.multiplier === 1.5,
      ),
    ).toBe(true);
    track.ownership!.parties[0].signature = null;
    expect(capturedPlayLedger([row], [track])).toEqual([]);
  });
  it("starts calculated statements pending, never paid or approved automatically", () => {
    const track = rightsTrack();
    const model = buildCapturedRoyaltiesModel(
      [track],
      [capturedSpin({ trackId: track.id, isrc: track.isrc })],
      CAPTURE_NOW,
    );
    expect(model.statements.length).toBeGreaterThan(0);
    expect(
      model.statements.every(
        (statement) =>
          statement.status === "pending" &&
          !statement.paidAt &&
          !statement.approvedAt,
      ),
    ).toBe(true);
  });
});

function rightsTrack(): Track {
  return {
    ...REFERENCE_CATALOGUE[0],
    id: "qa-rights-track",
    primaryArtist: "QA Rights Actor",
    origin: "delivered",
    isrc: "UG-QAT-26-00001",
    ownership: {
      version: 1,
      approvalMethod: "local-acknowledgement",
      parties: ["QA Rights Actor", "QA Co-writer", "QA Producer"].map(
        (name, i) => ({
          id: `qa-party-${i}`,
          name,
          role: i === 0 ? "Primary artist" : i === 1 ? "Co-writer" : "Producer",
          shares: {
            master: i === 0 ? 100 : 0,
            mechanical: i === 0 ? 100 : 0,
            performance: i === 2 ? 33.34 : 33.33,
          },
          signature: { typedName: name, signedAt: "2026-11-01T12:00:00Z" },
        }),
      ),
    },
  };
}
