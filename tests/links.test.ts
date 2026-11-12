import { describe, expect, it } from "vitest";
import { featuredFromTitle, normTitle, parseLink, pickMatch, resolveLink, splitArtistTitle } from "@/lib/links/resolve";
import { matchFileToSong, splitLinks } from "@/lib/db/links";

const json = (body: unknown, url = "") => ({ ok: true, url, json: async () => body, text: async () => JSON.stringify(body) }) as unknown as Response;
const html = (body: string, url = "") => ({ ok: true, url, json: async () => ({}), text: async () => body }) as unknown as Response;

const DZ_TRACK = { id: 1, title: "Sitya Loss", title_short: "Sitya Loss", isrc: "usuyg1111111", duration: 249, release_date: "2014-06-01",
  artist: { name: "Eddy Kenzo" }, contributors: [{ name: "Eddy Kenzo", role: "Main" }], album: { id: 9 } };
const DZ_ALBUM = { id: 9, title: "Sitya Loss", upc: "123456789012", label: "Big Talent", release_date: "2014-06-01", genres: { data: [{ name: "African Music" }] } };

function fakeFetch(routes: Record<string, Response>) {
  const calls: string[] = [];
  const f = async (url: string) => {
    calls.push(url);
    for (const [k, v] of Object.entries(routes)) if (url.startsWith(k)) return v;
    return { ok: false, url, json: async () => null, text: async () => "" } as unknown as Response;
  };
  return { f, calls };
}

describe("music links", () => {
  it("accepts only known music sites", () => {
    expect(parseLink("https://open.spotify.com/track/abc")).not.toBeNull();
    expect(parseLink("https://evil.example.com/track/1")).toBeNull();
    expect(parseLink("http://169.254.169.254/latest")).toBeNull();
    expect(parseLink("file:///etc/passwd")).toBeNull();
  });

  it("refuses other sites without fetching anything", async () => {
    const { f, calls } = fakeFetch({});
    const r = await resolveLink("https://example.com/song", f);
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("reads a Deezer track with ISRC, UPC, label and genre", async () => {
    const { f } = fakeFetch({ "https://api.deezer.com/track/1": json(DZ_TRACK), "https://api.deezer.com/album/9": json(DZ_ALBUM) });
    const r = await resolveLink("https://www.deezer.com/en/track/1", f);
    expect(r.ok && r.songs[0]).toMatchObject({ title: "Sitya Loss", artistName: "Eddy Kenzo", isrc: "USUYG1111111", upc: "123456789012", label: "Big Talent", genre: "African Music", matchedOn: "deezer" });
  });

  it("reads a Spotify link, then finds the codes on Deezer by title, artist and length", async () => {
    const entity = { title: "Sitya Loss", artists: [{ name: "Eddy Kenzo" }, { name: "Guest" }], duration: 249500, releaseDate: { isoString: "2014-06-01T00:00:00Z" } };
    const page = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { state: { data: { entity } } } } })}</script>`;
    const { f } = fakeFetch({
      "https://open.spotify.com/embed/track/": html(page, "https://open.spotify.com/embed/track/0eGsygTp906u18L0Oimnem"),
      "https://api.deezer.com/search": json({ data: [{ id: 5, title: "Sitya Loss (Remix)", duration: 213, artist: { name: "Eddy Kenzo" } }, { id: 1, title: "Sitya Loss", duration: 249, artist: { name: "Eddy Kenzo" } }] }),
      "https://api.deezer.com/track/1": json(DZ_TRACK),
      "https://api.deezer.com/album/9": json(DZ_ALBUM),
    });
    const r = await resolveLink("https://open.spotify.com/track/0eGsygTp906u18L0Oimnem?si=x", f);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.platform).toBe("Spotify");
    expect(r.songs[0]).toMatchObject({ title: "Sitya Loss", isrc: "USUYG1111111", upc: "123456789012", featured: ["Guest"], matchedOn: "deezer" });
  });

  it("keeps title and artist but no codes when Deezer has no confident match", async () => {
    const { f } = fakeFetch({
      "https://www.youtube.com/oembed": json({ title: "Lamaro Grace - Kampala Nights (Official Video)", author_name: "Lamaro Grace VEVO" }),
      "https://api.deezer.com/search": json({ data: [{ id: 7, title: "Kampala Nights", duration: 300, artist: { name: "Someone Else" } }] }),
    });
    const r = await resolveLink("https://www.youtube.com/watch?v=abc", f);
    expect(r.ok && r.songs[0]).toMatchObject({ title: "Kampala Nights", artistName: "Lamaro Grace", isrc: "", matchedOn: "source-only" });
  });

  it("never gives the original's ISRC to a remix or a different length", () => {
    const hits = [{ id: 1, title: "Song (Remix)", duration: 200, artist: { name: "A" } }, { id: 2, title: "Song", duration: 260, artist: { name: "A" } }];
    expect(pickMatch(hits, { title: "Song", artist: "A", durationSec: 200 })).toBeNull();
    expect(pickMatch(hits, { title: "Song", artist: "A", durationSec: 258 })?.id).toBe(2);
    expect(pickMatch(hits, { title: "Song (Remix)", artist: "A", durationSec: 200 })?.id).toBe(1);
  });

  it("parses titles, featured artists and pasted lists", () => {
    expect(splitArtistTitle("Azawi - Slow Dancing [Official Audio]")).toEqual({ artist: "Azawi", title: "Slow Dancing" });
    expect(featuredFromTitle("Song (feat. A & B)")).toEqual(["A", "B"]);
    expect(normTitle("Kampala Nights (feat. X) [Official Video]")).toBe("kampala nights");
    expect(splitLinks("https://a.com/1\nhttps://a.com/2, https://a.com/1 not-a-link")).toEqual(["https://a.com/1", "https://a.com/2"]);
  });

  it("pairs a dropped audio file with its song by title", () => {
    const titles = ["Kampala Nights", "Omukwano"];
    expect(matchFileToSong("Omukwano", titles)).toBe(1);
    expect(matchFileToSong("Kampala Nights Master", titles)).toBe(0);
    expect(matchFileToSong("Something Else", titles)).toBe(-1);
  });
});
