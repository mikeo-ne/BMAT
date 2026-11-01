import type { DeliveryParty } from "@/lib/delivery-splits";
export interface AgreementMetadata {
  title: string;
  primaryArtist: string;
  featuredArtists: string[];
  releaseDate: string;
  isrc: string;
}
export interface AgreementParty extends Omit<DeliveryParty, "signature"> {
  email: string;
}
export interface AccountApproval {
  partyId: string;
  userId: string;
  accountEmail: string;
  typedName: string;
  signedAt: string;
  bindingDigest: string;
}
export interface ReleaseAgreement {
  version: 1;
  id: string;
  ownerId: string;
  metadata: AgreementMetadata;
  sourceSha256: string;
  fingerprintDigest: string;
  parties: AgreementParty[];
  bindingDigest: string;
  approvals: AccountApproval[];
  status: "pending" | "delivering" | "delivered" | "cancelled";
  createdAt: string;
  expiresAt: string;
  trackId: string | null;
  claimUntil?: string;
  mock: boolean;
}
export type AgreementView = Omit<ReleaseAgreement, "ownerId" | "claimUntil">;
export interface AgreementInvitation {
  partyId: string;
  name: string;
  email: string;
  token: string;
}
/** No local draft acknowledgements are included in this immutable approval payload. */
export function agreementPayload(
  metadata: AgreementMetadata,
  parties: AgreementParty[],
  sourceSha256: string,
  fingerprintDigest: string,
): string {
  return JSON.stringify({
    version: 1,
    metadata: {
      title: metadata.title,
      primaryArtist: metadata.primaryArtist,
      featuredArtists: metadata.featuredArtists,
      releaseDate: metadata.releaseDate,
      isrc: metadata.isrc,
    },
    sourceSha256,
    fingerprintDigest,
    parties: parties.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      role: p.role,
      shares: {
        master: p.shares.master,
        performance: p.shares.performance,
        mechanical: p.shares.mechanical,
      },
    })),
  });
}
