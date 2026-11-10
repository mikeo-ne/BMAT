import { describe, expect, it } from "vitest";

import {
  ANNUAL_MONTHS_FREE,
  PLANS,
  findPlan,
  formatUgx,
  normaliseMsisdn,
  planAmount,
  planReference,
} from "@/lib/plans";

/**
 * Pricing is a promise. These tests keep it consistent with what the page
 * prints: shillings, whole numbers, no card, no invented "from $9" figure.
 */
describe("plan catalogue", () => {
  it("matches the price artists already pay in Uganda", () => {
    const artist = findPlan("artist");
    expect(artist?.monthlyUgx).toBe(35_000);
    expect(formatUgx(artist!.monthlyUgx)).toBe("UGX 35,000");
  });

  it("only charges fixed prices for self-serve plans", () => {
    const fixed = PLANS.filter((p) => !p.custom).map((p) => p.id);
    expect(fixed).toEqual(["artist", "label"]);
    for (const p of PLANS.filter((x) => x.custom)) expect(planAmount(p, "monthly")).toBe(0);
  });

  it("gives two months free on annual billing, in whole shillings", () => {
    const label = findPlan("label")!;
    expect(planAmount(label, "monthly")).toBe(250_000);
    expect(planAmount(label, "annual")).toBe(250_000 * (12 - ANNUAL_MONTHS_FREE));
  });

  it("has no duplicate ids and every id resolves", () => {
    const ids = PLANS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(findPlan(id)?.id).toBe(id);
    expect(findPlan("enterprise")).toBeNull();
  });
});

describe("references", () => {
  it("is short, readable on the phone and prefixed by the plan", () => {
    const ref = planReference("artist", () => 0.5);
    expect(ref).toMatch(/^ES-ART-[A-Z2-9]{6}$/);
  });

  it("avoids characters people misread aloud", () => {
    const refs = Array.from({ length: 40 }, (_, i) => planReference("label", () => (i * 0.0249) % 1));
    for (const r of refs) expect(r).not.toMatch(/[IO01]/);
  });
});

describe("mobile money numbers", () => {
  it("accepts the ways Ugandans write a number", () => {
    for (const input of ["0772 123 456", "+256772123456", "256772123456", "772123456", "0772-123-456"]) {
      expect(normaliseMsisdn(input)).toBe("+256772123456");
    }
  });

  it("rejects landlines, short codes and nonsense", () => {
    for (const input of ["0414 123 456", "0772", "hello", "", "256414123456"]) {
      expect(normaliseMsisdn(input)).toBeNull();
    }
  });
});

describe("formatUgx", () => {
  it("prints shillings with a thousands separator and no decimals", () => {
    expect(formatUgx(35_000)).toBe("UGX 35,000");
    expect(formatUgx(2_500_000)).toBe("UGX 2,500,000");
    expect(formatUgx(-1)).toBe("UGX 0");
  });
});
