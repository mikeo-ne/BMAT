import { createRandom, hashSeed } from "@/lib/airplay";

export const EVIDENCE_SECONDS = 10;
/** A deterministic demonstration excerpt, never represented as captured evidence. */
export function createDemoEvidenceWav(
  seed: string,
  sampleRate = 16_000,
): Uint8Array {
  const samples = EVIDENCE_SECONDS * sampleRate;
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const writeText = (offset: number, text: string) =>
    [...text].forEach((char, i) =>
      view.setUint8(offset + i, char.charCodeAt(0)),
    );
  writeText(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, samples * 2, true);
  const hash = hashSeed(seed);
  const rand = createRandom(hash);
  const frequency = 130 + (hash % 100);
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const fade = Math.min(1, t * 4, (EVIDENCE_SECONDS - t) * 4);
    const signal =
      (Math.sin(t * frequency * 2 * Math.PI) * 0.12 +
        Math.sin(t * frequency * 3 * Math.PI) * 0.04 +
        (rand() - 0.5) * 0.035) *
      fade *
      (0.65 + Math.sin(t * 2.4) * 0.25);
    view.setInt16(44 + i * 2, Math.round(signal * 32767), true);
  }
  return bytes;
}

export function demoEvidenceDataUri(seed: string): string {
  const bytes = createDemoEvidenceWav(seed);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:audio/wav;base64,${btoa(binary)}`;
}
