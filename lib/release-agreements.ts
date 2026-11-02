import "server-only";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import type { SessionUser } from "@/lib/auth-types";
import type {
  AccountApproval,
  AgreementInvitation,
  AgreementMetadata,
  AgreementParty,
  AgreementView,
  ReleaseAgreement,
} from "@/lib/agreement-types";
import { agreementPayload } from "@/lib/agreement-types";
import { HttpError, tokenHash } from "@/lib/auth-core";
import {
  audit,
  documentsOfKind,
  mutateAccountDocument,
  readAccountDocument,
  takeRateLimit,
  writeAccountDocument,
} from "@/lib/security-store";
import { isValidIsoDate } from "@/lib/format";
import { checkIsrc } from "@/lib/isrc";
import {
  validateDeliveryParties,
  type DeliveryOwnership,
} from "@/lib/delivery-splits";
const KIND = "release-agreement",
  INVITES = "release-invitation";
interface Invitation {
  agreementId: string;
  partyId: string;
  email: string;
  expiresAt: string;
}
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const validId = (value: string) => /^[a-f0-9-]{36}$/.test(value);
function live(
  contract: ReleaseAgreement | null,
): asserts contract is ReleaseAgreement {
  if (!contract) throw new HttpError(404, "Agreement not found.");
  if (
    contract.status === "cancelled" ||
    Date.parse(contract.expiresAt) <= Date.now()
  )
    throw new HttpError(
      409,
      "This agreement has expired or was cancelled. Create a new version.",
    );
}
export function agreementView(
  contract: ReleaseAgreement,
  owner = false,
): AgreementView {
  const { ownerId: _owner, claimUntil: _claim, ...view } = contract;
  void _owner;
  void _claim;
  return owner
    ? view
    : {
        ...view,
        parties: view.parties.map((p) => ({
          ...p,
          email: p.email.replace(/^[^@]+/, "•••"),
        })),
        approvals: view.approvals.map((a) => ({
          ...a,
          accountEmail: a.accountEmail.replace(/^[^@]+/, "•••"),
        })),
      };
}
export function allApproved(contract: ReleaseAgreement): boolean {
  return contract.parties.every((p) =>
    contract.approvals.some(
      (a) => a.partyId === p.id && a.bindingDigest === contract.bindingDigest,
    ),
  );
}
export function metadataInput(raw: unknown): AgreementMetadata {
  if (!raw || typeof raw !== "object")
    throw new HttpError(422, "Complete the recording metadata first.");
  const m = raw as Record<string, unknown>,
    title = String(m.title ?? "").trim(),
    primaryArtist = String(m.primaryArtist ?? "").trim(),
    releaseDate = String(m.releaseDate ?? ""),
    isrc = checkIsrc(String(m.isrc ?? ""));
  const featuredArtists = Array.isArray(m.featuredArtists)
    ? m.featuredArtists
    : String(m.featuredArtists ?? "")
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean);
  if (
    !title ||
    title.length > 180 ||
    !primaryArtist ||
    primaryArtist.length > 120 ||
    !isValidIsoDate(releaseDate) ||
    !isrc.valid ||
    featuredArtists.length > 20 ||
    featuredArtists.some((n) => typeof n !== "string" || n.length > 120)
  )
    throw new HttpError(
      422,
      "Use a title, credited artist, valid release date and ISRC before requesting sign-off.",
    );
  return {
    title,
    primaryArtist,
    featuredArtists: featuredArtists as string[],
    releaseDate,
    isrc: isrc.canonical!,
  };
}
export async function createAgreement(
  actor: SessionUser,
  input: Record<string, unknown>,
) {
  if (!(await takeRateLimit(tokenHash("agreements:" + actor.id), 60, 3600000)))
    throw new HttpError(429, "Too many agreement versions. Try again later.");
  const metadata = metadataInput(input.metadata);
  if (
    !/^[a-f0-9]{64}$/.test(String(input.sourceSha256)) ||
    !/^[a-f0-9]{64}$/.test(String(input.fingerprintDigest))
  )
    throw new HttpError(
      422,
      "Compute the source audio signature before requesting sign-off.",
    );
  if (!Array.isArray(input.parties))
    throw new HttpError(
      422,
      "Declare the collaborators and their email addresses.",
    );
  const preliminary = validateDeliveryParties(input.parties, false);
  if (preliminary.length) throw new HttpError(422, preliminary.join(" "));
  const parties = input.parties.map((p: AgreementParty) => ({
    id: p.id,
    name: typeof p.name === "string" ? p.name.trim() : "",
    email:
      p.id === "primary"
        ? actor.email
        : String(p.email ?? "")
            .trim()
            .toLowerCase(),
    role: p.role,
    shares: p.shares,
  }));
  const issues = validateDeliveryParties(parties, false);
  const emails = new Set<string>();
  for (const party of parties) {
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(party.email) ||
      party.email.length > 254 ||
      emails.has(party.email)
    )
      issues.push(
        "Each collaborator requires a distinct account email address.",
      );
    emails.add(party.email);
  }
  if (
    !parties.some(
      (p) =>
        p.id === "primary" &&
        p.name.toLowerCase() === metadata.primaryArtist.toLowerCase() &&
        p.role === "Primary artist",
    )
  )
    issues.push("The credited primary artist must be included.");
  if (issues.length) throw new HttpError(422, [...new Set(issues)].join(" "));
  const now = new Date(),
    id = randomUUID(),
    sourceSha256 = String(input.sourceSha256),
    fingerprintDigest = String(input.fingerprintDigest);
  const contract: ReleaseAgreement = {
    version: 1,
    id,
    ownerId: actor.id,
    metadata,
    sourceSha256,
    fingerprintDigest,
    parties,
    bindingDigest: digest(
      agreementPayload(metadata, parties, sourceSha256, fingerprintDigest),
    ),
    approvals: [],
    status: "pending",
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 7 * 86400000).toISOString(),
    trackId: null,
    mock: actor.mock,
  };
  const invitations: AgreementInvitation[] = [];
  for (const party of parties.filter((p) => p.id !== "primary")) {
    const token = randomBytes(32).toString("hex");
    await writeAccountDocument(
      actor.id,
      INVITES,
      {
        agreementId: id,
        partyId: party.id,
        email: party.email,
        expiresAt: contract.expiresAt,
      } satisfies Invitation,
      tokenHash(token),
    );
    invitations.push({
      partyId: party.id,
      name: party.name,
      email: party.email,
      token,
    });
  }
  await writeAccountDocument(actor.id, KIND, contract, id);
  await audit(actor.id, "agreement.created", id, {
    bindingDigest: contract.bindingDigest,
    partyCount: parties.length,
  });
  return { agreement: agreementView(contract, true), invitations };
}
export async function ownerAgreement(actor: SessionUser, id: string) {
  if (!validId(id)) throw new HttpError(404, "Agreement not found.");
  const agreement = await readAccountDocument<ReleaseAgreement>(
    actor.id,
    KIND,
    id,
  );
  if (!agreement) throw new HttpError(404, "Agreement not found.");
  return agreement;
}
export async function invitedAgreement(actor: SessionUser, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new HttpError(404, "Invitation not found.");
  const row = (await documentsOfKind<Invitation>(INVITES)).find(
    (d) => d.key === tokenHash(token),
  );
  if (
    !row ||
    row.value.email !== actor.email ||
    Date.parse(row.value.expiresAt) <= Date.now()
  )
    throw new HttpError(
      404,
      "Invitation not found for this signed-in account. Use the invited email and original private link.",
    );
  const agreement = await readAccountDocument<ReleaseAgreement>(
    row.ownerId,
    KIND,
    row.value.agreementId,
  );
  live(agreement);
  return { agreement, partyId: row.value.partyId };
}
export async function listOwnerAgreements(actor: SessionUser) {
  return (await documentsOfKind<ReleaseAgreement>(KIND))
    .filter((d) => d.ownerId === actor.id)
    .map((d) => agreementView(d.value, true))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function approveAgreement(
  actor: SessionUser,
  input: Record<string, unknown>,
) {
  const invited =
    typeof input.invite === "string"
      ? await invitedAgreement(actor, input.invite)
      : null;
  const previous =
    invited?.agreement ?? (await ownerAgreement(actor, String(input.id)));
  const partyId = invited?.partyId ?? String(input.partyId ?? "primary");
  const result = await mutateAccountDocument<ReleaseAgreement>(
    previous.ownerId,
    KIND,
    previous.id,
    (current) => {
      live(current);
      if (current.status !== "pending")
        throw new HttpError(
          409,
          "The agreement is no longer accepting approvals.",
        );
      const party = current.parties.find(
        (p) => p.id === partyId && p.email === actor.email,
      );
      if (!party || (!invited && party.id !== "primary"))
        throw new HttpError(
          403,
          "You may only approve your own allocation using its invitation.",
        );
      if (
        input.acknowledgement !== true ||
        typeof input.typedName !== "string" ||
        input.typedName.trim().toLowerCase() !== party.name.toLowerCase()
      )
        throw new HttpError(
          422,
          "Review all allocations, type your credited name and acknowledge this exact agreement.",
        );
      if (current.mock !== actor.mock)
        throw new HttpError(
          403,
          "Mock and non-mock accounts cannot co-sign the same agreement.",
        );
      if (current.approvals.some((a) => a.partyId === partyId)) return current;
      const approval: AccountApproval = {
        partyId,
        userId: actor.id,
        accountEmail: actor.email,
        typedName: input.typedName.trim(),
        signedAt: new Date().toISOString(),
        bindingDigest: current.bindingDigest,
      };
      return { ...current, approvals: [...current.approvals, approval] };
    },
  );
  await audit(actor.id, "agreement.approved", result.id, {
    partyId,
    bindingDigest: result.bindingDigest,
  });
  return agreementView(result, result.ownerId === actor.id);
}
export async function cancelAgreement(actor: SessionUser, id: string) {
  const previous = await ownerAgreement(actor, id);
  const result = await mutateAccountDocument<ReleaseAgreement>(
    actor.id,
    KIND,
    id,
    (current) => {
      live(current);
      if (current.status !== "pending")
        throw new HttpError(409, "Only a pending agreement can be cancelled.");
      return { ...current, status: "cancelled" };
    },
  );
  await audit(actor.id, "agreement.cancelled", previous.id);
  return agreementView(result, true);
}
export async function claimAgreement(
  actor: SessionUser,
  id: string,
  metadata: AgreementMetadata,
  sourceSha256: string,
  fingerprintDigest: string,
): Promise<{ agreement: ReleaseAgreement; ownership: DeliveryOwnership }> {
  await ownerAgreement(actor, id);
  const agreement = await mutateAccountDocument<ReleaseAgreement>(
    actor.id,
    KIND,
    id,
    (current) => {
      assertDeliveryAgreement(
        current,
        metadata,
        sourceSha256,
        fingerprintDigest,
      );
      return {
        ...current,
        status: "delivering",
        claimUntil: new Date(Date.now() + 5 * 60000).toISOString(),
      };
    },
  );
  return { agreement, ownership: agreementOwnership(agreement) };
}
export function assertDeliveryAgreement(
  current: ReleaseAgreement | null,
  metadata: AgreementMetadata,
  sourceSha256: string,
  fingerprintDigest: string,
  allowDelivered = false,
): asserts current is ReleaseAgreement {
  live(current);
  if (
    (current.status === "delivered" && !allowDelivered) ||
    (current.status === "delivering" &&
      Date.parse(current.claimUntil ?? "") > Date.now())
  )
    throw new HttpError(
      409,
      "This agreement is already delivered or delivery is in progress.",
    );
  if (!allApproved(current))
    throw new HttpError(
      422,
      "Every collaborator must sign in and approve before release.",
    );
  if (
    current.bindingDigest !==
    digest(
      agreementPayload(
        metadata,
        current.parties,
        sourceSha256,
        fingerprintDigest,
      ),
    )
  )
    throw new HttpError(
      409,
      "Audio or recording metadata changed after sign-off. Create a new agreement and collect fresh approvals.",
    );
}
export function agreementOwnership(
  agreement: ReleaseAgreement,
): DeliveryOwnership {
  return {
    version: 1,
    approvalMethod: "authenticated-account",
    agreementId: agreement.id,
    bindingDigest: agreement.bindingDigest,
    parties: agreement.parties.map((p) => {
      const approval = agreement.approvals.find((a) => a.partyId === p.id)!;
      return {
        ...p,
        signature: {
          typedName: approval.typedName,
          signedAt: approval.signedAt,
          userId: approval.userId,
          accountEmail: approval.accountEmail,
        },
      };
    }),
  };
}

export async function finishAgreement(
  actor: SessionUser,
  id: string,
  trackId: string | null,
) {
  await mutateAccountDocument<ReleaseAgreement>(
    actor.id,
    KIND,
    id,
    (current) => {
      if (!current) throw new HttpError(404, "Agreement not found.");
      return {
        ...current,
        status: trackId ? "delivered" : "pending",
        trackId,
        claimUntil: undefined,
      };
    },
  );
  await audit(
    actor.id,
    trackId ? "master.delivered" : "master.delivery_failed",
    id,
    { trackId },
  );
}
