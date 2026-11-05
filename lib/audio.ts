"use client";

// Web Audio helpers.
// RULE: getAudioContext() must only be called from inside a user-gesture
// handler (onClick / onDrop / onChange). Mobile Safari & Chrome refuse to
// start audio otherwise, and creating it during render breaks SSR.

let ctx: AudioContext | null = null;
let stopCurrent: (() => void) | null = null;

export function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    if (!ctx || ctx.state === "closed") ctx = new Ctor();
    if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
    return ctx;
  } catch {
    return null;
  }
}

/** Stop whatever snippet is currently playing (one evidence clip at a time). */
export function stopActiveSnippet() {
  try {
    stopCurrent?.();
  } catch {
    /* ignore */
  }
  stopCurrent = null;
}

export type SnippetHandle = { analyser: AnalyserNode; stop: () => void; duration: number };

/**
 * Play a 10-second evidence snippet.
 * - If `url` is given (e.g. a signed Supabase Storage URL to the detection
 *   clip), it is fetched, decoded and the first `seconds` are played.
 * - Otherwise a deterministic placeholder groove is synthesised from `seed`
 *   so the player works before real evidence clips exist.
 */
export async function playEvidenceSnippet(
  audio: AudioContext,
  opts: { seed: number; url?: string; seconds?: number; onEnded?: () => void },
): Promise<SnippetHandle> {
  stopActiveSnippet();
  const seconds = opts.seconds ?? 10;
  const master = audio.createGain();
  const analyser = audio.createAnalyser();
  analyser.fftSize = 256;
  master.connect(analyser);
  analyser.connect(audio.destination);

  const t0 = audio.currentTime + 0.05;
  const end = t0 + seconds;
  const nodes: AudioScheduledSourceNode[] = [];

  if (opts.url) {
    const res = await fetch(opts.url);
    if (!res.ok) throw new Error(`Evidence clip unavailable (${res.status})`);
    const buf = await audio.decodeAudioData(await res.arrayBuffer());
    const src = audio.createBufferSource();
    src.buffer = buf;
    src.connect(master);
    src.start(t0, 0, Math.min(seconds, buf.duration));
    nodes.push(src);
  } else {
    synthGroove(audio, master, t0, seconds, opts.seed, nodes);
  }

  // Fade in/out to avoid clicks.
  master.gain.setValueAtTime(0, t0);
  master.gain.linearRampToValueAtTime(0.8, t0 + 0.15);
  master.gain.setValueAtTime(0.8, end - 0.4);
  master.gain.linearRampToValueAtTime(0, end);

  let stopped = false;
  const timer = window.setTimeout(() => stop(), (seconds + 0.2) * 1000);
  function stop() {
    if (stopped) return;
    stopped = true;
    window.clearTimeout(timer);
    for (const n of nodes) {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
    }
    try {
      master.disconnect();
      analyser.disconnect();
    } catch {
      /* ignore */
    }
    if (stopCurrent === stop) stopCurrent = null;
    opts.onEnded?.();
  }
  stopCurrent = stop;
  return { analyser, stop, duration: seconds };
}

function synthGroove(
  audio: AudioContext,
  out: AudioNode,
  t0: number,
  seconds: number,
  seed: number,
  nodes: AudioScheduledSourceNode[],
) {
  const roots = [55, 58.27, 61.74, 65.41, 69.3, 73.42];
  const root = roots[Math.abs(seed) % roots.length];
  const bpm = 96 + (Math.abs(seed) % 5) * 6;
  const beat = 60 / bpm;

  // Kick on every beat.
  for (let t = 0; t < seconds; t += beat) {
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.frequency.setValueAtTime(140, t0 + t);
    o.frequency.exponentialRampToValueAtTime(42, t0 + t + 0.18);
    g.gain.setValueAtTime(0.9, t0 + t);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + t + 0.25);
    o.connect(g).connect(out);
    o.start(t0 + t);
    o.stop(t0 + t + 0.3);
    nodes.push(o);
  }

  // Bassline: root / fifth / octave pattern on eighths.
  const pattern = [1, 1, 1.5, 1, 2, 1.5, 1, 1.333];
  let i = 0;
  for (let t = 0; t < seconds; t += beat / 2, i++) {
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = "triangle";
    o.frequency.value = root * pattern[i % pattern.length];
    g.gain.setValueAtTime(0.0001, t0 + t);
    g.gain.exponentialRampToValueAtTime(0.25, t0 + t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + t + beat / 2);
    o.connect(g).connect(out);
    o.start(t0 + t);
    o.stop(t0 + t + beat / 2 + 0.05);
    nodes.push(o);
  }

  // Pad chord through a low-pass filter.
  const filter = audio.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;
  const pad = audio.createGain();
  pad.gain.value = 0.06;
  filter.connect(pad).connect(out);
  for (const ratio of [4, 5, 6]) {
    const o = audio.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = root * ratio;
    o.connect(filter);
    o.start(t0);
    o.stop(t0 + seconds);
    nodes.push(o);
  }
}

