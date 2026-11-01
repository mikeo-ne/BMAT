"use client";
import {
  ANALYSIS_RATE,
  ANALYSIS_SECONDS,
  MAX_MASTER_SECONDS,
  pcmFeatures,
  signaturePayload,
} from "@/lib/master-signature";
import { sessionScope } from "@/lib/auth-types";
import { browserSession } from "@/lib/auth-client";
import { cachedSnapshot, cacheSnapshot } from "@/lib/browser-cache";
import type { AudioSignature } from "@/lib/types";
const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
async function analyse(
  samples: Float32Array,
): Promise<ReturnType<typeof pcmFeatures>> {
  if (typeof Worker === "undefined") return pcmFeatures(samples);
  const worker = new Worker(
    new URL("../workers/audio-signature.worker.ts", import.meta.url),
    { type: "module" },
  );
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(new Error("Audio analysis timed out. Try a shorter master.")),
        30000,
      );
      worker.onmessage = (event) => {
        clearTimeout(timer);
        if (event.data.ok)
          resolve({ waveform: event.data.waveform, bands: event.data.bands });
        else reject(new Error(event.data.error));
      };
      worker.onerror = () => {
        clearTimeout(timer);
        reject(new Error("The audio analysis worker failed."));
      };
      const buffer = new Float32Array(samples).buffer;
      worker.postMessage(buffer, [buffer]);
    });
  } finally {
    worker.terminate();
  }
}
/** Decode + downmix/resample in OfflineAudioContext; only feature processing leaves the UI thread. */
export async function fingerprintMaster(
  file: File,
  duration: number,
  expectedScope = sessionScope(browserSession().user),
): Promise<AudioSignature> {
  const userId = browserSession().user?.id;
  const assertCurrent = () => {
    if (sessionScope(browserSession().user) !== expectedScope)
      throw new Error(
        "Your account changed during audio analysis. Choose the file again in the current workspace.",
      );
  };
  assertCurrent();
  if (!window.OfflineAudioContext || !crypto.subtle)
    throw new Error(
      "Audio signatures require Web Audio and a secure HTTPS/localhost context.",
    );
  if (duration > MAX_MASTER_SECONDS)
    throw new Error(
      "Masters longer than 30 minutes exceed the browser analysis budget. The file ceiling remains 80 MB.",
    );
  const bytes = await file.arrayBuffer();
  const sourceSha256 = hex(await crypto.subtle.digest("SHA-256", bytes));
  assertCurrent();
  if (userId) {
    const cached = await cachedSnapshot<AudioSignature>(
      userId,
      "fingerprint:" + sourceSha256,
      expectedScope,
    );
    assertCurrent();
    if (cached?.algorithm === "pcm-rms-fft-v1") return cached;
  }
  const decoder = new OfflineAudioContext(1, 1, ANALYSIS_RATE);
  const decoded = await decoder.decodeAudioData(bytes);
  if (!decoded.length || decoded.duration > MAX_MASTER_SECONDS)
    throw new Error(
      "The master could not be decoded within the analysis budget.",
    );
  const analysedSec = Math.min(decoded.duration, ANALYSIS_SECONDS);
  const context = new OfflineAudioContext(
    1,
    Math.max(1, Math.floor(analysedSec * ANALYSIS_RATE)),
    ANALYSIS_RATE,
  );
  const source = context.createBufferSource();
  source.buffer = decoded;
  source.connect(context.destination);
  source.start(0);
  const rendered = await context.startRendering();
  const features = await analyse(rendered.getChannelData(0));
  const digest = hex(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(signaturePayload(features)),
    ),
  );
  const signature: AudioSignature = {
    version: 1,
    algorithm: "pcm-rms-fft-v1",
    sourceSha256,
    digest,
    sampleRate: ANALYSIS_RATE,
    durationSec: decoded.duration,
    analysedSec,
    ...features,
  };
  assertCurrent();
  if (userId)
    await cacheSnapshot(
      userId,
      "fingerprint:" + sourceSha256,
      signature,
      expectedScope,
    );
  assertCurrent();
  return signature;
}
