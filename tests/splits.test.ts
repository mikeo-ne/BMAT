import { describe, expect, it } from "vitest";

import {
  allocatePool,
  partyAmount,
  sanitizeShare,
  splitBalance,
  splitTotal,
  validateSplits,
  type SplitRow,
} from "@/lib/splits";

const row = (over: Partial<SplitRow> = {}): SplitRow => ({
  id: 1,
  party: "Composer",
  role: "Writer",
  share: "50",
  ...over,
});

describe("sanitizeShare", () => {
  it("keeps digits and a decimal point", () => {
    expect(sanitizeShare("33.33")).toBe("33.33");
    expect(sanitizeShare("50")).toBe("50");
  });

  it("strips letters, symbols and spaces", () => {
    expect(sanitizeShare("5o%")).toBe("5");
    expect(sanitizeShare(" 12 0 ")).toBe("120");
    expect(sanitizeShare("-7")).toBe("7");
  });

  it("keeps only the first decimal point", () => {
    expect(sanitizeShare("1.2.3")).toBe("1.23");
    expect(sanitizeShare("...5")).toBe(".5");
  });

  it("returns an empty string for junk", () => {
    expect(sanitizeShare("")).toBe("");
    expect(sanitizeShare("abc")).toBe("");
    expect(sanitizeShare(null)).toBe("");
    expect(sanitizeShare(undefined)).toBe("");
  });

  it("stringifies numeric input", () => {
    expect(sanitizeShare(42)).toBe("42");
  });
});

describe("splitTotal", () => {
  it("adds the shares", () => {
    expect(splitTotal([row({ share: "50" }), row({ id: 2, share: "30" }), row({ id: 3, share: "20" })])).toBe(100);
  });

  it("treats blanks and junk as zero rather than NaN", () => {
    const total = splitTotal([row({ share: "" }), row({ id: 2, share: "abc" }), row({ id: 3, share: "25" })]);
    expect(total).toBe(25);
    expect(Number.isFinite(total)).toBe(true);
  });

  it("is zero for an empty sheet", () => {
    expect(splitTotal([])).toBe(0);
    expect(splitTotal(null)).toBe(0);
    expect(splitTotal(undefined)).toBe(0);
  });

  it("accumulates float noise exactly (the caller tolerates it)", () => {
    expect(splitTotal([row({ share: "33.33" }), row({ id: 2, share: "33.33" }), row({ id: 3, share: "33.34" })])).toBeCloseTo(100, 10);
  });
});

describe("splitBalance", () => {
  it("accepts an exact 100%", () => {
    expect(splitBalance(100)).toMatchObject({ balanced: true, tone: "ok", label: "Adds up to 100%" });
  });

  it("tolerates float noise around 100%", () => {
    expect(splitBalance(99.9999).balanced).toBe(true);
    expect(splitBalance(100.0005).balanced).toBe(true);
  });

  it("reports an over-allocation", () => {
    const v = splitBalance(110);
    expect(v.balanced).toBe(false);
    expect(v.tone).toBe("bad");
    expect(v.label).toBe("Over by 10.00%");
    expect(v.delta).toBe(10);
  });

  it("reports unassigned share", () => {
    const v = splitBalance(75);
    expect(v.balanced).toBe(false);
    expect(v.label).toBe("25.00% unassigned");
  });

  it("treats an empty sheet as wholly unassigned", () => {
    expect(splitBalance(0).label).toBe("100.00% unassigned");
  });

  it("never prints NaN for junk totals", () => {
    const v = splitBalance(NaN);
    expect(v.label).not.toContain("NaN");
    expect(v.balanced).toBe(false);
  });
});

describe("partyAmount", () => {
  it("pays a percentage of the pool", () => {
    expect(partyAmount(5_000_000, 50)).toBe(2_500_000);
    expect(partyAmount(5_000_000, "30")).toBe(1_500_000);
  });

  it("pays nothing for a zero share or zero pool", () => {
    expect(partyAmount(5_000_000, 0)).toBe(0);
    expect(partyAmount(0, 50)).toBe(0);
  });

  it("clamps a negative pool to zero instead of paying a negative royalty", () => {
    expect(partyAmount(-1_000_000, 50)).toBe(0);
  });

  it("is safe with junk input", () => {
    expect(partyAmount("abc", "xyz")).toBe(0);
    expect(Number.isFinite(partyAmount(NaN, NaN))).toBe(true);
  });
});

describe("allocatePool", () => {
  it("allocates whole UGX per party", () => {
    const allocations = allocatePool(5_000_000, [
      row({ id: 1, party: "Composer", share: "50" }),
      row({ id: 2, party: "Publisher", share: "30" }),
      row({ id: 3, party: "Producer", share: "20" }),
    ]);
    expect(allocations.map((a) => a.amount)).toEqual([2_500_000, 1_500_000, 1_000_000]);
    expect(allocations.map((a) => a.party)).toEqual(["Composer", "Publisher", "Producer"]);
  });

  it("rounds to the nearest shilling", () => {
    const [first] = allocatePool(1000, [row({ share: "33.335" })]);
    expect(Number.isInteger(first.amount)).toBe(true);
    expect(first.amount).toBe(333);
  });

  it("keeps the sheet's own order", () => {
    const allocations = allocatePool(100, [row({ id: "b", share: "1" }), row({ id: "a", share: "2" })]);
    expect(allocations.map((a) => a.id)).toEqual(["b", "a"]);
  });

  it("returns nothing for an empty sheet", () => {
    expect(allocatePool(1000, [])).toEqual([]);
    expect(allocatePool(1000, null)).toEqual([]);
  });

  it("cannot pay out more than the pool when shares sum to 100", () => {
    const rows = [row({ id: 1, share: "60" }), row({ id: 2, share: "40" })];
    const paid = allocatePool(1_000_000, rows).reduce((t, a) => t + a.amount, 0);
    expect(paid).toBeLessThanOrEqual(1_000_000);
  });
});

describe("validateSplits", () => {
  it("accepts a balanced, named sheet", () => {
    const result = validateSplits([row({ share: "60" }), row({ id: 2, party: "Publisher", share: "40" })]);
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it("rejects an empty sheet", () => {
    expect(validateSplits([]).ok).toBe(false);
    expect(validateSplits([]).errors[0]).toMatch(/at least one party/i);
    expect(validateSplits(null).ok).toBe(false);
  });

  it("names the party that is over 100%", () => {
    const result = validateSplits([row({ party: "Producer", share: "120" })]);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("Producer is over 100%");
  });

  it("rejects a negative share", () => {
    expect(validateSplits([row({ party: "Writer", share: "-5" })]).ok).toBe(false);
  });

  it("requires a party name", () => {
    expect(validateSplits([row({ party: "  ", share: "100" })]).errors.join(" ")).toMatch(/needs a name/);
  });

  it("reports the balance problem in the same words as the badge", () => {
    const result = validateSplits([row({ share: "80" })]);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain(splitBalance(80).label);
  });

  it("collects every problem instead of stopping at the first", () => {
    const result = validateSplits([
      row({ party: "", share: "150" }),
      row({ id: 2, party: "Publisher", share: "20" }),
    ]);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});