export type Fingerprint = {
  hash: string;
  durationSec: number;
  sampleRate: number;
  envelope: number[]; // 32 normalised energy buckets for display
};

/**
 * Client-side acoustic fingerprint (prototype).
 * Decodes the file, takes the first 60 s, computes per-frame RMS energy and
 * zero-crossing rate, quantises them and hashes the result with SHA-256.
 * This is enough to de-duplicate identical masters in a batch upload; robust
 * broadcast matching (noise, EQ, pitch shift) is done server-side.
 */
export async function fingerprintFile(audio: AudioContext, file: File): Promise<Fingerprint> {
  return fingerprintBuffer(await audio.decodeAudioData(await file.arrayBuffer()));
}

async function fingerprintBuffer(buf: AudioBuffer): Promise<Fingerprint> {
  const data = buf.getChannelData(0);
  const limit = Math.min(data.length, buf.sampleRate * 60);
  const frame = 4096;
  const frames = Math.max(1, Math.floor(limit / frame));
  const bytes = new Uint8Array(frames * 2);
  const energies: number[] = new Array(frames);

  for (let f = 0; f < frames; f++) {
    let sum = 0;
    let zc = 0;
    let prev = 0;
    const off = f * frame;
    for (let i = 0; i < frame && off + i < limit; i++) {
      const s = data[off + i];
      sum += s * s;
      if ((s >= 0) !== (prev >= 0)) zc++;
      prev = s;
    }
    const rms = Math.sqrt(sum / frame);
    energies[f] = rms;
    bytes[f * 2] = Math.min(255, Math.round(rms * 512));
    bytes[f * 2 + 1] = Math.min(255, Math.round((zc / frame) * 1024));
  }

  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest))
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const buckets = 32;
  const per = Math.max(1, Math.floor(frames / buckets));
  const env: number[] = [];
  for (let b = 0; b < buckets; b++) {
    let s = 0;
    for (let i = 0; i < per; i++) s += energies[b * per + i] ?? 0;
    env.push(s / per);
  }
  const max = Math.max(...env, 1e-6);
  return {
    hash,
    durationSec: buf.duration,
    sampleRate: buf.sampleRate,
    envelope: env.map((v) => v / max),
  };
}

/** Sample rate the ingest worker fingerprints at (see workers/ingest). */
export const REFERENCE_RATE = 11025;
/** Longest reference kept: 15 min of 16-bit mono at 11 kHz ≈ 20 MB (bucket limit 25 MB). */
export const REFERENCE_MAX_SEC = 15 * 60;

export type Reference = Fingerprint & { wav: Blob; truncated: boolean };

/**
 * Decode a master once and produce both the browser fingerprint (for duplicate
 * checks) and a small mono 11 kHz WAV "reference copy" for the ingest worker.
 * The reference is all the worker needs to recognise the song on air, and at a
 * few MB per song it uploads quickly on mobile data. The full-quality master
 * never leaves the user's device.
 */
export async function makeReference(audio: AudioContext, file: File): Promise<Reference> {
  const buf = await audio.decodeAudioData(await file.arrayBuffer());
  const fp = await fingerprintBuffer(buf);
  const seconds = Math.min(buf.duration, REFERENCE_MAX_SEC);
  const frames = Math.max(1, Math.ceil(seconds * REFERENCE_RATE));
  const Offline = (globalThis as { OfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext;
  if (!Offline) throw new Error("This browser can't prepare audio for upload.");
  const off = new Offline(1, frames, REFERENCE_RATE);
  const src = off.createBufferSource();
  src.buffer = buf; // OfflineAudioContext down-mixes to mono and resamples
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  return { ...fp, wav: encodeWav16(rendered.getChannelData(0), REFERENCE_RATE), truncated: buf.duration > REFERENCE_MAX_SEC };
}

/** 16-bit PCM mono WAV. */
export function encodeWav16(samples: Float32Array, rate: number): Blob {
  const out = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const str = (o: number, t: string) => { for (let i = 0; i < t.length; i++) out.setUint8(o + i, t.charCodeAt(i)); };
  str(0, "RIFF"); out.setUint32(4, 36 + samples.length * 2, true); str(8, "WAVE");
  str(12, "fmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, rate, true); out.setUint32(28, rate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true);
  str(36, "data"); out.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i] || 0));
    out.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return new Blob([out.buffer], { type: "audio/wav" });
}
