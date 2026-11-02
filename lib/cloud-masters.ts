import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { SessionUser } from "@/lib/auth-types";
import type {
  AgreementMetadata,
  ReleaseAgreement,
} from "@/lib/agreement-types";
import type { AudioSignature, Track } from "@/lib/types";
import { HttpError, tokenHash } from "@/lib/auth-core";
import { clientTrack } from "@/lib/access-data";
import {
  metadataInput,
  ownerAgreement,
  assertDeliveryAgreement,
  agreementOwnership,
} from "@/lib/release-agreements";
import {
  readAccountDocument,
  mutateAccountDocument,
  takeRateLimit,
} from "@/lib/security-store";
import { postgresPool, postgresTenant } from "@/lib/postgres/pool";
import { addPostgresTrack } from "@/lib/postgres/catalogue";
import { buildTrack } from "@/lib/catalog";
import { parseAudioSignature, signaturePayload } from "@/lib/master-signature";
import {
  ACCEPTED_AUDIO,
  extensionOf,
  MAX_UPLOAD_BYTES,
  validateAudioFile,
} from "@/lib/upload";
import { masterDeliveryMode } from "@/lib/master-storage-config";
import {
  assertPrivateBlobStore,
  privateMasterUrl,
  removePrivateBlob,
  verifyPrivateMaster,
} from "@/lib/private-blob";

export const MASTER_UPLOAD_KIND = "cloud-master-upload";
const uuid = (value: string) =>
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
    value,
  );
