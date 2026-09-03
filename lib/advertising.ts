import { createRandom, hashSeed } from "@/lib/airplay";
import { eatHour, formatEatClock, lastNDaysIso } from "@/lib/format";
import { stationById } from "@/lib/regions";

/* -------------------------------------------------------------------------- */
/* Contract terms                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The agreed airtime an advertiser bought, in the shape a media buyer writes it:
 * "5x daily between 06:00 and 10:00 on Capital FM, for 14 days".
 */
export interface ContractTerms {
  stationId: string;
  /** Contracted spots per day. */
  playsPerDay: number;
  /** Inclusive start hour, EAT (0-23). */
  windowStartHour: number;
  /** Exclusive end hour, EAT (1-24). */
  windowEndHour: number;
  /** Contract length in days. */
  days: number;
}

export interface CampaignJingle {
  fileName: string;
  sizeBytes: number;
  durationSec: number;
}

export interface AdCampaign {
  id: string;
  brand: string;
  product: string;
  agency: string;
  jingle: CampaignJingle;
  terms: ContractTerms;
  startsOn: string;
}

/* -------------------------------------------------------------------------- */
/* Slot outcomes                                                               */
/* -------------------------------------------------------------------------- */

export type SlotOutcome = "fulfilled" | "unverified" | "off-window" | "missed";

export interface AdSlot {
  id: string;
  campaignId: string;
  stationId: string;
  /** Day the spot was contracted for, `YYYY-MM-DD`. */
  dayIso: string;
  /** Position within the day, 1-based. */
  slotIndex: number;
  outcome: SlotOutcome;
  /** Actual air time, null when the spot never ran. */
  airedAt: string | null;
  /** Hour of day in EAT, null when the spot never ran. */
  airedHour: number | null;
  /** Seconds into the hour the spot aired. */
  airedMinute: number | null;
}

export const OUTCOME_LABEL: Record<SlotOutcome, string> = {
  fulfilled: "Fulfilled",
  unverified: "Aired, unverified",
  "off-window": "Aired off-window",
  missed: "Missed",
};

export const OUTCOME_SEVERITY: Record<SlotOutcome, "ok" | "warn" | "critical"> = {
  fulfilled: "ok",
  unverified: "warn",
  "off-window": "warn",
  missed: "critical",
};

/** Anything that is not a clean, verified, in-window spot. */
export const BREACH_OUTCOMES: SlotOutcome[] = ["unverified", "off-window", "missed"];

/* -------------------------------------------------------------------------- */
/* Seed campaigns                                                              */
/* -------------------------------------------------------------------------- */

const SEED_CAMPAIGNS: Omit<AdCampaign, "id">[] = [
  {
    brand: "Nile Breweries",
    product: "Nile Special",
    agency: "DNA Kinetic",
    jingle: { fileName: "nile-special-drive-time.mp3", sizeBytes: 412_880, durationSec: 30 },
    terms: { stationId: "capital-kla", playsPerDay: 5, windowStartHour: 6, windowEndHour: 10, days: 14 },
    startsOn: "2026-08-21",
  },
  {
    brand: "MTN Uganda",
    product: "MoMo Agent Drive",
    agency: "Spearhead Interactive",
    jingle: { fileName: "momo-agent-morning.mp3", sizeBytes: 388_412, durationSec: 20 },
    terms: { stationId: "cbs-kla", playsPerDay: 4, windowStartHour: 7, windowEndHour: 9, days: 14 },
    startsOn: "2026-08-24",
  },
  {
    brand: "Jesa Farm Dairy",
    product: "Jesa Fresh Milk",
    agency: "Kampala Advertising Bureau",
    jingle: { fileName: "jesa-fresh-breakfast.mp3", sizeBytes: 356_104, durationSec: 30 },
    terms: { stationId: "gaaki-jin", playsPerDay: 6, windowStartHour: 5, windowEndHour: 9, days: 14 },
    startsOn: "2026-08-26",
  },
  {
    brand: "Airtel Money",
    product: "Wewole Loan",
    agency: "DNA Kinetic",
    jingle: { fileName: "airtel-wewole-evening.mp3", sizeBytes: 402_776, durationSec: 20 },
    terms: { stationId: "mega-gul", playsPerDay: 3, windowStartHour: 17, windowEndHour: 20, days: 14 },
    startsOn: "2026-08-28",
  },
];

export function buildCampaigns(): AdCampaign[] {
  return SEED_CAMPAIGNS.map((campaign, index) => ({
    ...campaign,
    id: `cmp_${String(index + 1).padStart(3, "0")}`,
  }));
}

