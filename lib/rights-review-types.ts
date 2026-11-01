export const REVIEW_DECISIONS = [
  "reviewed",
  "needs-correction",
  "contested",
] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];
export const REVIEW_LABELS: Record<ReviewDecision, string> = {
  reviewed: "Split allocations reviewed",
  "needs-correction": "Request a new signed agreement",
  contested: "Contested — requires investigation",
};
export interface RightsReview {
  id: string;
  trackId: string;
  title: string;
  isrc: string;
  decision: ReviewDecision;
  note: string;
  auditorId: string;
  auditorName: string;
  agreementId: string | null;
  bindingDigest: string | null;
  decidedAt: string;
}
