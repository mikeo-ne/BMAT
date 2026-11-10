import { describe, expect, it } from "vitest";

import { isSafeStreamUrl, slugPreview, validateStationRequest } from "@/lib/station-request";

/**
 * A broadcaster claiming a station is how a real organisation gets a dashboard.
 * The failure modes are concrete: a claim with no station, a name that collides
 * with an existing slug, or a stream URL that points somewhere it must not.
 */
describe("slugPreview", () => {
  it("mirrors the SQL slug rule used when the station is created", () => {
    expect(slugPreview("Next Radio", "106.1")).toBe("next-radio-106-1");
    expect(slugPreview("  Pearl   FM ", "107.9")).toBe("pearl-fm-107-9");
    expect(slugPreview("UBC TV")).toBe("ubc-tv");
  });

  it("never returns punctuation-only slugs", () => {
    expect(slugPreview("!!!")).toBe("");
    expect(slugPreview("— —")).toBe("");
  });
});

describe("isSafeStreamUrl", () => {
  it("accepts real radio and TV endpoints", () => {
    expect(isSafeStreamUrl("https://stream.zeno.fm/lbca7zintcnuv")).toBe(true);
    expect(isSafeStreamUrl("http://radio.kfm.co.ug:8000/stream")).toBe(true);
    expect(isSafeStreamUrl("https://example.com/live/playlist.m3u8")).toBe(true);
  });

  it("refuses local files, pipes and loopback addresses", () => {
    for (const bad of ["file:///etc/passwd", "pipe:1", "http://localhost:3000/x", "http://127.0.0.1/x", "http://box.local/x", "", "just text"]) {
      expect(isSafeStreamUrl(bad)).toBe(false);
    }
  });
});

describe("validateStationRequest", () => {
  it("requires a station when claiming", () => {
    const r = validateStationRequest({ mode: "claim" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors.stationId).toMatch(/Pick the station/);
  });

  it("builds a claim payload without inventing station fields", () => {
    const r = validateStationRequest({ mode: "claim", stationId: "abc", streamUrl: "", kind: "radio" });
    expect(r.ok && r.payload).toEqual({ station_id: "abc", kind: "radio", stream_url: null, note: null });
  });

  it("requires a real name for a new station", () => {
    expect(validateStationRequest({ mode: "new", name: "A" }).ok).toBe(false);
    expect(validateStationRequest({ mode: "new", name: "   " }).ok).toBe(false);
    expect(validateStationRequest({ mode: "new", name: "Q".repeat(81) }).ok).toBe(false);
    expect(validateStationRequest({ mode: "new", name: "Next Radio" }).ok).toBe(true);
  });

  it("keeps region to the four reported regions", () => {
    const bad = validateStationRequest({ mode: "new", name: "Next Radio", region: "Kampala" });
    expect(!bad.ok && bad.errors.region).toMatch(/Central, Western, Eastern or Northern/);
    const good = validateStationRequest({ mode: "new", name: "Next Radio", region: "Central" });
    expect(good.ok).toBe(true);
  });

  it("rejects an unsafe stream URL but allows leaving it blank", () => {
    const unsafe = validateStationRequest({ mode: "new", name: "Next Radio", streamUrl: "file:///etc/passwd" });
    expect(!unsafe.ok && unsafe.errors.streamUrl).toMatch(/stream address/);
    const blank = validateStationRequest({ mode: "new", name: "Next Radio" });
    expect(blank.ok && blank.payload.stream_url).toBeNull();
  });

  it("accepts a TV channel and keeps the type", () => {
    const r = validateStationRequest({ mode: "new", name: "UBC TV", kind: "tv", streamUrl: "https://example.com/ubc.m3u8" });
    expect(r.ok && r.payload.kind).toBe("tv");
    expect(r.ok && r.payload.stream_url).toBe("https://example.com/ubc.m3u8");
  });

  it("defaults an unknown type to radio rather than trusting the form", () => {
    const r = validateStationRequest({ mode: "new", name: "Next Radio", kind: "podcast" as never });
    expect(r.ok && r.payload.kind).toBe("radio");
  });

  it("caps the note length", () => {
    const r = validateStationRequest({ mode: "new", name: "Next Radio", note: "x".repeat(501) });
    expect(!r.ok && r.errors.note).toMatch(/500 characters/);
  });
});