export function campaignById(campaigns: AdCampaign[], id: string): AdCampaign | undefined {
  return campaigns.find((c) => c.id === id);
}

/** Human phrasing of the contract, e.g. "5x daily · 06:00–10:00 · Capital FM · 14 days". */
export function describeTerms(terms: ContractTerms): string {
  const station = stationById(terms.stationId)?.name ?? terms.stationId;
  const hh = (h: number) => String(h % 24).padStart(2, "0");
  return `${terms.playsPerDay}x daily · ${hh(terms.windowStartHour)}:00–${hh(terms.windowEndHour)}:00 EAT · ${station} · ${terms.days} days`;
}

/* -------------------------------------------------------------------------- */
/* Slot generation                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Expand a campaign into every contracted spot and assign each one an outcome.
 *
 * Deterministic on the campaign id, so the same campaign always audits the same
 * way. The mix is weighted so a typical buy lands in the low nineties on
 * fulfilment with a visible tail of breaches — which is the case advertisers
 * actually dispute.
 */
export function buildSlots(campaign: AdCampaign): AdSlot[] {
  const rand = createRandom(hashSeed(`adslots:${campaign.id}`));
  const { terms } = campaign;

  // Contract window: startsOn for `terms.days` consecutive days, ascending.
  const start = new Date(`${campaign.startsOn}T00:00:00Z`);
  const end = new Date(start.getTime() + (terms.days - 1) * 86_400_000);
  const days = lastNDaysIso(terms.days, end);

  const slots: AdSlot[] = [];

  for (const dayIso of days) {
    for (let slotIndex = 1; slotIndex <= terms.playsPerDay; slotIndex++) {
      const draw = rand();
      const outcome: SlotOutcome =
        draw < 0.79 ? "fulfilled" : draw < 0.86 ? "off-window" : draw < 0.92 ? "unverified" : "missed";

      const windowSpan = Math.max(terms.windowEndHour - terms.windowStartHour, 1);
      // Evenly spread the contracted slots across the window, then jitter.
      const baseHour =
        terms.windowStartHour + Math.floor(((slotIndex - 1) / terms.playsPerDay) * windowSpan);
      const inWindowHour = Math.min(baseHour, terms.windowEndHour - 1);
      const hour =
        outcome === "off-window" ? terms.windowEndHour + Math.floor(rand() * 6) : inWindowHour;
      const minute = Math.floor(rand() * 60);
      const eatHourOfDay = ((hour % 24) + 24) % 24;

      // EAT wall clock stored as the equivalent UTC instant (Uganda is UTC+3).
      const utcHour = (eatHourOfDay - 3 + 24) % 24;
      const airedAt =
        outcome === "missed"
          ? null
          : `${dayIso}T${String(utcHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`;

      slots.push({
        id: `${campaign.id}:${dayIso}:${slotIndex}`,
        campaignId: campaign.id,
        stationId: terms.stationId,
        dayIso,
        slotIndex,
        outcome,
        airedAt,
        airedHour: outcome === "missed" ? null : eatHourOfDay,
        airedMinute: outcome === "missed" ? null : minute,
      });
    }
  }

  return slots;
}

/* -------------------------------------------------------------------------- */
/* Compliance                                                                  */
/* -------------------------------------------------------------------------- */

export interface CampaignCompliance {
  contracted: number;
  fulfilled: number;
  airedOffWindow: number;
  airedUnverified: number;
  missed: number;
  /** Verified in-window spots as a share of contracted spots, 0-1. */
  fulfilledRate: number;
  /** Everything that physically aired, as a share of contracted spots, 0-1. */
  airedRate: number;
}

export function assessCompliance(slots: AdSlot[]): CampaignCompliance {
  const contracted = slots.length;
  const count = (outcome: SlotOutcome) => slots.filter((s) => s.outcome === outcome).length;

  const fulfilled = count("fulfilled");
  const airedOffWindow = count("off-window");
  const airedUnverified = count("unverified");
  const missed = count("missed");

  return {
    contracted,
    fulfilled,
    airedOffWindow,
    airedUnverified,
    missed,
    fulfilledRate: contracted === 0 ? 0 : fulfilled / contracted,
    airedRate: contracted === 0 ? 0 : (fulfilled + airedOffWindow + airedUnverified) / contracted,
  };
}

/* -------------------------------------------------------------------------- */
/* Time-of-day heatmap                                                         */
/* -------------------------------------------------------------------------- */

