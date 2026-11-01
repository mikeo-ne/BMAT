import { readBoundedFormData } from "@/lib/integration-auth";
import { createHash } from "node:crypto";
import { guardedApi, HttpError, tokenHash } from "@/lib/auth-core";
import { takeRateLimit } from "@/lib/security-store";
import {
  masterUploadsAvailable,
  MASTER_STORAGE_NOTICE,
} from "@/lib/runtime-storage";
import {
  addTrack,
  DuplicateIsrcError,
  readTracks,
  removeUpload,
  reserveIsrc,
  saveUpload,
} from "@/lib/store";
import { readWorkspaceData } from "@/lib/workspace-data";
import {
  ACCEPTED_AUDIO,
  extensionOf,
  hasAudioSignature,
  MAX_UPLOAD_BYTES,
  validateAudioFile,
} from "@/lib/upload";
import { parseAudioSignature, signaturePayload } from "@/lib/master-signature";
import {
  claimAgreement,
  finishAgreement,
  metadataInput,
} from "@/lib/release-agreements";
import { isValidIsoDate } from "@/lib/format";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request?: Request) {
  return guardedApi(request, ["artist"], false, async (actor) =>
    Response.json({
      tracks: (await readWorkspaceData(new Date(), actor)).catalogue,
    }),
  );
}
export async function POST(request: Request) {
  return guardedApi(request, ["artist"], true, async (actor) => {
    if (actor.mock)
      throw new HttpError(
        403,
        "Mock OAuth is a development identity only. Use an email/password artist account for master delivery and tag reservations.",
      );
    if (!masterUploadsAvailable())
      return Response.json({ error: MASTER_STORAGE_NOTICE }, { status: 503 });
    const length = Number(request.headers.get("content-length"));
    if (Number.isFinite(length) && length > MAX_UPLOAD_BYTES + 1024 * 1024)
      throw new HttpError(413, "The request exceeds the 80 MB audio budget.");
    if (!(await takeRateLimit(tokenHash("delivery:" + actor.id), 30, 3600000)))
      throw new HttpError(429, "Too many delivery attempts. Try again later.");
    const form = await readBoundedFormData(
      request,
      MAX_UPLOAD_BYTES + 1024 * 1024,
    );
    const file = form.get("audio");
    if (!(file instanceof File))
      throw new HttpError(422, "Choose an MP3 or WAV audio master.");
    if (file.name.length > 255)
      throw new HttpError(422, "Use an audio filename up to 255 characters.");
    const fileIssue = validateAudioFile(file);
    if (fileIssue)
      throw new HttpError(file.size > MAX_UPLOAD_BYTES ? 413 : 422, fileIssue);
    const metadata = metadataInput(
      Object.fromEntries(
        [
          "title",
          "primaryArtist",
          "featuredArtists",
          "releaseDate",
          "isrc",
        ].map((k) => [k, form.get(k)]),
      ),
    );
    const agreementId = String(form.get("agreementId") ?? "");
    if (!agreementId)
      throw new HttpError(
        422,
        "Collect authenticated collaborator approvals before delivering this master.",
      );
    let raw: unknown;
    try {
      raw = JSON.parse(String(form.get("fingerprint") ?? "null"));
    } catch {
      throw new HttpError(422, "Invalid audio signature.");
    }
    const fingerprint = parseAudioSignature(raw);
    if (!fingerprint)
      throw new HttpError(
        422,
        "Compute a valid browser audio signature first.",
      );
    const bytes = new Uint8Array(await file.arrayBuffer()),
      info = ACCEPTED_AUDIO[extensionOf(file.name)];
    if (!hasAudioSignature(bytes.subarray(0, 12), info.format))
      throw new HttpError(
        422,
        "The audio content does not match the file extension.",
      );
    if (
      createHash("sha256").update(bytes).digest("hex") !==
        fingerprint.sourceSha256 ||
      createHash("sha256")
        .update(signaturePayload(fingerprint))
        .digest("hex") !== fingerprint.digest
    )
      throw new HttpError(
        422,
        "The uploaded source or signature changed. Reprocess the original audio.",
      );
    // Idempotent retry is still owner-scoped. Client-supplied ownership/signatures are deliberately ignored.
    const existing = (await readTracks()).find(
      (t) => t.ownerId === actor.id && t.agreementId === agreementId,
    );
    if (existing) {
      if (
        existing.fingerprint?.sourceSha256 !== fingerprint.sourceSha256 ||
        existing.fingerprint.digest !== fingerprint.digest ||
        JSON.stringify(metadata) !==
          JSON.stringify({
            title: existing.title,
            primaryArtist: existing.primaryArtist,
            featuredArtists: existing.featuredArtists,
            releaseDate: existing.releaseDate,
            isrc: existing.isrc,
          }) ||
        existing.publicCharts !== (form.get("publicCharts") === "true")
      )
        throw new HttpError(
          409,
          "This agreement was already used for a different master.",
        );
      return Response.json({
        track: { ...existing, audio: { ...existing.audio, storedName: null } },
        replayed: true,
      });
    }
    const { ownership } = await claimAgreement(
      actor,
      agreementId,
      metadata,
      fingerprint.sourceSha256,
      fingerprint.digest,
    );
    let storedName: string | null = null;
    try {
      storedName = await saveUpload(bytes, file.name);
      const track = await addTrack({
        ownerId: actor.id,
        agreementId,
        fingerprint,
        publicCharts: form.get("publicCharts") === "true",
        ...metadata,
        fileName: file.name,
        format: info.format,
        mimeType: info.mime,
        sizeBytes: file.size,
        durationSec: fingerprint.durationSec,
        storedName,
        ownership,
      });
      const { refreshAccountRules } = await import(
        "@/lib/account-notifications"
      );
      await refreshAccountRules(actor.id).catch(() =>
        console.error("Account alert entitlement synchronization needs retry."),
      );
      // A failed audit/status write must not remove the successfully persisted master.
      await finishAgreement(actor, agreementId, track.id).catch(() =>
        console.error("Agreement delivery status needs reconciliation."),
      );
      return Response.json(
        { track: { ...track, audio: { ...track.audio, storedName: null } } },
        { status: 201 },
      );
    } catch (error) {
      if (storedName) await removeUpload(storedName);
      await finishAgreement(actor, agreementId, null).catch(() => undefined);
      if (error instanceof DuplicateIsrcError)
        throw new HttpError(409, error.message);
      console.error("Master delivery failed.");
      throw new HttpError(
        500,
        "The master could not be saved. Your staged file remains available; retry delivery.",
      );
    }
  });
}
/** Internal format allocation is persistent and unique, not an official registrant assignment. */
export async function PUT(request: Request) {
  return guardedApi(request, ["artist"], true, async (actor) => {
    if (actor.mock)
      throw new HttpError(
        403,
        "Mock OAuth is a development identity only. Use an email/password artist account for master delivery and tag reservations.",
      );
    if (!masterUploadsAvailable())
      return Response.json({ error: MASTER_STORAGE_NOTICE }, { status: 503 });
    if (!(await takeRateLimit(tokenHash("isrc:" + actor.id), 100, 3600000)))
      throw new HttpError(429, "Too many ISRC reservations. Try again later.");
    const releaseDate =
      new URL(request.url).searchParams.get("releaseDate") ||
      new Date().toISOString().slice(0, 10);
    if (!isValidIsoDate(releaseDate))
      throw new HttpError(400, "Invalid release date.");
    try {
      return Response.json({
        isrc: await reserveIsrc(releaseDate),
        registration: "internal-format-only",
      });
    } catch (error) {
      if (error instanceof RangeError) throw new HttpError(409, error.message);
      throw error;
    }
  });
}
