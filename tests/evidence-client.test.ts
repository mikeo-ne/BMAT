import { createHash, webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_EVIDENCE_VERIFY_BYTES,
  verifyCapturedEvidence,
} from "@/lib/evidence-client";

const url = "https://evidence.example.com/ten-second.wav";
const bytes = new TextEncoder().encode(
  "QA captured asset bytes, not a real master",
);
const sha256 = createHash("sha256").update(bytes).digest("hex");
const download = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", download);
  vi.stubGlobal("crypto", webcrypto);
  download
    .mockReset()
    .mockResolvedValue(
      new Response(bytes, { headers: { "content-type": "audio/wav" } }),
    );
});
afterEach(() => vi.unstubAllGlobals());

describe("explicit bounded client-side evidence digest verification", () => {
  it("hashes the actual bytes and returns the same verified bytes for playback", async () => {
    const result = await verifyCapturedEvidence(
      url,
      sha256,
      new AbortController().signal,
    );
    expect(result.status).toBe("verified");
    if (result.status === "verified")
      expect(new Uint8Array(await result.blob.arrayBuffer())).toEqual(bytes);
    expect(download).toHaveBeenCalledWith(
      url,
      expect.objectContaining({
        mode: "cors",
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
      }),
    );
  });
  it("does not promote a matching-looking URL or changed bytes to verified evidence", async () => {
    expect(
      await verifyCapturedEvidence(
        url,
        "0".repeat(64),
        new AbortController().signal,
      ),
    ).toEqual({ status: "mismatch" });
  });
  it("rejects private URLs and malformed hashes before fetching", async () => {
    await expect(
      verifyCapturedEvidence(
        "https://127.0.0.1/clip",
        sha256,
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    await expect(
      verifyCapturedEvidence(url, "bad-hash", new AbortController().signal),
    ).rejects.toThrow();
    expect(download).not.toHaveBeenCalled();
  });
  it("does not treat CORS/network errors or HTTP failure as successful verification", async () => {
    download.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(
      verifyCapturedEvidence(url, sha256, new AbortController().signal),
    ).rejects.toThrow();
    download.mockResolvedValueOnce(new Response("No", { status: 403 }));
    await expect(
      verifyCapturedEvidence(url, sha256, new AbortController().signal),
    ).rejects.toThrow();
  });
  it("bounds both declared and actually streamed response size", async () => {
    download.mockResolvedValueOnce(
      new Response(bytes, {
        headers: { "content-length": String(MAX_EVIDENCE_VERIFY_BYTES + 1) },
      }),
    );
    await expect(
      verifyCapturedEvidence(url, sha256, new AbortController().signal),
    ).rejects.toThrow(/16 MB/);
    download.mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(MAX_EVIDENCE_VERIFY_BYTES + 1));
            controller.close();
          },
        }),
      ),
    );
    await expect(
      verifyCapturedEvidence(url, sha256, new AbortController().signal),
    ).rejects.toThrow(/16 MB/);
  });
  it("respects an aborted modal request without starting a download", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      verifyCapturedEvidence(url, sha256, controller.signal),
    ).rejects.toThrow();
    expect(download).not.toHaveBeenCalled();
  });
});
