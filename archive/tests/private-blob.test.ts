import type { SessionUser } from "@/lib/auth-types";
import { createHash, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const sdk = vi.hoisted(() => ({
  put: vi.fn(),
  del: vi.fn(),
  head: vi.fn(),
  get: vi.fn(),
}));
vi.mock("@vercel/blob", () => sdk);
import {
  assertPrivateBlobStore,
  privateMasterUrl,
  privateMasterResponse,
  verifyPrivateMaster,
} from "@/lib/private-blob";
import { masterDeliveryMode } from "@/lib/master-storage-config";
import { audioByteRange } from "@/lib/audio-range";
import { buildSeedTracks } from "@/lib/catalog";
import { isolateWorkspace } from "@/lib/access-data";
import { toneMaster } from "@/tests/fixtures/master";
import { MAX_UPLOAD_BYTES } from "@/lib/upload";
import type { Track } from "@/lib/types";
let tenant: string, owner: string, pathname: string;
const privateUrl = (key: string) =>
  `https://teststore.private.blob.vercel-storage.com/${key}`;
function blobResult(
  bytes: Uint8Array,
  key = pathname,
  etag = "fixture-etag",
  contentRange?: string,
) {
  return {
    statusCode: 200,
    stream: new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes);
        c.close();
      },
    }),
    headers: new Headers({
      "content-length": String(bytes.length),
      ...(contentRange ? { "content-range": contentRange } : {}),
    }),
    blob: {
      pathname: key,
      url: privateUrl(key),
      etag,
      contentType: "audio/wav",
      size: bytes.length,
    },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  tenant = randomUUID();
  owner = randomUUID();
  pathname = `east-sound/${tenant}/masters/${owner}/${randomUUID()}.wav`;
  vi.stubEnv("EAST_SOUND_STATIC_EXPORT", "0");
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("EAST_SOUND_STORAGE_BACKEND", "postgres");
  vi.stubEnv("EAST_SOUND_TENANT_ID", tenant);
  vi.stubEnv("EAST_SOUND_MASTER_STORAGE", "vercel-blob");
  vi.stubEnv(
    "BLOB_READ_WRITE_TOKEN",
    "vercel_blob_rw_teststore_" + "s".repeat(40),
  );
  vi.stubEnv("VERCEL_BLOB_API_URL", undefined);
  vi.stubEnv("NEXT_PUBLIC_VERCEL_BLOB_API_URL", undefined);
  sdk.put.mockImplementation(async (key: string) => ({
    pathname: key,
    url: privateUrl(key),
    etag: "probe",
  }));
  sdk.del.mockResolvedValue(undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 403 })),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("private cloud master boundary", () => {
  it("requires explicit cloud selection, PostgreSQL, a server token and a non-static runtime", () => {
    expect(masterDeliveryMode()).toBe("direct-blob");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", undefined);
    expect(masterDeliveryMode()).toBe("disabled");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "t".repeat(40));
    vi.stubEnv("EAST_SOUND_STORAGE_BACKEND", "file");
    expect(masterDeliveryMode()).toBe("disabled");
    vi.stubEnv("EAST_SOUND_STORAGE_BACKEND", "postgres");
    vi.stubEnv("EAST_SOUND_STATIC_EXPORT", "1");
    expect(masterDeliveryMode()).toBe("disabled");
  });
  it("probes private access and anonymous rejection before allowing a real upload, then deletes the non-sensitive probe", async () => {
    await Promise.all([assertPrivateBlobStore(), assertPrivateBlobStore()]);
    expect(sdk.put).toHaveBeenCalledTimes(1);
    expect(sdk.put.mock.calls[0][1]).toEqual(Buffer.from([69, 83, 0, 1]));
    expect(sdk.put.mock.calls[0][2]).toMatchObject({
      access: "private",
      allowOverwrite: false,
      addRandomSuffix: false,
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(".private.blob.vercel-storage.com/"),
      expect.objectContaining({ method: "GET", redirect: "error" }),
    );
    expect(sdk.del).toHaveBeenCalledWith(
      sdk.put.mock.calls[0][0],
      expect.anything(),
    );
  });
  it("does not issue storage readiness for public stores or anonymously readable private objects", async () => {
    sdk.put.mockImplementation(async (key: string) => ({
      pathname: key,
      url: `https://teststore.public.blob.vercel-storage.com/${key}`,
    }));
    await expect(assertPrivateBlobStore()).rejects.toMatchObject({
      status: 503,
    });
    expect(fetch).not.toHaveBeenCalled();
    sdk.put.mockImplementation(async (key: string) => ({
      pathname: key,
      url: privateUrl(key),
    }));
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));
    await expect(assertPrivateBlobStore()).rejects.toMatchObject({
      status: 503,
    });
    expect(sdk.del).toHaveBeenCalledTimes(2);
  });
  it.each([
    "http://teststore.private.blob.vercel-storage.com/a",
    "https://teststore.private.blob.vercel-storage.com:8443/a",
    "https://evil.example/a",
    "https://teststore.public.blob.vercel-storage.com/a",
    "https://teststore.private.blob.vercel-storage.com/a?token=secret",
    "https://u:p@teststore.private.blob.vercel-storage.com/a",
  ])("rejects a non-private or credential-bearing object locator %s", (url) => {
    expect(privateMasterUrl(url, "a")).toBe(false);
  });
  it("verifies real audio bytes incrementally and requires the signed source hash", async () => {
    const { bytes, signature } = toneMaster();
    sdk.head.mockResolvedValue({
      pathname,
      url: privateUrl(pathname),
      size: bytes.length,
      contentType: "audio/wav",
      etag: "fixture-etag",
    });
    sdk.get.mockImplementation(async () => blobResult(bytes));
    const input = {
      pathname,
      sizeBytes: bytes.length,
      mimeType: "audio/wav",
      format: "WAV" as const,
      sourceSha256: signature.sourceSha256,
    };
    expect(await verifyPrivateMaster(input)).toBe("fixture-etag");
    await expect(
      verifyPrivateMaster({ ...input, sourceSha256: "0".repeat(64) }),
    ).rejects.toMatchObject({ status: 422 });
    expect(sdk.get).toHaveBeenCalledWith(
      pathname,
      expect.objectContaining({
        access: "private",
        useCache: false,
        headers: { "if-match": '"fixture-etag"' },
      }),
    );
  });
  it("accepts exactly 80 MiB using a bounded stream, without buffering a whole master", async () => {
    const first = Buffer.alloc(1024 * 1024),
      rest = Buffer.alloc(1024 * 1024);
    first.write("RIFF");
    first.write("WAVE", 8);
    const hash = createHash("sha256").update(first);
    for (let i = 1; i < 80; i++) hash.update(rest);
    let chunks = 0;
    sdk.head.mockResolvedValue({
      pathname,
      url: privateUrl(pathname),
      size: MAX_UPLOAD_BYTES,
      contentType: "audio/wav",
      etag: "large-etag",
    });
    sdk.get.mockResolvedValue({
      ...blobResult(new Uint8Array(), pathname, "large-etag"),
      stream: new ReadableStream<Uint8Array>({
        pull(c) {
          if (chunks === 80) c.close();
          else c.enqueue(chunks++ === 0 ? first : rest);
        },
      }),
    });
    expect(
      await verifyPrivateMaster({
        pathname,
        sizeBytes: MAX_UPLOAD_BYTES,
        mimeType: "audio/wav",
        format: "WAV",
        sourceSha256: hash.digest("hex"),
      }),
    ).toBe("large-etag");
    expect(chunks).toBe(80);
  });
  it("rejects an oversized object or mismatched MIME metadata before reading its body", async () => {
    sdk.head.mockResolvedValue({
      pathname,
      url: privateUrl(pathname),
      size: MAX_UPLOAD_BYTES + 1,
      contentType: "audio/wav",
      etag: "x",
    });
    await expect(
      verifyPrivateMaster({
        pathname,
        sizeBytes: MAX_UPLOAD_BYTES,
        mimeType: "audio/wav",
        format: "WAV",
        sourceSha256: "a".repeat(64),
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(sdk.get).not.toHaveBeenCalled();
  });
  it("streams authenticated byte ranges without returning a Blob URL or provider headers", async () => {
    const track: Track = {
      ...buildSeedTracks()[0],
      ownerId: owner,
      audio: {
        fileName: "master.wav",
        format: "WAV",
        mimeType: "audio/wav",
        sizeBytes: 100,
        durationSec: 1,
        storedName: null,
        blob: {
          provider: "vercel-blob",
          uploadId: pathname.split("/").at(-1)!.replace(".wav", ""),
          etag: "fixture-etag",
        },
      },
    };
    sdk.get.mockResolvedValue(
      blobResult(
        new Uint8Array([1, 2, 3]),
        pathname,
        "fixture-etag",
        "bytes 10-12/100",
      ),
    );
    const response = await privateMasterResponse(
      new Request("https://app.example.com/api/tracks/test", {
        headers: { range: "bytes=10-12" },
      }),
      track,
    );
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 10-12/100");
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    const invalid = await privateMasterResponse(
      new Request("https://app.example.com/api/tracks/test", {
        headers: { range: "bytes=999-" },
      }),
      track,
    );
    expect(invalid.status).toBe(416);
    expect(sdk.get).toHaveBeenCalledTimes(1);
  });
  it("fails closed if the storage provider ignores the requested byte range", async () => {
    const track: Track = {
      ...buildSeedTracks()[0],
      ownerId: owner,
      audio: {
        fileName: "m.wav",
        format: "WAV",
        mimeType: "audio/wav",
        sizeBytes: 100,
        durationSec: 1,
        storedName: null,
        blob: {
          provider: "vercel-blob",
          uploadId: pathname.split("/").at(-1)!.replace(".wav", ""),
          etag: "fixture-etag",
        },
      },
    };
    sdk.get.mockResolvedValue(blobResult(new Uint8Array(100)));
    await expect(
      privateMasterResponse(
        new Request("https://app.example.com/api/tracks/test", {
          headers: { range: "bytes=1-2" },
        }),
        track,
      ),
    ).rejects.toMatchObject({ status: 503 });
  });
  it("strips object locators from every role and public projection, even for the owner", () => {
    const track: Track = {
      ...buildSeedTracks()[0],
      ownerId: owner,
      origin: "delivered",
      publicCharts: true,
      audio: {
        ...buildSeedTracks()[0].audio,
        blob: {
          provider: "vercel-blob",
          uploadId: pathname.split("/").at(-1)!.replace(".wav", ""),
          etag: "private",
        },
      },
    };
    for (const user of [
      null,
      {
        id: owner,
        role: "artist",
        email: "qa@example.com",
        name: "QA",
        mock: false,
        stationIds: [],
      },
      {
        id: randomUUID(),
        role: "cmo",
        email: "qa@example.com",
        name: "QA",
        mock: false,
        stationIds: [],
      },
    ] as (SessionUser | null)[]) {
      const data = isolateWorkspace([track], [], user);
      expect(JSON.stringify(data)).not.toContain(pathname);
      expect(data.tracks[0].audio.blob).toBeUndefined();
    }
  });
  it("fails closed when the privacy probe cannot be deleted and does not cache a false ready result", async () => {
    sdk.del.mockRejectedValueOnce(new Error("delete unavailable"));
    await expect(assertPrivateBlobStore()).rejects.toMatchObject({
      status: 503,
    });
    await assertPrivateBlobStore();
    expect(sdk.put).toHaveBeenCalledTimes(2);
  });
  it("normalizes quoted strong ETags without weakening byte verification", async () => {
    const { bytes, signature } = toneMaster();
    sdk.head.mockResolvedValue({
      pathname,
      url: privateUrl(pathname),
      size: bytes.length,
      contentType: "audio/wav",
      etag: '\"fixture-etag\"',
    });
    sdk.get.mockResolvedValue(blobResult(bytes));
    expect(
      await verifyPrivateMaster({
        pathname,
        sizeBytes: bytes.length,
        mimeType: "audio/wav",
        format: "WAV",
        sourceSha256: signature.sourceSha256,
      }),
    ).toBe("fixture-etag");
    expect(sdk.get).toHaveBeenCalledWith(
      pathname,
      expect.objectContaining({ headers: { "if-match": '\"fixture-etag\"' } }),
    );
  });
  it("cancels a changed-object stream before reading any master bytes", async () => {
    const { bytes, signature } = toneMaster();
    const cancel = vi.fn();
    sdk.head.mockResolvedValue({
      pathname,
      url: privateUrl(pathname),
      size: bytes.length,
      contentType: "audio/wav",
      etag: "original-etag",
    });
    sdk.get.mockResolvedValue({
      ...blobResult(bytes, pathname, "changed-etag"),
      stream: new ReadableStream({ cancel }),
    });
    await expect(
      verifyPrivateMaster({
        pathname,
        sizeBytes: bytes.length,
        mimeType: "audio/wav",
        format: "WAV",
        sourceSha256: signature.sourceSha256,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it("rejects a non-audio container even if its checksum and MIME label agree", async () => {
    const bytes = Buffer.from("not an audio container at all");
    sdk.head.mockResolvedValue({
      pathname,
      url: privateUrl(pathname),
      size: bytes.length,
      contentType: "audio/wav",
      etag: "fixture-etag",
    });
    sdk.get.mockResolvedValue(blobResult(bytes));
    await expect(
      verifyPrivateMaster({
        pathname,
        sizeBytes: bytes.length,
        mimeType: "audio/wav",
        format: "WAV",
        sourceSha256: createHash("sha256").update(bytes).digest("hex"),
      }),
    ).rejects.toMatchObject({ status: 422 });
  });
  it("never falls back to disk for a mistyped explicit cloud backend", () => {
    vi.stubEnv("VERCEL", "0");
    vi.stubEnv("EAST_SOUND_MASTER_STORAGE", "vercel_blob");
    expect(masterDeliveryMode()).toBe("disabled");
  });
});
describe("bounded audio byte-range parsing", () => {
  it.each([
    "bytes=-0",
    "bytes=",
    "bytes=10-9",
    "bytes=100-",
    "bytes=1-2,4-5",
    "bytes=999999999999999999-",
    "items=1-2",
  ])("rejects %s", (value) => expect(audioByteRange(value, 100)).toBeNull());
  it("supports suffix, open-ended and clipped ranges", () => {
    expect(audioByteRange("bytes=-3", 100)).toEqual({
      start: 97,
      end: 99,
      length: 3,
    });
    expect(audioByteRange("bytes=98-", 100)).toEqual({
      start: 98,
      end: 99,
      length: 2,
    });
    expect(audioByteRange("bytes=98-999", 100)).toEqual({
      start: 98,
      end: 99,
      length: 2,
    });
  });
});