export interface HeatmapRow {
  stationId: string;
  stationName: string;
  /** 24 buckets, EAT hour of day, counts of spots that actually aired. */
  hours: number[];
  /** Contracted window, for drawing the agreed band. */
  windowStartHour: number;
  windowEndHour: number;
  total: number;
}

/**
 * Station × hour grid of aired spots. Only spots that physically ran are
 * counted; a missed slot has no hour to sit in.
 */
export function buildHeatmap(
  campaigns: AdCampaign[],
  slotsByCampaign: Record<string, AdSlot[]>,
): HeatmapRow[] {
  return campaigns
    .map((campaign) => {
      const slots = slotsByCampaign[campaign.id] ?? [];
      const hours = Array.from({ length: 24 }, () => 0);

      for (const slot of slots) {
        if (slot.airedHour === null) continue;
        if (slot.outcome === "missed") continue;
        hours[slot.airedHour] += 1;
      }

      return {
        stationId: campaign.terms.stationId,
        stationName: stationById(campaign.terms.stationId)?.name ?? campaign.terms.stationId,
        hours,
        windowStartHour: campaign.terms.windowStartHour,
        windowEndHour: campaign.terms.windowEndHour,
        total: hours.reduce((a, b) => a + b, 0),
      };
    })
    .filter((row) => row.total > 0);
}

/** Peak hour of a heatmap row, as "07:00 EAT". */
export function peakHour(row: HeatmapRow): { hour: number; label: string } {
  let best = 0;
  for (let h = 1; h < 24; h++) {
    if (row.hours[h] > row.hours[best]) best = h;
  }
  return { hour: best, label: `${String(best).padStart(2, "0")}:00 EAT` };
}

/* -------------------------------------------------------------------------- */
/* Fraud / missed-airtime alerts                                               */
/* -------------------------------------------------------------------------- */

export interface AirtimeAlert {
  id: string;
  campaignId: string;
  brand: string;
  stationId: string;
  stationName: string;
  dayIso: string;
  slotIndex: number;
  outcome: SlotOutcome;
  severity: "warn" | "critical";
  detail: string;
  /** Air time when there was one. */
  airedAt: string | null;
}

/**
 * Every contracted spot that did not run cleanly, worst first.
 *
 * "Missed" is a hard breach — the spot never aired. "Off-window" and
 * "unverified" are softer: the spot ran, but not where the contract says or not
 * where East Sound could prove it.
 */
export function buildAirtimeAlerts(
  campaigns: AdCampaign[],
  slotsByCampaign: Record<string, AdSlot[]>,
): AirtimeAlert[] {
  const alerts: AirtimeAlert[] = [];

  for (const campaign of campaigns) {
    const slots = slotsByCampaign[campaign.id] ?? [];
    const station = stationById(campaign.terms.stationId)?.name ?? campaign.terms.stationId;

    for (const slot of slots) {
      if (!BREACH_OUTCOMES.includes(slot.outcome)) continue;

      const detail =
        slot.outcome === "missed"
          ? `Slot ${slot.slotIndex} of ${campaign.terms.playsPerDay} never aired on ${station}.`
          : slot.outcome === "off-window"
            ? `Aired at ${slot.airedAt ? formatEatClock(slot.airedAt) : "—"}, outside the contracted ${String(campaign.terms.windowStartHour).padStart(2, "0")}:00–${String(campaign.terms.windowEndHour).padStart(2, "0")}:00 window.`
            : `Aired at ${slot.airedAt ? formatEatClock(slot.airedAt) : "—"} but no fingerprint match was returned for the slot.`;

      alerts.push({
        id: slot.id,
        campaignId: campaign.id,
        brand: campaign.brand,
        stationId: campaign.terms.stationId,
        stationName: station,
        dayIso: slot.dayIso,
        slotIndex: slot.slotIndex,
        outcome: slot.outcome,
        severity: OUTCOME_SEVERITY[slot.outcome] === "critical" ? "critical" : "warn",
        detail,
        airedAt: slot.airedAt,
      });
    }
  }

  const rank: Record<SlotOutcome, number> = { missed: 0, "off-window": 1, unverified: 2, fulfilled: 3 };
  return alerts.sort((a, b) => rank[a.outcome] - rank[b.outcome] || a.dayIso.localeCompare(b.dayIso));
}

/** Hour bucket used for grouping alerts, "07:00" or "—" when nothing aired. */
export function alertHourLabel(alert: AirtimeAlert): string {
  if (!alert.airedAt) return "—";
  return `${String(eatHour(alert.airedAt)).padStart(2, "0")}:00`;
}
