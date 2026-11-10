import { beforeEach, describe, expect, it } from "vitest";

import {
  MAX_CREDITS,
  cleanNames,
  createSong,
  creditLine,
  demoList,
  demoSeed,
  emptyDetails,
  parseCreditLine,
  toSong,
  updateSong,
} from "@/lib/db/masters";

/**
 * One song, several writers, several features. UPRS pays people, so a blob of
 * names in one text box was the actual bug: the cue sheet printed it as if it
 * were a single composer.
 */
describe("credit lists", () => {
  it("reads the old free-text field as separate people", () => {
    expect(parseCreditLine("Nalu Akello; R. Mutebi")).toEqual(["Nalu Akello", "R. Mutebi"]);
    expect(parseCreditLine("Nalu Akello, Mutebi X & Zawadi B")).toEqual(["Nalu Akello", "Mutebi X", "Zawadi B"]);
    expect(parseCreditLine("Nalu Akello feat. Zawadi B")).toEqual(["Nalu Akello", "Zawadi B"]);
    expect(parseCreditLine("  ")).toEqual([]);
    expect(parseCreditLine(null)).toEqual([]);
  });

  it("trims, drops blanks, and never credits the same person twice", () => {
    expect(cleanNames(["  Nalu  Akello ", "", "nalu akello", "Mutebi X"])).toEqual(["Nalu Akello", "Mutebi X"]);
    expect(cleanNames(["A", "a", "A "])).toEqual(["A"]);
    expect(cleanNames(null)).toEqual([]);
  });

  it("caps a runaway list", () => {
    const many = Array.from({ length: MAX_CREDITS + 5 }, (_, i) => `Writer ${i}`);
    expect(cleanNames(many)).toHaveLength(MAX_CREDITS);
  });

  it("joins back into the single line cue sheets and CSV exports read", () => {
    expect(creditLine(["Nalu Akello", "R. Mutebi"])).toBe("Nalu Akello; R. Mutebi");
    expect(creditLine([])).toBe("");
  });
});

describe("songs carry their credits", () => {
  it("keeps the joined columns in step with the credit rows", () => {
    const song = toSong(
      { id: "r1", title: "Kampala Nights", composer: "ignored", featuring: "ignored" },
      { songwriters: ["Nalu Akello", "R. Mutebi"], featured: ["Zawadi B", "Okello Prime"] },
    );
    expect(song.songwriters).toEqual(["Nalu Akello", "R. Mutebi"]);
    expect(song.featured).toEqual(["Zawadi B", "Okello Prime"]);
    expect(song.composer).toBe("Nalu Akello; R. Mutebi");
    expect(song.featuring).toBe("Zawadi B; Okello Prime");
  });

  it("falls back to the old text when a song has no credit rows yet", () => {
    const song = toSong({ id: "r2", title: "Boda Love", composer: "Z. Birungi, K. Ssali", featuring: "Mutebi X" });
    expect(song.songwriters).toEqual(["Z. Birungi", "K. Ssali"]);
    expect(song.featured).toEqual(["Mutebi X"]);
  });

  it("starts an upload with no credits and no prototype sharing between songs", () => {
    const a = emptyDetails({ title: "A" });
    const b = emptyDetails({ title: "B" });
    a.songwriters.push("Someone");
    expect(b.songwriters).toEqual([]);
    expect(a.featured).toEqual([]);
  });
});

describe("saving credits (demo mode)", () => {
  beforeEach(() => demoSeed([]));

  it("keeps every writer and feature on a new song", async () => {
    const id = await createSong(
      { kind: "artist", userId: null },
      emptyDetails({
        title: "Ekitiibwa",
        artistName: "Mutebi X",
        songwriters: ["Mutebi X", "Nalu Akello", "R. Ssemakula"],
        featured: ["Zawadi B", "Okello Prime"],
      }),
    );
    const song = demoList().find((s) => s.id === id)!;
    expect(song.songwriters).toEqual(["Mutebi X", "Nalu Akello", "R. Ssemakula"]);
    expect(song.featured).toEqual(["Zawadi B", "Okello Prime"]);
    expect(song.composer).toBe("Mutebi X; Nalu Akello; R. Ssemakula");
    expect(song.featuring).toBe("Zawadi B; Okello Prime");
  });

  it("lets a writer be added or removed later, and dedupes what is typed", async () => {
    const id = await createSong(
      { kind: "label", orgId: null },
      emptyDetails({ title: "Nile Fever", artistName: "Okello Prime", songwriters: ["Okello Prime"] }),
    );
    const song = demoList().find((s) => s.id === id)!;
    await updateSong(id, {
      ...song,
      songwriters: ["Okello Prime", "Nalu Akello", "okello prime"],
      featured: ["Zawadi B"],
    });
    const after = demoList().find((s) => s.id === id)!;
    expect(after.songwriters).toEqual(["Okello Prime", "Nalu Akello"]);
    expect(after.featured).toEqual(["Zawadi B"]);
    expect(after.composer).toBe("Okello Prime; Nalu Akello");
  });
});
