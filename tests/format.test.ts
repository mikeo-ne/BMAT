import { describe, expect, it } from "vitest";

import {
  formatBytes,
  formatCompact,
  formatDate,
  formatDuration,
  formatNumber,
  formatPercent,
  initials,
  isValidIsoDate,
  lastNDaysIso,
  todayIso,
} from "@/lib/format";

describe("formatNumber / formatCompact", () => {
  it("groups thousands", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
  });

  it("rounds before grouping", () => {
    expect(formatNumber(1000.6)).toBe("1,001");
  });

  it("compacts large values", () => {
    expect(formatCompact(1840000)).toBe("1.8M");
    expect(formatCompact(12400)).toBe("12.4K");
  });
});

describe("formatPercent", () => {
  it("signs and scales", () => {
    expect(formatPercent(0.126)).toBe("+12.6%");
    expect(formatPercent(-0.04)).toBe("-4.0%");
  });

  it("leaves zero unsigned", () => {
    expect(formatPercent(0)).toBe("0.0%");
  });

  it("em dashes a null", () => {
    expect(formatPercent(null)).toBe("—");
  });
});

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [512, "512 B"],
    [2048, "2 KB"],
    [9_216_512, "8.8 MB"],
    [36_700_160, "35 MB"],
  ])("%i -> %s", (input, expected) => {
    expect(formatBytes(input)).toBe(expected);
  });
});

describe("formatDuration", () => {
  it("renders m:ss", () => {
    expect(formatDuration(214.6)).toBe("3:35");
    expect(formatDuration(59)).toBe("0:59");
    expect(formatDuration(3600)).toBe("60:00");
  });

  it("em dashes an unknown duration", () => {
    expect(formatDuration(null)).toBe("—");
  });
});

describe("date helpers", () => {
  it("formats an ISO date without shifting the day", () => {
    expect(formatDate("2026-04-17")).toBe("17 Apr 2026");
    expect(formatDate("2026-01-01")).toBe("01 Jan 2026");
  });

  it("passes through a date it cannot parse", () => {
    expect(formatDate("garbage")).toBe("garbage");
  });

  it("accepts only real ISO calendar dates", () => {
    expect(isValidIsoDate("2026-04-17")).toBe(true);
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("2026-4-17")).toBe(false);
    expect(isValidIsoDate("")).toBe(false);
  });

  it("produces today as yyyy-mm-dd", () => {
    expect(todayIso(new Date("2026-09-03T18:00:00Z"))).toBe("2026-09-03");
  });

  it("returns n consecutive days ending today", () => {
    const days = lastNDaysIso(3, new Date("2026-09-03T09:00:00Z"));
    expect(days).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
  });
});

describe("initials", () => {
  it("takes up to two initials", () => {
    expect(initials("Kampala Nights")).toBe("KN");
    expect(initials("Nile")).toBe("N");
  });
});
