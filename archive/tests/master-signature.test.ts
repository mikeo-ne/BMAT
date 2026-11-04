import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  pcmFeatures,
  parseAudioSignature,
  signaturePayload,
} from "@/lib/master-signature";
import { toneMaster } from "@/tests/fixtures/master";
import { DEMO_RECORDINGS, DEMO_ORGANISATION } from "@/lib/demo-data";
describe("content-derived PCM/FFT master signatures", () => {
  it("computes stable, nonconstant waveform energy and 128 eight-band FFT frames from real PCM", () => {
    const a = toneMaster(1, 440),
      b = toneMaster(1, 2200);
    expect(a.signature.waveform).toHaveLength(128);
    expect(a.signature.bands).toHaveLength(1024);
    expect(a.signature.waveform.some((n) => n > 0)).toBe(true);
    expect(a.signature.bands).not.toEqual(b.signature.bands);
    expect(a.signature.digest).not.toBe(b.signature.digest);
    expect(toneMaster(1, 440).signature).toEqual(a.signature);
    expect(parseAudioSignature(a.signature)).toEqual(a.signature);
  });
  it("validates bounded feature vectors, source hashes, algorithm versions and duration budgets", () => {
    const { signature } = toneMaster();
    expect(parseAudioSignature({ ...signature, waveform: [1] })).toBeNull();
    expect(parseAudioSignature({ ...signature, version: 2 })).toBeNull();
    expect(parseAudioSignature({ ...signature, durationSec: 1801 })).toBeNull();
    expect(
      parseAudioSignature({ ...signature, sourceSha256: "not-a-hash" }),
    ).toBeNull();
    expect(
      parseAudioSignature({ ...signature, bands: Array(1024).fill(256) }),
    ).toBeNull();
    expect(() => pcmFeatures(new Float32Array(0))).toThrow();
    expect(signaturePayload(signature)).not.toContain("durationSec");
  });
  it("keeps named demonstration metadata separate and provides exactly 10 seconds of actual playable PCM", async () => {
    const bytes = await readFile("public/demo/east-sound-sample.wav");
    expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
    expect(bytes.toString("ascii", 8, 12)).toBe("WAVE");
    expect(bytes.readUInt32LE(40) / bytes.readUInt32LE(28)).toBe(10);
    expect(bytes.some((n, i) => i > 44 && n !== 0)).toBe(true);
    expect(DEMO_RECORDINGS.map((t) => t.artist)).toEqual([
      "Mukisa Collective",
      "Ray Bwete",
    ]);
    expect(DEMO_ORGANISATION).toBe("UPRS");
  });
});
