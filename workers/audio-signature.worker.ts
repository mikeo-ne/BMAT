import { pcmFeatures } from "@/lib/master-signature";
self.onmessage = (event: MessageEvent<ArrayBuffer>) => {
  try {
    const features = pcmFeatures(new Float32Array(event.data));
    self.postMessage({ ok: true, ...features });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : "Audio analysis failed.",
    });
  }
};
