import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { put, del, head, get } from "@vercel/blob";
import { privateBlobToken } from "@/lib/master-storage-config";
import { postgresTenant } from "@/lib/postgres/pool";
import { hasAudioSignature, MAX_UPLOAD_BYTES } from "@/lib/upload";
import { HttpError } from "@/lib/auth-core";
import { audioByteRange } from "@/lib/audio-range";
import type { Track } from "@/lib/types";

const checks = new Map<string, { until: number; pending?: Promise<void> }>();
export function privateMasterUrl(value: string, pathname: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      /^[a-z0-9]+\.private\.blob\.vercel-storage\.com$/.test(url.hostname) &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      decodeURIComponent(url.pathname.slice(1)) === pathname
    );
  } catch {
    return false;
  }
}
/** A non-sensitive four-byte probe must succeed privately before any real master ticket is issued.
 * Public stores fail closed, even if an operator accidentally connects one. No master is used as a probe.
 */
export async function assertPrivateBlobStore(): Promise<void> {
  const token = privateBlobToken();
  if (
    process.env.VERCEL_BLOB_API_URL ||
    process.env.NEXT_PUBLIC_VERCEL_BLOB_API_URL
  )
    throw new HttpError(
      503,
      "Custom Blob API endpoints are not supported for private masters.",
    );
  const key = createHash("sha256")
    .update(token + postgresTenant())
    .digest("hex");
  const previous = checks.get(key);
  if (previous && previous.until > Date.now()) return;
  if (previous?.pending) return previous.pending;
  const pending = (async () => {
    const pathname = `east-sound/${postgresTenant()}/checks/${randomUUID()}`;
    let created = false;
    try {
      const blob = await put(pathname, Buffer.from([69, 83, 0, 1]), {
        token,
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: "application/octet-stream",
        cacheControlMaxAge: 60,
        abortSignal: AbortSignal.timeout(12000),
      });
      created = true;
      if (!privateMasterUrl(blob.url, pathname))
        throw new Error("private_store_required");
      const response = await fetch(blob.url, {
        method: "GET",
        headers: { range: "bytes=0-3" },
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      await response.body?.cancel().catch(() => undefined);
      if (![401, 403, 404].includes(response.status))
        throw new Error("anonymous_blob_access");
    } catch {
      checks.delete(key);
      throw new HttpError(
        503,
        "Private master storage could not be verified. Connect a PRIVATE Blob store; no master upload ticket was issued.",
      );
    } finally {
      if (created)
        await del(pathname, {
          token,
          abortSignal: AbortSignal.timeout(8000),
        }).catch(() => {
          checks.delete(key);
          throw new HttpError(
            503,
            "Private storage cleanup could not be verified. No master upload ticket was issued.",
          );
        });
    }
    checks.set(key, { until: Date.now() + 5 * 60000 });
  })();
  checks.set(key, { until: 0, pending });
  // Prevent repeated credential rotations from growing an unbounded process cache.
  if (checks.size > 8)
    for (const [entry, value] of checks)
      if (entry !== key && !value.pending) checks.delete(entry);
  return pending;
}
export async function removePrivateBlob(pathname: string): Promise<void> {
  await del(pathname, {
    token: privateBlobToken(),
    abortSignal: AbortSignal.timeout(12000),
  });
}
function strongEtag(value: string): string {
  if (value.startsWith("W/"))
    throw new HttpError(503, "Storage returned a weak master validator.");
  const tag =
    value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
  if (!/^[\x21\x23-\x5b\x5d-\x7e]{1,200}$/.test(tag))
    throw new HttpError(503, "Storage returned an invalid master validator.");
  return tag;
}
export async function verifyPrivateMaster(input: {
  pathname: string;
  sizeBytes: number;
  mimeType: string;
  format: "MP3" | "WAV";
  sourceSha256: string;
}): Promise<string> {
  const token = privateBlobToken();
  const info = await head(input.pathname, {
    token,
    abortSignal: AbortSignal.timeout(12000),
  });
  if (
    !privateMasterUrl(info.url, input.pathname) ||
    info.pathname !== input.pathname ||
    info.size !== input.sizeBytes ||
    info.size > MAX_UPLOAD_BYTES ||
    info.size <= 0 ||
    info.contentType !== input.mimeType
  )
    throw new HttpError(
      422,
      "The stored master does not match its authorised size, type or private path.",
    );
  const etag = strongEtag(info.etag);
  const result = await get(input.pathname, {
    token,
    access: "private",
    useCache: false,
    headers: { "if-match": JSON.stringify(etag) },
    abortSignal: AbortSignal.timeout(180000),
  });
  if (!result || result.statusCode !== 200)
    throw new HttpError(
      409,
      "The uploaded object is unavailable. Retry completion later.",
    );
  try {
    if (strongEtag(result.blob.etag) !== etag)
      throw new HttpError(
        409,
        "The uploaded object changed. Retry with a new upload.",
      );
  } catch (error) {
    await result.stream.cancel().catch(() => undefined);
    throw error;
  }
  const reader = result.stream.getReader(),
    digest = createHash("sha256");
  let count = 0,
    header = new Uint8Array(0),
    finished = false;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      count += next.value.byteLength;
      if (count > input.sizeBytes || count > MAX_UPLOAD_BYTES)
        throw new HttpError(
          413,
          "The stored master exceeds the authorised audio budget.",
        );
      if (header.length < 12) {
        const joined = new Uint8Array(
          Math.min(12, header.length + next.value.length),
        );
        joined.set(header);
        joined.set(
          next.value.subarray(0, joined.length - header.length),
          header.length,
        );
        header = joined;
      }
      digest.update(next.value);
    }
    finished = true;
  } finally {
    if (!finished) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  if (
    count !== input.sizeBytes ||
    !hasAudioSignature(header, input.format) ||
    digest.digest("hex") !== input.sourceSha256
  )
    throw new HttpError(
      422,
      "The stored audio bytes or source checksum changed after sign-off. No master was delivered.",
    );
  return etag;
}
/** Stream private bytes through the session-authorized application endpoint; never redirect to a Blob URL. */
export async function privateMasterResponse(
  request: Request,
  track: Track,
): Promise<Response> {
  const object = track.audio.blob;
  const validId = (id: string) =>
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      id,
    );
  if (
    !object ||
    object.provider !== "vercel-blob" ||
    !track.ownerId ||
    !validId(track.ownerId) ||
    !validId(object.uploadId) ||
    !["MP3", "WAV"].includes(track.audio.format ?? "")
  )
    throw new HttpError(404, "Master not found.");
  const pathname = `east-sound/${postgresTenant()}/masters/${track.ownerId}/${object.uploadId}.${track.audio.format!.toLowerCase()}`;
  const headers: Record<string, string> = {
    "content-type": track.audio.mimeType,
    "accept-ranges": "bytes",
    "cache-control": "private, no-store",
    vary: "Cookie",
    "content-disposition":
      "inline; filename*=UTF-8''" + encodeURIComponent(track.audio.fileName),
  };
  const raw = request.headers.get("range"),
    range = raw ? audioByteRange(raw, track.audio.sizeBytes) : undefined;
  if (raw && !range)
    return new Response(null, {
      status: 416,
      headers: {
        ...headers,
        "content-range": `bytes */${track.audio.sizeBytes}`,
      },
    });
  const expectedLength = range ? range.length : track.audio.sizeBytes;
  const result = await get(pathname, {
    token: privateBlobToken(),
    access: "private",
    useCache: false,
    headers: {
      "if-match": JSON.stringify(strongEtag(object.etag)),
      ...(range ? { range: `bytes=${range.start}-${range.end}` } : {}),
    },
    abortSignal: AbortSignal.any([request.signal, AbortSignal.timeout(240000)]),
  });
  if (!result || result.statusCode !== 200)
    throw new HttpError(404, "Master bytes are unavailable.");
  const expectedRange = range
    ? `bytes ${range.start}-${range.end}/${track.audio.sizeBytes}`
    : null;
  try {
    if (
      strongEtag(result.blob.etag) !== strongEtag(object.etag) ||
      Number(result.headers.get("content-length")) !== expectedLength ||
      (range && result.headers.get("content-range") !== expectedRange)
    )
      throw new HttpError(
        503,
        "Master range validation failed. No alternate storage or public redirect was used.",
      );
  } catch (error) {
    await result.stream.cancel().catch(() => undefined);
    throw error;
  }
  headers["content-length"] = String(expectedLength);
  if (expectedRange) headers["content-range"] = expectedRange;
  return new Response(result.stream, { status: range ? 206 : 200, headers });
}
