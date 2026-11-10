/**
 * Self-serve plans, priced in shillings.
 *
 * SongBoost proved UGX 35,000 a month by mobile money is a price Ugandan
 * artists will pay. We match it for artists rather than undercut it, charge
 * organisations for the thing they actually need (statements, cue sheets,
 * exports), and never invent a "from $X" figure that changes at checkout.
 *
 * Money does not move in this file: it produces the request a human bills.
 */

export type PlanId = "artist" | "label" | "broadcaster" | "venue" | "cmo";
export type Billing = "monthly" | "annual";
export type PlanStatus = "pending" | "contacted" | "active" | "cancelled";

export type Plan = {
  id: PlanId;
  name: string;
  /** Monthly price in whole shillings. */
  monthlyUgx: number;
  audience: string;
  summary: string;
  features: string[];
  /** "custom" plans are quoted, never charged automatically. */
  custom?: boolean;
};

export const PLANS: readonly Plan[] = [
  {
    id: "artist",
    name: "Artist",
    monthlyUgx: 35_000,
    audience: "Artists and managers",
    summary: "Know every station playing your song, with the clip to prove it.",
    features: [
      "Every play across the whole radio panel",
      "10-second clip for each play",
      "Airplay alerts by email and WhatsApp",
      "Charts, spin velocity and CSV export",
    ],
  },
  {
    id: "label",
    name: "Label",
    monthlyUgx: 250_000,
    audience: "Labels and distributors",
    summary: "Your whole roster, statements and a catalogue your accountants can export.",
    features: [
      "Everything in Artist, for the whole roster",
      "Royalty statements and split tracking",
      "Roster and catalogue CSV export",
      "Dispute queue with evidence",
    ],
  },
  {
    id: "broadcaster",
    name: "Broadcaster",
    monthlyUgx: 0,
    audience: "Radio and TV stations",
    summary: "UPRS cue sheets generated from what actually aired, not from a log sheet.",
    features: [
      "Auto-generated UPRS cue sheets (PDF and Excel)",
      "Station dashboard and playout history",
      "Detection dispute trail",
    ],
    custom: true,
  },
  {
    id: "venue",
    name: "Venue",
    monthlyUgx: 0,
    audience: "Bars, clubs and hotels",
    summary: "Show UPRS your licence is being used, with node and set logs.",
    features: ["Listener nodes and compliance status", "DJ set logs", "UPRS compliance report"],
    custom: true,
  },
  {
    id: "cmo",
    name: "CMO licence",
    monthlyUgx: 0,
    audience: "UPRS and collecting societies",
    summary: "The distribution pack, the feed and the whole-chain audit trail.",
    features: [
      "Monthly per-station distribution pack (PDF/CSV)",
      "Read-only JSON/CSV data feed",
      "Registry, disputes and unmatched-audio queue",
      "Brand-mention review",
    ],
    custom: true,
  },
] as const;

export const ANNUAL_MONTHS_FREE = 2;

/** Annual billing = ten months. Whole shillings, no rounding surprises. */
export function planAmount(plan: Plan, billing: Billing): number {
  if (plan.custom) return 0;
  return billing === "annual" ? plan.monthlyUgx * (12 - ANNUAL_MONTHS_FREE) : plan.monthlyUgx;
}

export function findPlan(id: string): Plan | null {
  return PLANS.find((p) => p.id === id) ?? null;
}

/** `ES-ART-4F2C9A` — what a person quotes on the phone or in a MoMo message. */
export function planReference(planId: PlanId, random: () => number = Math.random): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 — read aloud
  let code = "";
  for (let i = 0; i < 6; i += 1) code += letters[Math.floor(random() * letters.length)] ?? "A";
  return `ES-${planId.slice(0, 3).toUpperCase()}-${code}`;
}

/** Ugandan mobile numbers as people type them: 07…, +2567…, 2567… */
export function normaliseMsisdn(raw: string): string | null {
  const digits = (raw || "").replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (/^256(7\d{8})$/.test(digits)) return `+${digits}`;
  if (/^0(7\d{8})$/.test(digits)) return `+256${digits.slice(1)}`;
  if (/^7\d{8}$/.test(digits)) return `+256${digits}`;
  return null;
}

export function formatUgx(amount: number): string {
  return `UGX ${Math.round(Math.max(0, amount)).toLocaleString("en-GB")}`;
}