export interface MasterUploadIntent {
  version: 1;
  id: string;
  ownerId: string;
  pathname: string;
  agreementId: string;
  metadata: AgreementMetadata;
  fingerprint: AudioSignature;
  fileName: string;
  sizeBytes: number;
  format: "MP3" | "WAV";
  mimeType: string;
  publicCharts: boolean;
  createdAt: string;
  expiresAt: string;
  status: "pending" | "verifying" | "complete" | "abandoned" | "cleaned";
  callbackReceived?: boolean;
  leaseId?: string;
  leaseUntil?: string;
  trackId?: string;
}
function enabled(actor?: SessionUser) {
  if (actor && (actor.role !== "artist" || actor.mock))
    throw new HttpError(
      403,
      "A non-mock artist account is required for private master delivery.",
    );
  if (masterDeliveryMode() !== "direct-blob")
    throw new HttpError(
      503,
      "Cloud master delivery requires PostgreSQL and a configured PRIVATE Blob store.",
    );
}
function assertIntentLocation(value: MasterUploadIntent, ownerId: string) {
  const extension =
    value.format === "WAV" ? "wav" : value.format === "MP3" ? "mp3" : "";
  if (
    !uuid(value.id) ||
    value.ownerId !== ownerId ||
    !extension ||
    value.pathname !==
      `east-sound/${postgresTenant()}/masters/${ownerId}/${value.id}.${extension}`
  )
    throw new HttpError(
      409,
      "The private upload locator is invalid. No storage operation was performed.",
    );
}
function liveIntent(
  value: MasterUploadIntent | null,
  ownerId: string,
): asserts value is MasterUploadIntent {
  if (!value || value.ownerId !== ownerId)
    throw new HttpError(404, "Upload not found.");
  assertIntentLocation(value, ownerId);
  if (
    ["abandoned", "cleaned"].includes(value.status) ||
    (value.status !== "complete" &&
      (!Number.isFinite(Date.parse(value.expiresAt)) ||
        Date.parse(value.expiresAt) <= Date.now()))
  )
    throw new HttpError(
      409,
      "This upload has expired or was cancelled. Start a new delivery.",
    );
}
async function savedTrack(
  ownerId: string,
  agreementId: string,
): Promise<Track | null> {
  const result = await postgresPool().query<{ metadata: Track }>(
    "SELECT metadata FROM east_sound.tracks WHERE tenant_id=$1 AND metadata->>'ownerId'=$2 AND metadata->>'agreementId'=$3 AND deleted_at IS NULL",
    [postgresTenant(), ownerId, agreementId],
  );
  return result.rows[0]?.metadata ?? null;
}
function sameSource(track: Track, fingerprint: AudioSignature) {
  return (
    track.fingerprint?.sourceSha256 === fingerprint.sourceSha256 &&
    track.fingerprint?.digest === fingerprint.digest
  );
}
export async function prepareMasterUpload(
  actor: SessionUser,
  input: Record<string, unknown>,
) {
  enabled(actor);
  const metadata = metadataInput(input.metadata),
    fileName = String(input.fileName ?? ""),
    sizeBytes = Number(input.sizeBytes);
  const info = ACCEPTED_AUDIO[extensionOf(fileName)];
  if (
    !info ||
    !fileName ||
    fileName.length > 255 ||
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes < 0
  )
    throw new HttpError(422, "Use an MP3/WAV filename and an exact file size.");
  const issue = validateAudioFile({
    name: fileName,
    size: sizeBytes,
    type: info.mime,
  });
  if (issue)
    throw new HttpError(sizeBytes > MAX_UPLOAD_BYTES ? 413 : 422, issue);
  const fingerprint = parseAudioSignature(input.fingerprint);
  if (
    !fingerprint ||
    createHash("sha256").update(signaturePayload(fingerprint)).digest("hex") !==
      fingerprint.digest
  )
    throw new HttpError(
      422,
      "Compute a valid, unchanged audio signature first.",
    );
  const agreementId = String(input.agreementId ?? ""),
    contract = await ownerAgreement(actor, agreementId);
  assertDeliveryAgreement(
    contract,
    metadata,
    fingerprint.sourceSha256,
    fingerprint.digest,
    true,
  );
  const previous = await savedTrack(actor.id, agreementId);
  if (previous) {
    if (!sameSource(previous, fingerprint))
      throw new HttpError(
        409,
        "This agreement was already delivered for different audio.",
      );
    return { track: clientTrack(previous), replayed: true };
  }
  if (contract.status === "delivered")
    throw new HttpError(
      409,
      "This agreement has already been consumed, including withdrawn recordings.",
    );
  if (
    !(await takeRateLimit(tokenHash("cloud-upload:" + actor.id), 20, 3600000))
  )
    throw new HttpError(
      429,
      "Too many cloud upload attempts. Try again later.",
    );
  await assertPrivateBlobStore();
  const id = randomUUID(),
    intent: MasterUploadIntent = {
      version: 1,
      id,
      ownerId: actor.id,
      agreementId,
      metadata,
      fingerprint,
      fileName,
      sizeBytes,
      format: info.format,
      mimeType: info.mime,
      publicCharts: input.publicCharts === true,
      pathname: `east-sound/${postgresTenant()}/masters/${actor.id}/${id}.${extensionOf(fileName)}`,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      status: "pending",
    };
  await mutateAccountDocument<MasterUploadIntent>(
    actor.id,
    MASTER_UPLOAD_KIND,
    id,
    (existing) => {
      if (existing)
        throw new HttpError(
          409,
          "An upload with this identifier already exists.",
        );
      return intent;
    },
    {
      actorId: actor.id,
      action: "master.upload_prepared",
      objectKey: id,
      detail: { agreementId, sizeBytes },
    },
  );
  return {
    upload: {
      id,
      pathname: intent.pathname,
      expiresAt: intent.expiresAt,
      mimeType: intent.mimeType,
    },
    mode: "direct-blob" as const,
  };
}
export async function masterUploadTokenPolicy(
  actor: SessionUser,
  pathname: string,
  clientPayload: string | null,
  multipart: boolean,
) {
  enabled(actor);
  if (!clientPayload || !uuid(clientPayload) || multipart !== true)
    throw new HttpError(422, "Use an authorised multipart upload intent.");
  const intent = await readAccountDocument<MasterUploadIntent>(
    actor.id,
    MASTER_UPLOAD_KIND,
    clientPayload,
  );
  liveIntent(intent, actor.id);
  if (intent.pathname !== pathname || intent.status !== "pending")
    throw new HttpError(
      409,
      "The upload ticket does not match this account's pending master.",
    );
  const contract = await ownerAgreement(actor, intent.agreementId);
  assertDeliveryAgreement(
    contract,
    intent.metadata,
    intent.fingerprint.sourceSha256,
    intent.fingerprint.digest,
  );
  if (!(await takeRateLimit(tokenHash("cloud-token:" + actor.id), 60, 3600000)))
    throw new HttpError(429, "Too many upload ticket requests.");
  await assertPrivateBlobStore();
  const origin = process.env.EAST_SOUND_APP_ORIGIN;
  if (
    !origin ||
    new URL(origin).protocol !== "https:" ||
    new URL(origin).origin !== origin
  )
    throw new HttpError(
      503,
      "Configure the exact HTTPS application origin before cloud uploads.",
    );
  return {
    allowedContentTypes: [intent.mimeType],
    maximumSizeInBytes: intent.sizeBytes,
    validUntil: Math.min(Date.now() + 15 * 60000, Date.parse(intent.expiresAt)),
    addRandomSuffix: false,
    allowOverwrite: false,
    cacheControlMaxAge: 60,
    tokenPayload: JSON.stringify({
      ownerId: actor.id,
      id: intent.id,
      pathname: intent.pathname,
    }),
    callbackUrl: origin + "/api/master-uploads/token",
  };
}
/** Called ONLY after the Blob SDK validates its callback HMAC. A receipt is not delivery or checksum verification. */
export async function recordMasterUploadReceipt(
  blob: { pathname: string; url: string; contentType: string },
  tokenPayload?: string | null,
) {
  enabled();
  let input: { ownerId?: string; id?: string; pathname?: string };
  try {
    input = JSON.parse(tokenPayload ?? "null");
  } catch {
    throw new HttpError(403, "Invalid upload callback binding.");
  }
  if (
    !input ||
    !uuid(input.ownerId ?? "") ||
    !uuid(input.id ?? "") ||
    input.pathname !== blob.pathname ||
    !privateMasterUrl(blob.url, blob.pathname)
  )
    throw new HttpError(403, "Invalid upload callback binding.");
  await mutateAccountDocument<MasterUploadIntent>(
    input.ownerId!,
    MASTER_UPLOAD_KIND,
    input.id!,
    (intent) => {
      if (
        !intent ||
        intent.ownerId !== input.ownerId ||
        intent.pathname !== blob.pathname ||
        intent.mimeType !== blob.contentType
      )
        throw new HttpError(
          403,
          "Upload callback does not match an authorised master.",
        );
      if (["complete", "abandoned", "cleaned"].includes(intent.status))
        return intent;
      return { ...intent, callbackReceived: true };
    },
  );
}
export async function completeMasterUpload(actor: SessionUser, id: string) {
  enabled(actor);
  if (!uuid(id)) throw new HttpError(404, "Upload not found.");
  if (
    !(await takeRateLimit(tokenHash("cloud-finalize:" + actor.id), 40, 3600000))
  )
    throw new HttpError(
      429,
      "Too many verification attempts. Try again later.",
    );
  const leaseId = randomUUID();
  const intent = await mutateAccountDocument<MasterUploadIntent>(
    actor.id,
    MASTER_UPLOAD_KIND,
    id,
    (current) => {
      liveIntent(current, actor.id);
      if (current.status === "complete") return current;
      if (
        current.status === "verifying" &&
        Date.parse(current.leaseUntil ?? "") > Date.now()
      )
        throw new HttpError(
          409,
          "This master is being verified. Retry shortly.",
        );
      return {
        ...current,
        status: "verifying",
        leaseId,
        leaseUntil: new Date(Date.now() + 5 * 60000).toISOString(),
      };
    },
  );
  if (intent.status === "complete") {
    const previous = await savedTrack(actor.id, intent.agreementId);
    if (!previous)
      throw new HttpError(409, "This master was withdrawn or is unavailable.");
    return { track: clientTrack(previous), replayed: true };
  }
  let committed: Track | undefined;
  try {
    const etag = await verifyPrivateMaster({
      ...intent,
      sourceSha256: intent.fingerprint.sourceSha256,
    });
    // The intent, agreement, catalogue insert and audit share ONE transaction. No provider I/O holds SQL locks.
    await mutateAccountDocument<MasterUploadIntent>(
      actor.id,
      MASTER_UPLOAD_KIND,
      id,
      async (current, db) => {
        liveIntent(current, actor.id);
        if (
          !db ||
          current.status !== "verifying" ||
          current.leaseId !== leaseId ||
          Date.parse(current.leaseUntil ?? "") <= Date.now()
        )
          throw new HttpError(
            409,
            "The upload verification lease changed. Retry completion.",
          );
        const active = await db.query(
          "SELECT 1 FROM east_sound.auth_users WHERE tenant_id=$1 AND id=$2 AND role='artist' AND NOT disabled AND NOT mock",
          [postgresTenant(), actor.id],
        );
        if (!active.rowCount)
          throw new HttpError(403, "The artist account is no longer active.");
        const agreement = await db.query<{ value: ReleaseAgreement }>(
          "SELECT value FROM east_sound.account_documents WHERE tenant_id=$1 AND owner_id=$2 AND kind='release-agreement' AND document_key=$3 FOR UPDATE",
          [postgresTenant(), actor.id, current.agreementId],
        );
        const contract = agreement.rows[0]?.value ?? null;
        assertDeliveryAgreement(
          contract,
          current.metadata,
          current.fingerprint.sourceSha256,
          current.fingerprint.digest,
        );
        if (
          contract.ownerId !== actor.id ||
          contract.id !== current.agreementId
        )
          throw new HttpError(403, "The release agreement owner changed.");
        const base = buildTrack({
          id: `trk_${randomUUID()}`,
          ...current.metadata,
          fileName: current.fileName,
          format: current.format,
          mimeType: current.mimeType,
          sizeBytes: current.sizeBytes,
          durationSec: current.fingerprint.durationSec,
          storedName: null,
        });
        committed = {
          ...base,
          ownerId: actor.id,
          agreementId: current.agreementId,
          ownership: agreementOwnership(contract),
          fingerprint: current.fingerprint,
          publicCharts: current.publicCharts,
          audio: {
            ...base.audio,
            blob: { provider: "vercel-blob", uploadId: current.id, etag },
          },
        };
        await addPostgresTrack(committed, db);
        const delivered = {
          ...contract,
          status: "delivered",
          trackId: committed.id,
          claimUntil: undefined,
        };
        await db.query(
          "UPDATE east_sound.account_documents SET value=$4::jsonb,updated_at=clock_timestamp() WHERE tenant_id=$1 AND owner_id=$2 AND kind='release-agreement' AND document_key=$3",
          [
            postgresTenant(),
            actor.id,
            current.agreementId,
            JSON.stringify(delivered),
          ],
        );
        await db.query(
          "INSERT INTO east_sound.security_audit(tenant_id,actor_id,action,object_key,detail) VALUES($1,$2,'master.delivered',$3,$4::jsonb)",
          [
            postgresTenant(),
            actor.id,
            current.agreementId,
            JSON.stringify({
              trackId: committed.id,
              uploadId: id,
              storage: "private-blob",
            }),
          ],
        );
        return {
          ...current,
          status: "complete",
          trackId: committed.id,
          leaseId: undefined,
          leaseUntil: undefined,
        };
      },
    );
  } catch (error) {
    // Never compensate a committed transaction with object deletion. Database/provider failures remain retryable; invalid immutable audio is abandoned.
    await mutateAccountDocument<MasterUploadIntent>(
      actor.id,
      MASTER_UPLOAD_KIND,
      id,
      (current) => {
        if (!current) throw new HttpError(404, "Upload not found.");
        if (current.status !== "verifying" || current.leaseId !== leaseId)
          return current;
        return {
          ...current,
          status:
            error instanceof HttpError && [413, 422].includes(error.status)
              ? "abandoned"
              : "pending",
          leaseId: undefined,
          leaseUntil: undefined,
        };
      },
    ).catch(() => undefined);
    const constraint = (error as { constraint?: string }).constraint;
    if (
      constraint === "tracks_tenant_isrc_key" ||
      constraint === "idx_tracks_delivery_contract"
    )
      throw new HttpError(
        409,
        "This ISRC or release agreement already belongs to a delivered master.",
      );
    throw error;
  }
  const { refreshAccountRules } = await import("@/lib/account-notifications");
  await refreshAccountRules(actor.id).catch(() =>
    console.error("Account alert entitlement synchronization needs retry."),
  );
  return { track: clientTrack(committed!), replayed: false };
}
export async function cancelMasterUpload(actor: SessionUser, id: string) {
  enabled(actor);
  if (!uuid(id)) throw new HttpError(404, "Upload not found.");
  const intent = await abandonUpload(actor.id, id, true);
  if (intent.status !== "abandoned")
    throw new HttpError(
      409,
      "A delivered or in-progress master cannot be removed as an orphan.",
    );
  await removePrivateBlob(intent.pathname);
  await mutateAccountDocument<MasterUploadIntent>(
    actor.id,
    MASTER_UPLOAD_KIND,
    id,
    (current) => ({ ...current!, status: "cleaned" }),
  );
  return { cancelled: true };
}
async function abandonUpload(ownerId: string, id: string, requested = false) {
  return mutateAccountDocument<MasterUploadIntent>(
    ownerId,
    MASTER_UPLOAD_KIND,
    id,
    async (current, db) => {
      if (!current || !db) throw new HttpError(404, "Upload not found.");
      assertIntentLocation(current, ownerId);
      if (current.status === "complete" || current.status === "cleaned")
        return current;
      if (
        current.status === "verifying" &&
        Date.parse(current.leaseUntil ?? "") > Date.now()
      )
        return current;
      if (!requested && Date.parse(current.expiresAt) > Date.now())
        return current;
      // Include soft-deleted catalogue rows: withdrawal revokes access but does not purge retained master evidence.
      const reference = await db.query(
        "SELECT external_key FROM east_sound.tracks WHERE tenant_id=$1 AND metadata->>'ownerId'=$2 AND metadata->'audio'->'blob'->>'uploadId'=$3 LIMIT 1",
        [postgresTenant(), ownerId, current.id],
      );
      if (reference.rowCount)
        return {
          ...current,
          status: "complete",
          trackId: reference.rows[0].external_key,
        };
      return {
        ...current,
        status: "abandoned",
        leaseId: undefined,
        leaseUntil: undefined,
      };
    },
  );
}
export async function cleanupMasterUploads() {
  if (masterDeliveryMode() !== "direct-blob") return { cleaned: 0, failed: 0 };
  const candidates = await postgresPool().query<{
    owner_id: string;
    document_key: string;
  }>(
    "SELECT owner_id,document_key FROM east_sound.account_documents WHERE tenant_id=$1 AND kind=$2 AND value->>'status' NOT IN ('complete','cleaned') AND updated_at<clock_timestamp()-interval '24 hours' ORDER BY updated_at LIMIT 25",
    [postgresTenant(), MASTER_UPLOAD_KIND],
  );
  let cleaned = 0,
    failed = 0;
  const deadline = Date.now() + 90000;
  for (
    let offset = 0;
    offset < candidates.rows.length && Date.now() < deadline;
    offset += 5
  ) {
    await Promise.all(
      candidates.rows.slice(offset, offset + 5).map(async (row) => {
        try {
          const intent = await abandonUpload(row.owner_id, row.document_key);
          if (intent.status !== "abandoned") return;
          await removePrivateBlob(intent.pathname);
          await mutateAccountDocument<MasterUploadIntent>(
            row.owner_id,
            MASTER_UPLOAD_KIND,
            row.document_key,
            (current) => ({ ...current!, status: "cleaned" }),
          );
          cleaned++;
        } catch {
          failed++;
        }
      }),
    );
  }
  return { cleaned, failed };
}
