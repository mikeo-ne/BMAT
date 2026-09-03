/**
 * Spectral landmark extraction for the live fingerprint monitor.
 *
 * Real audio fingerprinting (Wang 2003, the Shazam approach) reduces a
 * spectrogram to a sparse constellation of *landmarks*: bins that are local
 * maxima in both time and frequency and that survive a magnitude floor. The
 * hashes are then paired against a reference index.
 *
 * This module implements only the extraction half, and does so on a single
 * magnitude frame rather than a time series — BMAT has no reference index to
 * match against, so the peaks here are a visualisation of spectral salience,
 * **not** a working recognition result. The matching half is simulated
 * separately in `lib/monitoring.ts`.
 *
 * Kept pure and dependency-free so it is unit-testable without a canvas or an
 * AudioContext.
 */

/** Bin 0 is DC and bin 1 is usually mains/handling rumble; both dominate. */
export const LOW_BIN_GUARD = 2;

/**
 * Minimum separation between accepted landmarks, in bins.
 *
 * A single sustained tone produces a harmonic comb, and without this every
 * harmonic would qualify — which is exactly what constellation hashing avoids.
 */
export const MIN_PEAK_SPACING = 2;

export interface PeakOptions {
  /** Minimum magnitude (0–255) for a bin to qualify. */
  threshold?: number;
  /** Half-width of the local-maximum comparison window, in bins. */
  window?: number;
  /** Minimum spacing between accepted peaks, in bins. */
  minSpacing?: number;
}

/**
 * Return the bin indices of the spectral landmarks in one magnitude frame.
 *
 * A bin qualifies when it is strictly greater than every bin within
 * `window` on both sides **and** meets `threshold`. Acceptance is greedy from
 * the strongest bin down, so a dense harmonic stack yields its loudest member
 * rather than a cluster.
 *
 * @param spectrum magnitudes from `AnalyserNode.getByteFrequencyData`
 * @returns ascending bin indices, strongest first is *not* guaranteed — sort
 *          by magnitude at the call site if you need salience order
 */
export function detectSpectralPeaks(
  spectrum: Uint8Array,
  { threshold = 140, window = 1, minSpacing = MIN_PEAK_SPACING }: PeakOptions = {},
): number[] {
  const length = spectrum.length;
  if (length === 0) return [];

  const candidates: number[] = [];

  for (let i = LOW_BIN_GUARD; i < length; i++) {
    const value = spectrum[i];
    if (value < threshold) continue;

    let isLocalMax = true;

    for (let offset = 1; offset <= window; offset++) {
      const left = i - offset;
      const right = i + offset;

      // Out-of-range neighbours are treated as non-competing rather than as
      // zeros, so an edge bin cannot win by default.
      if (left >= 0 && spectrum[left] >= value) {
        isLocalMax = false;
        break;
      }
      if (right < length && spectrum[right] >= value) {
        isLocalMax = false;
        break;
      }
    }

    if (isLocalMax) candidates.push(i);
  }

  // Greedy descent by magnitude, enforcing a minimum spacing.
  const byMagnitude = [...candidates].sort(
    (a, b) => spectrum[b] - spectrum[a] || a - b,
  );

  const accepted: number[] = [];

  for (const bin of byMagnitude) {
    const tooClose = accepted.some((taken) => Math.abs(taken - bin) < minSpacing);
    if (!tooClose) accepted.push(bin);
  }

  return accepted.sort((a, b) => a - b);
}

/** Total magnitude of a frame, useful for an overall level read-out. */
export function frameEnergy(spectrum: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < spectrum.length; i++) sum += spectrum[i];
  return sum;
}

/** Loudest magnitude in a frame (0–255). */
export function framePeakMagnitude(spectrum: Uint8Array): number {
  let peak = 0;
  for (let i = 0; i < spectrum.length; i++) {
    if (spectrum[i] > peak) peak = spectrum[i];
  }
  return peak;
}
