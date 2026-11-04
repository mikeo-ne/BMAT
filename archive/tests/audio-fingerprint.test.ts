import { describe, expect, it } from "vitest";

import {
  detectSpectralPeaks,
  frameEnergy,
  framePeakMagnitude,
  LOW_BIN_GUARD,
} from "@/lib/audio-fingerprint";

function frame(bins: number, fill = 0): Uint8Array {
  return new Uint8Array(bins).fill(fill);
}

describe("detectSpectralPeaks", () => {
  it("returns nothing for an empty frame", () => {
    expect(detectSpectralPeaks(new Uint8Array(0))).toEqual([]);
  });

  it("returns nothing for silence", () => {
    expect(detectSpectralPeaks(frame(32))).toEqual([]);
  });

  it("finds no landmarks in a flat frame, since nothing is a strict maximum", () => {
    expect(detectSpectralPeaks(frame(32, 200))).toEqual([]);
  });

  it("rejects a plateau of equal neighbours", () => {
    const data = frame(32);
    data[10] = 200;
    data[11] = 200;

    expect(detectSpectralPeaks(data)).toEqual([]);
  });

  it("locates a single isolated spike", () => {
    const data = frame(32);
    data[12] = 220;

    expect(detectSpectralPeaks(data)).toEqual([12]);
  });

  it("ignores the DC and rumble bins", () => {
    expect(LOW_BIN_GUARD).toBe(2);

    const data = frame(32);
    data[0] = 255;
    data[1] = 255;

    expect(detectSpectralPeaks(data)).toEqual([]);
  });

  it("accepts a bin at the low-frequency guard boundary", () => {
    const data = frame(32);
    data[LOW_BIN_GUARD] = 200;

    expect(detectSpectralPeaks(data)).toEqual([LOW_BIN_GUARD]);
  });

  it("does not let the final bin win by default against a missing neighbour", () => {
    const data = frame(32);
    data[31] = 200;
    data[30] = 210; // louder, so the edge bin loses outright

    expect(detectSpectralPeaks(data)).toEqual([30]);
  });

  it("applies the magnitude threshold", () => {
    const data = frame(32);
    data[10] = 120;

    expect(detectSpectralPeaks(data, { threshold: 140 })).toEqual([]);
    expect(detectSpectralPeaks(data, { threshold: 100 })).toEqual([10]);
  });

  it("collapses a harmonic comb to its strongest member", () => {
    const data = frame(64);
    data[8] = 200;
    data[9] = 160; // within minSpacing of bin 8
    data[20] = 180;

    expect(detectSpectralPeaks(data, { minSpacing: 2 })).toEqual([8, 20]);
  });

  it("keeps both peaks when they are spaced beyond the minimum", () => {
    const data = frame(64);
    data[8] = 200;
    data[20] = 180;

    expect(detectSpectralPeaks(data)).toEqual([8, 20]);
  });

  it("returns ascending bin order regardless of magnitude order", () => {
    const data = frame(64);
    data[40] = 250;
    data[10] = 160;
    data[25] = 200;

    expect(detectSpectralPeaks(data)).toEqual([10, 25, 40]);
  });

  it("widens the comparison window on request", () => {
    const data = frame(64);
    data[10] = 200;
    data[12] = 190; // a shoulder two bins away

    // window 1 ignores bin 12, so both qualify
    expect(detectSpectralPeaks(data, { window: 1 })).toEqual([10, 12]);
    // window 2 sees the shoulder and rejects the weaker of the pair
    expect(detectSpectralPeaks(data, { window: 2 })).toEqual([10]);
  });
});

describe("frame read-outs", () => {
  it("sums the magnitudes", () => {
    const data = frame(8);
    data[0] = 10;
    data[7] = 20;

    expect(frameEnergy(data)).toBe(30);
    expect(frameEnergy(new Uint8Array(0))).toBe(0);
  });

  it("reports the loudest bin", () => {
    const data = frame(8);
    data[3] = 240;
    data[5] = 90;

    expect(framePeakMagnitude(data)).toBe(240);
    expect(framePeakMagnitude(new Uint8Array(0))).toBe(0);
  });
});
