// Playout mix and ad-delivery arithmetic, lifted out of BroadcasterDashboard.
// Pure functions so the numbers on the overview and Ad Control tabs are testable.

import { safeArray, safeNumber } from "@/lib/safe";

export type PlayoutKind = "music" | "ad" | "talk";
export type AdLine = { booked: number; aired: number };

export type PlayoutTotals = { music: number; ad: number; talk: number };

/** Total minutes per kind. Unknown kinds are ignored rather than miscounted. */
export function playoutTotals(
  segments: readonly { start: number; end: number; kind: string }[] | null | undefined,
): PlayoutTotals {
  const totals: PlayoutTotals = { music: 0, ad: 0, talk: 0 };
  for (const s of safeArray(segments)) {
    if (!s) continue;
    const minutes = Math.max(0, safeNumber(s.end) - safeNumber(s.start));
    if (s.kind === "music" || s.kind === "ad" || s.kind === "talk") totals[s.kind] += minutes;
  }
  return totals;
}

export function playoutMinutes(totals: PlayoutTotals): number {
  return totals.music + totals.ad + totals.talk;
}

/**
 * Share of the logged day per kind, as whole percentages.
 * A day with no segments reports 0% everywhere instead of dividing by zero.
 */
export function playoutShare(totals: PlayoutTotals): PlayoutTotals {
  const all = playoutMinutes(totals);
  if (all <= 0) return { music: 0, ad: 0, talk: 0 };
  return {
    music: Math.round((totals.music / all) * 100),
    ad: Math.round((totals.ad / all) * 100),
    talk: Math.round((totals.talk / all) * 100),
  };
}

export type AdStatus = "delivered" | "short" | "extra";

/** Ad Control verdict for one booked spot line. */
export function adDelivery(line: AdLine | null | undefined): {
  status: AdStatus;
  delta: number;
  label: string;
} {
  const aired = safeNumber(line?.aired);
  const booked = safeNumber(line?.booked);
  const delta = aired - booked;
  if (delta === 0) return { status: "delivered", delta, label: "Delivered" };
  if (delta < 0) return { status: "short", delta, label: `${-delta} short · make-good due` };
  return { status: "extra", delta, label: `${delta} extra` };
}

/** How many booked lines under-delivered — the "Ad shortfalls" stat. */
export function adShortfallCount(ads: readonly AdLine[] | null | undefined): number {
  return safeArray(ads).filter((a) => adDelivery(a).status === "short").length;
}
