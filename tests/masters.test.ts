import { describe, expect, it } from "vitest";

import { encodeWav16 } from "@/lib/audio";
import { detailProblems, emptyDetails, guessFromFilename, recognition } from "@/lib/db/masters";
import { ROLE_NAV } from "@/lib/roles";

describe("song details", () => {
  it("guesses artist and title from common file names", () => {
    expect(guessFromFilename("Nalu Akello - Kampala Nights (Master).wav")).toEqual({ artistName: "Nalu Akello", title: "Kampala Nights" });
    expect(guessFromFilename("Boda_Love_final.mp3")).toEqual({ artistName: "", title: "Boda Love final" });
    expect(guessFromFilename("Zawadi B – Nile Breeze [mix].flac")).toEqual({ artistName: "Zawadi B", title: "Nile Breeze" });
  });

  it("blocks a save only for real problems, in plain words", () => {
    expect(detailProblems(emptyDetails({ title: "Song", artistName: "Me" }))).toEqual([]);
    expect(detailProblems(emptyDetails())).toEqual(["Add the song title.", "Add the artist."]);
    expect(detailProblems(emptyDetails({ title: "S", artistName: "A", isrc: "UG123" }))[0]).toMatch(/ISRC looks wrong/);
    expect(detailProblems(emptyDetails({ title: "S", artistName: "A", isrc: "UG-ABC-26-00001", upc: "123" }))[0]).toMatch(/UPC/);
  });

  it("tells the uploader where a song is in the recognition pipeline", () => {
    expect(recognition({ masterPath: null, enrolledAt: null, enrollError: null }).state).toBe("no-audio");
    expect(recognition({ masterPath: "x/reference.wav", enrolledAt: null, enrollError: null }).state).toBe("learning");
    expect(recognition({ masterPath: "x/reference.wav", enrolledAt: "2026-11-05", enrollError: null }).state).toBe("ready");
    const failed = recognition({ masterPath: "x/reference.wav", enrolledAt: null, enrollError: "too short" });
    expect(failed.state).toBe("failed");
    expect(failed.detail).toBe("too short");
  });
});

describe("reference audio", () => {
  it("writes a valid 16-bit mono WAV at the worker's sample rate", async () => {
    const blob = encodeWav16(new Float32Array([0, 1, -1, 0.5, 2]), 11025);
    const v = new DataView(await blob.arrayBuffer());
    const tag = (o: number) => String.fromCharCode(...[0, 1, 2, 3].map((i) => v.getUint8(o + i)));
    expect([tag(0), tag(8), tag(12), tag(36)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect(v.getUint16(22, true)).toBe(1); // mono
    expect(v.getUint32(24, true)).toBe(11025);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(10);
    expect([v.getInt16(46, true), v.getInt16(48, true), v.getInt16(52, true)]).toEqual([32767, -32768, 32767]); // clipped
    expect(blob.type).toBe("audio/wav");
  });
});

describe("upload navigation", () => {
  it("labels and artists both have a place to upload songs", () => {
    expect(ROLE_NAV.label.some((n) => n.id === "dropzone" && n.label === "Upload Songs")).toBe(true);
    expect(ROLE_NAV.artist.some((n) => n.id === "songs")).toBe(true);
  });
});
