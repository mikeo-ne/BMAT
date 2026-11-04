// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cx,
  fmtInt,
  fmtUGX,
  safeArray,
  safeNumber,
  safeStorage,
  seeded,
} from "@/lib/safe";

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("safeArray — the zero-crash guarantee", () => {
  it("passes a real array straight through", () => {
    const rows = [{ id: 1 }, { id: 2 }];
    expect(safeArray(rows)).toBe(rows);
  });

  it("returns an empty array for an empty array", () => {
    expect(safeArray([])).toEqual([]);
  });

  it.each([
    [null, "null"],
    [undefined, "undefined"],
  ])("returns [] for %s (%s)", (value, _why) => {
    expect(safeArray(value)).toEqual([]);
  });

  it.each([
    [{}, "an object"],
    [{ length: 2 }, "an array-like object"],
    ["ab", "a string"],
    [0, "a number"],
    [false, "a boolean"],
    [NaN, "NaN"],
  ])("returns [] for %j (%s) so .map cannot throw", (value, _why) => {
    const result = safeArray(value as never);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([]);
    expect(() => result.map((x) => x)).not.toThrow();
  });

  it("keeps null entries inside a real array (filtering is the caller's job)", () => {
    expect(safeArray([null, 1])).toEqual([null, 1]);
  });
});

describe("safeNumber", () => {
  it.each([
    [5, 5],
    [0, 0],
    [-12.5, -12.5],
    ["42", 42],
    ["3.5", 3.5],
  ])("converts %j to %j", (input, expected) => {
    expect(safeNumber(input)).toBe(expected);
  });

  it("falls back for junk instead of returning NaN", () => {
    for (const junk of ["abc", "", NaN, undefined, {}, [], Infinity, -Infinity])
      expect(Number.isFinite(safeNumber(junk, 7))).toBe(true);
    expect(safeNumber("abc", 7)).toBe(7);
    expect(safeNumber(NaN, 7)).toBe(7);
    expect(safeNumber(Infinity, 7)).toBe(7);
  });

  it("defaults the fallback to zero", () => {
    expect(safeNumber(undefined)).toBe(0);
  });

  it("treats null as zero, matching Number(null)", () => {
    expect(safeNumber(null)).toBe(0);
  });

  it("honours a custom fallback", () => {
    expect(safeNumber("nope", -1)).toBe(-1);
  });
});

describe("formatting", () => {
  it("rounds and uses the en-UG locale for integers", () => {
    expect(fmtInt(1234.6)).toBe((1235).toLocaleString("en-UG"));
    expect(fmtInt("987")).toBe((987).toLocaleString("en-UG"));
  });

  it("never renders NaN for junk input", () => {
    expect(fmtInt(undefined)).toBe((0).toLocaleString("en-UG"));
    expect(fmtInt("abc")).not.toContain("NaN");
  });

  it("prefixes UGX amounts", () => {
    expect(fmtUGX(1500)).toBe(`UGX ${(1500).toLocaleString("en-UG")}`);
    expect(fmtUGX(undefined)).toBe(`UGX ${(0).toLocaleString("en-UG")}`);
    expect(fmtUGX(NaN)).not.toContain("NaN");
  });
});

describe("safeStorage", () => {
  it("round-trips structured values", () => {
    safeStorage.set("prefs", { alerts: true, channels: ["whatsapp"] });
    expect(safeStorage.get("prefs", null)).toEqual({ alerts: true, channels: ["whatsapp"] });
  });

  it("returns the fallback for a missing key", () => {
    expect(safeStorage.get("absent", { theme: "dark" })).toEqual({ theme: "dark" });
  });

  it("returns the fallback when the stored value is not JSON", () => {
    window.localStorage.setItem("broken", "{not json");
    expect(safeStorage.get("broken", "fallback")).toBe("fallback");
  });

  it("removes a key", () => {
    safeStorage.set("temp", 1);
    safeStorage.remove("temp");
    expect(safeStorage.get("temp", "gone")).toBe("gone");
  });

  it("survives a localStorage that throws (private mode, quota)", () => {
    const boom = () => {
      throw new Error("QuotaExceededError");
    };
    vi.spyOn(window.localStorage, "getItem").mockImplementation(boom);
    vi.spyOn(window.localStorage, "setItem").mockImplementation(boom);
    vi.spyOn(window.localStorage, "removeItem").mockImplementation(boom);

    expect(safeStorage.get("any", "safe")).toBe("safe");
    expect(() => safeStorage.set("any", 1)).not.toThrow();
    expect(() => safeStorage.remove("any")).not.toThrow();
  });

  it("no-ops during SSR where window is undefined", () => {
    vi.stubGlobal("window", undefined);
    expect(safeStorage.get("any", "ssr")).toBe("ssr");
    expect(() => safeStorage.set("any", 1)).not.toThrow();
    expect(() => safeStorage.remove("any")).not.toThrow();
  });
});

describe("seeded PRNG", () => {
  it("is deterministic for a given seed", () => {
    const a = seeded(42);
    const b = seeded(42);
    const first = Array.from({ length: 8 }, () => a());
    const second = Array.from({ length: 8 }, () => b());
    expect(first).toEqual(second);
  });

  it("stays within [0, 1)", () => {
    const next = seeded(7);
    for (let i = 0; i < 500; i++) {
      const v = next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("produces different streams for different seeds", () => {
    const a = seeded(1);
    const b = seeded(2);
    const left = Array.from({ length: 6 }, () => a());
    const right = Array.from({ length: 6 }, () => b());
    expect(left).not.toEqual(right);
  });

  it("keeps demo data stable between server and client renders", () => {
    // Same seed must yield the same series no matter where it runs — this is the
    // hydration guarantee for seeded fixtures.
    const series = (seed: number) => {
      const next = seeded(seed);
      return Array.from({ length: 12 }, () => Math.round(next() * 1000));
    };
    expect(series(2026)).toEqual(series(2026));
  });
});

describe("cx", () => {
  it("joins truthy class names", () => {
    expect(cx("a", "b")).toBe("a b");
  });

  it("drops false, null and undefined", () => {
    expect(cx("a", false, null, undefined, "b")).toBe("a b");
    expect(cx(false, null, undefined)).toBe("");
  });
});
