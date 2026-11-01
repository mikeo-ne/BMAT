import "server-only";
import { HttpError } from "@/lib/auth-core";
import type { SessionUser } from "@/lib/auth-types";
import { validateDeliveryParties } from "@/lib/delivery-splits";
import { documentsOfKind, mutateAccountDocument } from "@/lib/security-store";
import { readTracks } from "@/lib/store";
import {
  REVIEW_DECISIONS,
  type RightsReview,
  type ReviewDecision,
} from "@/lib/rights-review-types";
const KIND = "rights-review";
export async function listRightsReviews(): Promise<RightsReview[]> {
  return (await documentsOfKind<RightsReview>(KIND))
    .map((row) => row.value)
    .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt))
    .slice(0, 200);
}
/** An auditor records a decision; they cannot impersonate contributors or edit an executed split. */
export async function recordRightsReview(
  actor: SessionUser,
  raw: unknown,
): Promise<RightsReview> {
  if (actor.role !== "cmo")
    throw new HttpError(
      403,
      "Only an assigned CMO auditor may record rights reviews.",
    );
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new HttpError(422, "Invalid review.");
  const input = raw as Record<string, unknown>;
  if (
    typeof input.requestId !== "string" ||
    !/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(
      input.requestId,
    ) ||
    typeof input.trackId !== "string" ||
    !REVIEW_DECISIONS.includes(input.decision as ReviewDecision) ||
    typeof input.note !== "string" ||
    input.note.trim().length < 12 ||
    input.note.trim().length > 2000
  )
    throw new HttpError(
      422,
      "Choose a recording, a review decision, an idempotency UUID and a note of 12–2,000 characters.",
    );
  const track = (await readTracks()).find((t) => t.id === input.trackId);
  if (!track) throw new HttpError(404, "Recording not found.");
  const ownership = track.ownership;
  if (
    input.decision === "reviewed" &&
    (!ownership ||
      ownership.approvalMethod !== "authenticated-account" ||
      !ownership.agreementId ||
      !ownership.bindingDigest ||
      ownership.parties.some((p) => !p.signature?.userId) ||
      validateDeliveryParties(ownership.parties).length)
  )
    throw new HttpError(
      422,
      "A reviewed allocation requires an immutable account-signed agreement with all three rights pools complete. Unknown or local-only signatures cannot be certified.",
    );
  const record: RightsReview = {
    id: input.requestId,
    trackId: track.id,
    title: track.title,
    isrc: track.isrc,
    decision: input.decision as ReviewDecision,
    note: input.note.trim(),
    auditorId: actor.id,
    auditorName: actor.name,
    agreementId: ownership?.agreementId ?? null,
    bindingDigest: ownership?.bindingDigest ?? null,
    decidedAt: new Date().toISOString(),
  };
  return mutateAccountDocument<RightsReview>(
    actor.id,
    KIND,
    record.id,
    (existing) => {
      if (!existing) return record;
      if (
        JSON.stringify([
          existing.trackId,
          existing.decision,
          existing.note,
          existing.bindingDigest,
        ]) !==
        JSON.stringify([
          record.trackId,
          record.decision,
          record.note,
          record.bindingDigest,
        ])
      )
        throw new HttpError(
          409,
          "This request ID already records a different immutable decision. Use a new request ID for a new review.",
        );
      return existing;
    },
    {
      actorId: actor.id,
      action: "rights.review_recorded",
      objectKey: record.id,
      detail: {
        trackId: track.id,
        decision: record.decision,
        agreementId: record.agreementId,
      },
    },
  );
}
