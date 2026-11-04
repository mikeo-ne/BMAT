import { describe, expect, it } from "vitest";

import {
  extensionOf,
  MAX_UPLOAD_BYTES,
  parseFileName,
  splitArtists,
  validateAudioFile,
} from "@/lib/upload";

describe("extensionOf", () => {
  it("lowercases the extension", () => {
    expect(extensionOf("Track.MP3")).toBe("mp3");
    expect(extensionOf("a.b.WAV")).toBe("wav");
  });

  it("returns empty when there is no extension", () => {
    expect(extensionOf("master")).toBe("");
  });
});

describe("validateAudioFile", () => {
  it("accepts an mp3 master", () => {
    expect(
      validateAudioFile({
        name: "Song.mp3",
        size: 8_000_000,
        type: "audio/mpeg",
      }),
    ).toBeNull();
  });

  it("accepts a wav master", () => {
    expect(
      validateAudioFile({
        name: "Song.WAV",
        size: 40_000_000,
        type: "audio/wav",
      }),
    ).toBeNull();
  });

  it("rejects a non-audio file", () => {
    const reason = validateAudioFile({
      name: "cover.jpg",
      size: 500_000,
      type: "image/jpeg",
    });
    expect(reason).toMatch(/not an audio file/);
  });

  it("rejects audio that is not MP3 or WAV", () => {
    const reason = validateAudioFile({
      name: "Song.flac",
      size: 5_000_000,
      type: "audio/flac",
    });
    expect(reason).toMatch(/not MP3 or WAV/);
  });

  it("rejects an empty file", () => {
    expect(validateAudioFile({ name: "Song.mp3", size: 0 })).toMatch(/empty/);
  });

  it("rejects a file over the ceiling", () => {
    const reason = validateAudioFile({
      name: "Song.wav",
      size: MAX_UPLOAD_BYTES + 1,
    });
    expect(reason).toMatch(/ceiling/);
  });
});

describe("parseFileName", () => {
  it("splits an 'Artist - Title' delivery name", () => {
    expect(parseFileName("QA Artist Alpha - Fixture A.mp3")).toEqual({
      title: "Fixture A",
      primaryArtist: "QA Artist Alpha",
      featuredArtists: [],
    });
  });

  it("handles underscores and an en dash", () => {
    expect(parseFileName("QA_Artist_Alpha_–_Fixture A.wav")).toEqual({
      title: "Fixture A",
      primaryArtist: "QA Artist Alpha",
      featuredArtists: [],
    });
  });

  it("pulls features out of a bracketed suffix", () => {
    expect(
      parseFileName("QA Artist Delta - Fixture E (ft. QA Artist Alpha).mp3"),
    ).toEqual({
      title: "Fixture E",
      primaryArtist: "QA Artist Delta",
      featuredArtists: ["QA Artist Alpha"],
    });
  });

  it("keeps the whole name as the title when there is no separator", () => {
    expect(parseFileName("KampalaNights.mp3")).toEqual({
      title: "KampalaNights",
      primaryArtist: "",
      featuredArtists: [],
    });
  });
});

describe("splitArtists", () => {
  it.each([
    ["QA Guest One, QA Guest Two", ["QA Guest One", "QA Guest Two"]],
    ["QA Guest One & QA Guest Two", ["QA Guest One", "QA Guest Two"]],
    ["QA Guest One;QA Guest Two", ["QA Guest One", "QA Guest Two"]],
    ["QA Guest One x QA Guest Two", ["QA Guest One", "QA Guest Two"]],
    ["", []],
  ])("%s -> %j", (input, expected) => {
    expect(splitArtists(input)).toEqual(expected);
  });
});
