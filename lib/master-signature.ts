import type { AudioSignature } from "@/lib/types";
export const ANALYSIS_RATE = 11025;
export const ANALYSIS_SECONDS = 120;
export const MAX_MASTER_SECONDS = 1800;
const SIZE = 1024,
  ROWS = 128,
  BANDS = 8;
function fft(re: Float64Array, im: Float64Array) {
  for (let i = 1, j = 0; i < SIZE; i++) {
    let bit = SIZE >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
    }
  }
  for (let len = 2; len <= SIZE; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    for (let i = 0; i < SIZE; i += len) {
      for (let j = 0; j < len / 2; j++) {
        const cos = Math.cos(angle * j),
          sin = Math.sin(angle * j),
          a = i + j,
          b = a + len / 2,
          real = re[b] * cos - im[b] * sin,
          imag = re[b] * sin + im[b] * cos;
        re[b] = re[a] - real;
        im[b] = im[a] - imag;
        re[a] += real;
        im[a] += imag;
      }
    }
  }
}
/** Deterministic RMS + log-band FFT features from actual decoded mono PCM; not device fingerprinting. */
export function pcmFeatures(samples: Float32Array): {
  waveform: number[];
  bands: number[];
} {
  if (!samples.length || samples.length > ANALYSIS_RATE * ANALYSIS_SECONDS)
    throw new Error("Invalid analysis window.");
  const waveform: number[] = [],
    bands: number[] = [],
    re = new Float64Array(SIZE),
    im = new Float64Array(SIZE);
  const edges = [40, 90, 180, 360, 720, 1440, 2880, 4300, 5513].map((hz) =>
    Math.max(1, Math.min(SIZE / 2, Math.floor((hz * SIZE) / ANALYSIS_RATE))),
  );
  for (let row = 0; row < ROWS; row++) {
    const start = Math.floor((row * samples.length) / ROWS),
      end = Math.max(
        start + 1,
        Math.floor(((row + 1) * samples.length) / ROWS),
      );
    let energy = 0;
    for (let i = start; i < Math.min(end, samples.length); i++) {
      const n = Number.isFinite(samples[i]) ? samples[i] : 0;
      energy += n * n;
    }
    waveform.push(
      Math.min(255, Math.round(Math.sqrt(energy / (end - start)) * 255)),
    );
    const center = Math.floor(((row + 0.5) * samples.length) / ROWS);
    for (let i = 0; i < SIZE; i++) {
      const value = samples[center - SIZE / 2 + i] ?? 0;
      re[i] =
        (Number.isFinite(value) ? value : 0) *
        (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (SIZE - 1)));
      im[i] = 0;
    }
    fft(re, im);
    const energies: number[] = [];
    for (let band = 0; band < BANDS; band++) {
      let sum = 0;
      for (let bin = edges[band]; bin < edges[band + 1]; bin++)
        sum += re[bin] * re[bin] + im[bin] * im[bin];
      energies.push(Math.log1p(sum));
    }
    const maximum = Math.max(1e-9, ...energies);
    bands.push(...energies.map((value) => Math.round((255 * value) / maximum)));
  }
  return { waveform, bands };
}
export function signaturePayload(
  signature: Pick<AudioSignature, "waveform" | "bands">,
): string {
  return JSON.stringify({
    algorithm: "pcm-rms-fft-v1",
    sampleRate: ANALYSIS_RATE,
    waveform: signature.waveform,
    bands: signature.bands,
  });
}
export function parseAudioSignature(value: unknown): AudioSignature | null {
  if (!value || typeof value !== "object") return null;
  const s = value as AudioSignature;
  const vector = (v: unknown, n: number) =>
    Array.isArray(v) &&
    v.length === n &&
    v.every((x) => Number.isInteger(x) && x >= 0 && x <= 255);
  if (
    s.version !== 1 ||
    s.algorithm !== "pcm-rms-fft-v1" ||
    s.sampleRate !== ANALYSIS_RATE ||
    !/^[a-f0-9]{64}$/.test(s.sourceSha256) ||
    !/^[a-f0-9]{64}$/.test(s.digest) ||
    !Number.isFinite(s.durationSec) ||
    s.durationSec <= 0 ||
    s.durationSec > MAX_MASTER_SECONDS ||
    !Number.isFinite(s.analysedSec) ||
    s.analysedSec <= 0 ||
    s.analysedSec > ANALYSIS_SECONDS ||
    s.analysedSec > s.durationSec + 0.1 ||
    !vector(s.waveform, ROWS) ||
    !vector(s.bands, ROWS * BANDS)
  )
    return null;
  return {
    version: 1,
    algorithm: "pcm-rms-fft-v1",
    sourceSha256: s.sourceSha256,
    digest: s.digest,
    sampleRate: ANALYSIS_RATE,
    durationSec: s.durationSec,
    analysedSec: s.analysedSec,
    waveform: s.waveform,
    bands: s.bands,
  };
}
