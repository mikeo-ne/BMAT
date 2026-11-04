// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserSession } from "@/lib/auth-types";
import { toneMaster } from "@/tests/fixtures/master";
import { buildSeedTracks } from "@/lib/catalog";
const calls = vi.hoisted(() => ({
  api: vi.fn(),
  upload: vi.fn(),
  session: vi.fn(),
}));
vi.mock("@vercel/blob/client", () => ({ upload: calls.upload }));
vi.mock("@/lib/auth-client", () => ({
  authFetch: calls.api,
  browserSession: calls.session,
  AUTH_CHANGED: "east-sound:auth-changed",
}));
import { deliverCloudMaster } from "@/lib/cloud-master-client";
let current: BrowserSession;
const metadata = {
  title: "Test master",
  primaryArtist: "QA artist",
  featuredArtists: "",
  releaseDate: "2026-11-01",
  isrc: "UG-ESD-26-00420",
};
function staged() {
  const { bytes, signature } = toneMaster();
  return {
    id: "staged-qa",
    file: new File([new Uint8Array(bytes)], "qa.wav", { type: "audio/wav" }),
    fileName: "qa.wav",
    sizeBytes: bytes.length,
    format: "WAV" as const,
    mimeType: "audio/wav",
    durationSec: 1,
    previewUrl: "blob:qa-only",
    fingerprint: signature,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  calls.api.mockReset();
  calls.upload.mockReset();
  calls.session.mockReset();
  current = {
    user: {
      id: "artist-a",
      role: "artist",
      name: "QA",
      email: "qa@example.com",
      stationIds: [],
      mock: false,
    },
    csrfToken: "c".repeat(64),
    expiresAt: "2027-01-01T00:00:00Z",
  };
  calls.session.mockImplementation(() => current);
  calls.api
    .mockResolvedValueOnce(
      Response.json({
        upload: {
          id: "qa-intent",
          pathname: "private/qa.wav",
          mimeType: "audio/wav",
        },
      }),
    )
    .mockResolvedValueOnce(
      Response.json({ track: buildSeedTracks()[0] }, { status: 201 }),
    );
  calls.upload.mockResolvedValue({
    url: "https://private-storage.example/never-return-this",
    pathname: "private/qa.wav",
  });
});
afterEach(() => vi.restoreAllMocks());
describe("direct browser master delivery", () => {
  it("posts only bounded metadata/finalization to the app and sends the actual File privately via multipart Blob upload", async () => {
    const file = staged(),
      progress = vi.fn();
    const track = await deliverCloudMaster(
      file,
      metadata,
      "qa-agreement",
      false,
      progress,
    );
    expect(calls.api.mock.calls[0][0]).toBe("/api/master-uploads");
    const input = JSON.parse(calls.api.mock.calls[0][1].body);
    expect(input).toMatchObject({
      metadata,
      sizeBytes: file.sizeBytes,
      agreementId: "qa-agreement",
      fingerprint: { sourceSha256: file.fingerprint.sourceSha256 },
    });
    expect(input.audio).toBeUndefined();
    expect(input.file).toBeUndefined();
    expect(calls.api.mock.calls[0][1].body).not.toBeInstanceOf(FormData);
    expect(calls.upload).toHaveBeenCalledWith(
      "private/qa.wav",
      file.file,
      expect.objectContaining({
        access: "private",
        multipart: true,
        clientPayload: "qa-intent",
        handleUploadUrl: "/api/master-uploads/token",
        headers: { "x-east-sound-csrf": "c".repeat(64) },
      }),
    );
    expect(calls.api.mock.calls[1][0]).toBe("/api/master-uploads/qa-intent");
    expect(calls.api.mock.calls[1][1].body).toBeUndefined();
    expect(track.id).toBe(buildSeedTracks()[0].id);
    expect(JSON.stringify(track)).not.toContain("never-return-this");
    expect(progress).toHaveBeenLastCalledWith(100);
  });
  it("uses an existing verified track on replay without uploading another object", async () => {
    calls.api
      .mockReset()
      .mockResolvedValueOnce(
        Response.json({ track: buildSeedTracks()[0], replayed: true }),
      );
    expect(
      (
        await deliverCloudMaster(
          staged(),
          metadata,
          "qa-agreement",
          false,
          vi.fn(),
        )
      ).id,
    ).toBe(buildSeedTracks()[0].id);
    expect(calls.upload).not.toHaveBeenCalled();
    expect(calls.api).toHaveBeenCalledTimes(1);
  });
  it("does not finalize or publish stale results after the browser identity changes", async () => {
    calls.upload.mockImplementationOnce(async () => {
      current = { ...current, user: { ...current.user!, id: "artist-b" } };
      return {};
    });
    await expect(
      deliverCloudMaster(staged(), metadata, "qa-agreement", false, vi.fn()),
    ).rejects.toThrow(/account changed/);
    expect(calls.api).toHaveBeenCalledTimes(1);
  });
  it("does not report a saved master after provider upload or server verification failure", async () => {
    calls.upload.mockRejectedValueOnce(new Error("upload interrupted"));
    await expect(
      deliverCloudMaster(staged(), metadata, "qa-agreement", false, vi.fn()),
    ).rejects.toThrow("upload interrupted");
    expect(calls.api).toHaveBeenCalledTimes(1);
  });
  it("checks cancellation before preparing a new upload ticket", async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(
      deliverCloudMaster(
        staged(),
        metadata,
        "qa-agreement",
        false,
        vi.fn(),
        abort.signal,
      ),
    ).rejects.toThrow(/stopped/);
    expect(calls.api).not.toHaveBeenCalled();
  });
});
