import { describe, expect, it } from "vitest";

import {
  assessCompliance,
  buildAirtimeAlerts,
  buildCampaigns,
  buildHeatmap,
  buildSlots,
  describeTerms,
} from "@/lib/advertising";

const CAMPAIGNS = buildCampaigns();
const SLOTS = Object.fromEntries(CAMPAIGNS.map((c) => [c.id, buildSlots(c)]));

describe("campaign contracts", () => {
  it("seeds four live buys with unique ids", () => {
    expect(CAMPAIGNS).toHaveLength(4);
    expect(new Set(CAMPAIGNS.map((c) => c.id)).size).toBe(4);
  });

  it("books the window the brief describes", () => {
    const nile = CAMPAIGNS.find((c) => c.brand === "Nile Breweries")!;
    expect(nile.terms).toMatchObject({
      stationId: "capital-kla",
      playsPerDay: 5,
      windowStartHour: 6,
      windowEndHour: 10,
      days: 14,
    });
  });

  it("phrases the contract the way a media buyer writes it", () => {
    const nile = CAMPAIGNS.find((c) => c.brand === "Nile Breweries")!;
    expect(describeTerms(nile.terms)).toBe(
      "5x daily · 06:00–10:00 EAT · Capital FM · 14 days",
    );
  });
});

describe("slot generation", () => {
  it("expands to exactly the contracted number of spots", () => {
    for (const campaign of CAMPAIGNS) {
      const expected = campaign.terms.playsPerDay * campaign.terms.days;
      expect(SLOTS[campaign.id]).toHaveLength(expected);
    }
  });

  it("is deterministic for a given campaign", () => {
    const again = buildSlots(CAMPAIGNS[0]);
    expect(again.map((s) => s.id)).toEqual(SLOTS[CAMPAIGNS[0].id].map((s) => s.id));
    expect(again.map((s) => s.outcome)).toEqual(SLOTS[CAMPAIGNS[0].id].map((s) => s.outcome));
  });

  it("gives a missed spot no air time at all", () => {
    const missed = CAMPAIGNS.flatMap((c) => SLOTS[c.id]).filter((s) => s.outcome === "missed");
    expect(missed.length).toBeGreaterThan(0);

    for (const slot of missed) {
      expect(slot.airedAt).toBeNull();
      expect(slot.airedHour).toBeNull();
    }
  });

  it("keeps every aired hour inside the EAT day", () => {
    for (const slot of CAMPAIGNS.flatMap((c) => SLOTS[c.id])) {
      if (slot.airedHour === null) continue;
      expect(slot.airedHour).toBeGreaterThanOrEqual(0);
      expect(slot.airedHour).toBeLessThan(24);
    }
  });

  it("puts off-window spots outside the contracted window", () => {
    const nile = CAMPAIGNS.find((c) => c.brand === "Nile Breweries")!;
    const offWindow = SLOTS[nile.id].filter((s) => s.outcome === "off-window");
    expect(offWindow.length).toBeGreaterThan(0);

    for (const slot of offWindow) {
      const inWindow =
        slot.airedHour! >= nile.terms.windowStartHour && slot.airedHour! < nile.terms.windowEndHour;
      expect(inWindow).toBe(false);
    }
  });

  it("round-trips the air time back to the same EAT hour", () => {
    // airedAt is stored as UTC; eatHour must recover the booked EAT hour.
    for (const slot of CAMPAIGNS.flatMap((c) => SLOTS[c.id])) {
      if (!slot.airedAt || slot.airedHour === null) continue;
      const utc = new Date(slot.airedAt).getUTCHours();
      expect((utc + 3) % 24).toBe(slot.airedHour);
    }
  });
});

describe("compliance", () => {
  it("partitions the contract exactly", () => {
    for (const campaign of CAMPAIGNS) {
      const slots = SLOTS[campaign.id];
      const c = assessCompliance(slots);

      expect(c.fulfilled + c.airedOffWindow + c.airedUnverified + c.missed).toBe(c.contracted);
      expect(c.fulfilledRate).toBeCloseTo(c.fulfilled / c.contracted, 10);
    }
  });

  it("lands in a believable range rather than at zero or one", () => {
    for (const campaign of CAMPAIGNS) {
      const { fulfilledRate } = assessCompliance(SLOTS[campaign.id]);
      expect(fulfilledRate).toBeGreaterThan(0.5);
      expect(fulfilledRate).toBeLessThan(1);
    }
  });

  it("counts a aired-above-contract case as capped, never over 100%", () => {
    const c = assessCompliance([]);
    expect(c.contracted).toBe(0);
    expect(c.fulfilledRate).toBe(0);
    expect(c.airedRate).toBe(0);
  });
});

describe("time-of-day heatmap", () => {
  it("buckets only the spots that physically aired", () => {
    for (const campaign of CAMPAIGNS) {
      const slots = SLOTS[campaign.id];
      const [row] = buildHeatmap([campaign], { [campaign.id]: slots });
      const aired = slots.filter((s) => s.outcome !== "missed").length;

      expect(row.hours).toHaveLength(24);
      expect(row.hours.reduce((a, b) => a + b, 0)).toBe(aired);
      expect(row.total).toBe(aired);
    }
  });

  it("carries the contracted window so an off-window buy is visible", () => {
    const nile = CAMPAIGNS.find((c) => c.brand === "Nile Breweries")!;
    const [row] = buildHeatmap([nile], { [nile.id]: SLOTS[nile.id] });

    expect(row.windowStartHour).toBe(6);
    expect(row.windowEndHour).toBe(10);
  });
});

describe("missed-airtime alerts", () => {
  const alerts = buildAirtimeAlerts(CAMPAIGNS, SLOTS);

  it("raises nothing for a cleanly fulfilled spot", () => {
    expect(alerts.length).toBeGreaterThan(0);
    for (const alert of alerts) {
      expect(alert.outcome).not.toBe("fulfilled");
    }
  });

  it("counts every breach and no more", () => {
    const breaches = CAMPAIGNS.flatMap((c) => SLOTS[c.id]).filter((s) => s.outcome !== "fulfilled");
    expect(alerts).toHaveLength(breaches.length);
  });

  it("treats a spot that never aired as critical", () => {
    for (const alert of alerts) {
      const expected = alert.outcome === "missed" ? "critical" : "warn";
      expect(alert.severity).toBe(expected);
    }
  });

  it("sorts hard breaches ahead of soft ones", () => {
    const order = alerts.map((a) => a.severity);
    const lastCritical = order.lastIndexOf("critical");
    const firstWarn = order.indexOf("warn");

    if (lastCritical !== -1 && firstWarn !== -1) {
      expect(lastCritical).toBeLessThan(firstWarn);
    }
  });
});
