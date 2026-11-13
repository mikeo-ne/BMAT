import { describe, expect, it, vi } from "vitest";
import { audiomackAuthorization, audiomackPath, resolveAudiomack } from "@/lib/catalog/audiomack";
import { lookupMusicBrainz, normalizeIsrc, validIsrc } from "@/lib/catalog/musicbrainz";

const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

describe("MusicBrainz", () => {
  it("normalizes and validates only ISRCs", () => {
    expect(normalizeIsrc(" ug-a2f-21-00082 ")).toBe("UGA2F2100082");
    expect(validIsrc("UGA2F2100082")).toBe(true);
    expect(validIsrc("../../bad")).toBe(false);
  });
  it("returns multiple labelled suggestions without adding guessed writer/feature credits", async () => {
    const f = vi.fn().mockResolvedValue(response({ recordings: [null, { id: "one", title: "Slow Dancing", "artist-credit": [{ name: "Azawi" }, { name: "Guest" }] }, { id: "two", title: "Remix", "artist-credit": [{ artist: { name: "Other" } }] }] }));
    const result = await lookupMusicBrainz("UGA2F2100082", "EastSound/1 (contact@example.org)", f);
    expect(result).toEqual([
      { id: "one", title: "Slow Dancing", artistName: "Azawi", artists: ["Azawi", "Guest"], isrc: "UGA2F2100082" },
      { id: "two", title: "Remix", artistName: "Other", artists: ["Other"], isrc: "UGA2F2100082" },
    ]);
    expect(f.mock.calls[0][0]).toBe("https://musicbrainz.org/ws/2/isrc/UGA2F2100082?inc=artist-credits&fmt=json");
    expect(f.mock.calls[0][1]).toMatchObject({ redirect: "error", headers: { "user-agent": "EastSound/1 (contact@example.org)" } });
  });
  it("distinguishes not found from provider errors", async () => {
    expect(await lookupMusicBrainz("UGA2F2100082", "agent", async () => response({}, 404))).toEqual([]);
    await expect(lookupMusicBrainz("UGA2F2100082", "agent", async () => response({}, 503))).rejects.toThrow(/busy/i);
    await expect(lookupMusicBrainz("bad", "agent", vi.fn())).rejects.toThrow(/valid/);
  });
});

describe("Audiomack public catalogue", () => {
  const creds = { key: "key", secret: "secret" };
  it("uses an independently calculated OAuth HMAC-SHA1 signature", () => {
    const header = audiomackAuthorization("https://api.audiomack.com/v1/music/song/azawi/slow-dancing", creds, "1700000000", "nonce");
    expect(header).toContain('oauth_signature="Tvwxvg1BDxfucNpJbkUTAClcKCg%3D"');
    expect(header).toContain('oauth_signature_method="HMAC-SHA1"');
    expect(header).not.toContain("secret");
  });
  it("only accepts Audiomack public song and album URL paths", () => {
    expect(audiomackPath("https://audiomack.com/azawi/song/slow-dancing?x=123")).toBe("/v1/music/song/azawi/slow-dancing");
    expect(audiomackPath("https://audiomack.com/song/azawi/slow-dancing")).toBe("/v1/music/song/azawi/slow-dancing");
    expect(audiomackPath("https://audiomack.com/azawi/album/african-music")).toBe("/v1/music/album/azawi/african-music");
    for (const url of ["https://audiomack.com.evil.test/a/song/b", "http://audiomack.com/a/song/b", "https://audiomack.com:123/a/song/b", "https://audiomack.com/a/song/%2e%2e", "https://user@audiomack.com/a/song/b", "https://audiomack.com/a/playlist/b"]) expect(audiomackPath(url)).toBeNull();
  });
  it("only maps catalogue metadata and never reads or exposes the returned streaming URL", async () => {
    const f = vi.fn().mockResolvedValue(response({ results: { title: "Song", artist: "Azawi", featuring: "A & B", streaming_url: "https://secret.example/audio?token=hidden", description: "ignore" } }));
    const result = await resolveAudiomack("https://audiomack.com/azawi/song/song", creds, f);
    expect(result.ok && result.songs[0]).toMatchObject({ title: "Song", artistName: "Azawi", featured: ["A", "B"], isrc: "", artwork: null, matchedOn: "source-only" });
    expect(JSON.stringify(result)).not.toMatch(/secret|token|streaming_url/);
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toBe("https://api.audiomack.com/v1/music/song/azawi/song");
    expect(f.mock.calls[0][1].redirect).toBe("error");
  });
  it("imports a complete album but refuses partial, missing or oversized track lists", async () => {
    const url = "https://audiomack.com/azawi/album/african-music";
    const f = (body: unknown) => async () => response(body);
    const good = await resolveAudiomack(url, creds, f({ type: "album", tracks: [{ title: "One", artist: "A" }, { title: "Two", artist: "B" }] }));
    expect(good.ok && good.songs.map((s) => s.title)).toEqual(["One", "Two"]);
    for (const data of [{ tracks: [{ title: "One", artist: "A" }, { title: "Missing artist" }] }, {}, { tracks: Array(41).fill({ title: "A", artist: "B" }) }])
      expect((await resolveAudiomack(url, creds, f(data))).ok).toBe(false);
  });
  it("returns a safe error on provider refusal", async () => {
    const result = await resolveAudiomack("https://audiomack.com/a/song/b", creds, async () => response({ secret: "private" }, 401));
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("private");
  });
});
