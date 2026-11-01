import { publicHttpsUrl } from "@/lib/public-url";

export const MAX_EVIDENCE_VERIFY_BYTES = 16 * 1024 * 1024;

/** Verify exactly the downloaded bytes, not the URL or an illustrative waveform. Requires provider CORS. */
export async function verifyCapturedEvidence(
  url: string,
  expectedSha256: string,
  signal: AbortSignal,
): Promise<{ status: "verified"; blob: Blob } | { status: "mismatch" }> {
  signal.throwIfAborted();
  if (!publicHttpsUrl(url) || !/^[a-f0-9]{64}$/i.test(expectedSha256))
    throw new Error("Invalid evidence reference.");
  if (!globalThis.crypto?.subtle)
    throw new Error("A secure HTTPS browser is required.");
  const response = await fetch(url, {
    signal,
    mode: "cors",
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
    referrerPolicy: "no-referrer",
  });
  if (!response.ok || !response.body)
    throw new Error("Evidence download unavailable.");
  if (
    Number(response.headers.get("content-length")) > MAX_EVIDENCE_VERIFY_BYTES
  ) {
    await response.body.cancel();
    throw new Error("Evidence exceeds the 16 MB verification limit.");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_EVIDENCE_VERIFY_BYTES) {
        await reader.cancel();
        throw new Error("Evidence exceeds the 16 MB verification limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  )
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  if (digest !== expectedSha256.toLowerCase()) return { status: "mismatch" };
  return {
    status: "verified",
    blob: new Blob([bytes.buffer], {
      type: response.headers.get("content-type") ?? "application/octet-stream",
    }),
  };
}
