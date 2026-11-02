"use client";
import { upload } from "@vercel/blob/client";
import { authFetch, AUTH_CHANGED, browserSession } from "@/lib/auth-client";
import { sessionScope } from "@/lib/auth-types";
import type { StagedFile } from "@/lib/upload";
import type { Track } from "@/lib/types";

export async function deliverCloudMaster(
  file: StagedFile,
  metadata: {
    title: string;
    primaryArtist: string;
    featuredArtists: string;
    releaseDate: string;
    isrc: string;
  },
  agreementId: string,
  publicCharts: boolean,
  progress: (value: number) => void,
  signal?: AbortSignal,
): Promise<Track> {
  const scope = sessionScope(browserSession().user),
    abort = new AbortController();
  const combined = signal
    ? AbortSignal.any([signal, abort.signal])
    : abort.signal;
  const assertActive = () => {
    if (combined.aborted || sessionScope(browserSession().user) !== scope)
      throw new Error("The signed-in account changed. Delivery was stopped.");
  };
  const changed = () => {
    if (sessionScope(browserSession().user) !== scope) abort.abort();
  };
  window.addEventListener(AUTH_CHANGED, changed);
  try {
    assertActive();
    const prepared = await authFetch("/api/master-uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: combined,
      body: JSON.stringify({
        metadata,
        agreementId,
        publicCharts,
        fingerprint: file.fingerprint,
        fileName: file.fileName,
        sizeBytes: file.sizeBytes,
      }),
    });
    const result = await prepared.json();
    if (!prepared.ok)
      throw new Error(result.error ?? "Private upload could not be prepared.");
    assertActive();
    if (result.track) return result.track as Track;
    const intent = result.upload;
    await upload(intent.pathname, file.file, {
      access: "private",
      multipart: true,
      contentType: intent.mimeType,
      handleUploadUrl: "/api/master-uploads/token",
      clientPayload: intent.id,
      headers: { "x-east-sound-csrf": browserSession().csrfToken ?? "" },
      abortSignal: combined,
      onUploadProgress: ({ percentage }) => {
        if (combined.aborted || sessionScope(browserSession().user) !== scope) {
          abort.abort();
          return;
        }
        progress(Math.min(99, Math.round(percentage)));
      },
    });
    assertActive();
    const response = await authFetch(`/api/master-uploads/${intent.id}`, {
      method: "POST",
      signal: combined,
    });
    const completed = await response.json();
    if (!response.ok || !completed.track)
      throw new Error(
        completed.error ??
          "The uploaded bytes could not be verified. No delivery success is assumed.",
      );
    assertActive();
    progress(100);
    return completed.track as Track;
  } finally {
    window.removeEventListener(AUTH_CHANGED, changed);
  }
}
