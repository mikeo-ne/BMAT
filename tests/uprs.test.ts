import { describe, expect, it } from "vitest";

import { buildSeedTracks } from "@/lib/catalog";
import {
  applyFilters,
  buildMembers,
  buildPlayLedger,
  buildReport,
  countActiveFilters,
  DISTRIBUTION_POLICY,
  EMPTY_FILTERS,
  ledgerToCsv,
  memberIdFor,
  rateFor,
  reportToCsv,
  sharesFor,
  TARIFF,
  tierFor,
  UGX_PER_USD,
  type CmoFilters,
} from "@/lib/uprs";

const NOW = new Date("2026-09-03T00:00:00Z");
const CATALOGUE = buildSeedTracks(NOW);
const LEDGER = buildPlayLedger({ catalogue: CATALOGUE, now: NOW, months: 6 });

describe("memberIdFor", () => {
  it("is stable and case-insensitive", () => {
    expect(memberIdFor("Ray Bwete")).toBe(memberIdFor("ray bwete"));
    expect(memberIdFor("Ray Bwete")).toMatch(/^UPRS-\d{5}$/);
  });

  it("gives different people different ids", () => {
    expect(memberIdFor("Ray Bwete")).not.toBe(memberIdFor("Peter Okoth"));
  });
});

describe("buildMembers", () => {
  const members = buildMembers(CATALOGUE);

  it("includes primary and featured artists", () => {
    const names = members.map((m) => m.name);
    expect(names).toContain("Ray Bwete"); // primary on one, feature on another
    expect(names).toContain("Aisha Nakato"); // feature only
    expect(names).toContain("Lillian Kyomukama");
  });

  it("counts the works each member appears on", () => {
    const ray = members.find((m) => m.name === "Ray Bwete")!;
    const expected = CATALOGUE.filter(
      (t) => t.primaryArtist === "Ray Bwete" || t.featuredArtists.includes("Ray Bwete"),
    ).length;

    expect(ray.works).toBe(expected);
    expect(expected).toBeGreaterThan(1);
  });

  it("has no duplicate ids", () => {
    expect(new Set(members.map((m) => m.memberId)).size).toBe(members.length);
  });
});

describe("sharesFor", () => {
  it("gives the whole right to a solo recording", () => {
    const solo = CATALOGUE.find((t) => t.featuredArtists.length === 0)!;
    const shares = sharesFor(solo);

    expect(shares).toHaveLength(1);
    expect(shares[0]).toEqual({ name: solo.primaryArtist, share: 1 });
  });

  it("splits 60/40 between primary and one feature", () => {
    const track = CATALOGUE.find((t) => t.featuredArtists.length === 1)!;
    const shares = sharesFor(track);

    expect(shares[0].share).toBe(DISTRIBUTION_POLICY.primaryShare);
    expect(shares[1].share).toBe(DISTRIBUTION_POLICY.featuredShare);
    expect(shares.reduce((s, h) => s + h.share, 0)).toBeCloseTo(1, 10);
  });

  it("divides the featured portion equally across several features", () => {
    const track = CATALOGUE.find((t) => t.featuredArtists.length === 2)!;
    const shares = sharesFor(track);

    expect(shares).toHaveLength(3);
    expect(shares[1].share).toBe(shares[2].share);
    expect(shares[1].share).toBeCloseTo(DISTRIBUTION_POLICY.featuredShare / 2, 10);
    expect(shares.reduce((s, h) => s + h.share, 0)).toBeCloseTo(1, 10);
  });
});

describe("tariff", () => {
  it("tiers stations by reach", () => {
    expect(tierFor(1_450_000)).toBe("national");
    expect(tierFor(999_999)).toBe("regional");
    expect(tierFor(400_000)).toBe("regional");
    expect(tierFor(190_000)).toBe("community");
  });

  it("prices television above radio regardless of reach", () => {
    expect(tierFor(5_000_000, "TV")).toBe("television");
    expect(rateFor(5_000_000, "TV").ugxPerPlay).toBe(TARIFF.television.ugxPerPlay);
  });

  it("orders the flat rates national > regional > community", () => {
    expect(TARIFF.national.ugxPerPlay).toBeGreaterThan(TARIFF.regional.ugxPerPlay);
    expect(TARIFF.regional.ugxPerPlay).toBeGreaterThan(TARIFF.community.ugxPerPlay);
  });
});

describe("buildPlayLedger", () => {
  it("produces rows", () => {
    expect(LEDGER.length).toBeGreaterThan(100);
  });

  it("prices every row as plays × flat rate", () => {
    for (const row of LEDGER) {
      expect(row.allocationUgx).toBe(row.plays * row.ugxPerPlay);
      expect(row.plays).toBeGreaterThan(0);
      expect(row.ugxPerPlay).toBe(TARIFF[row.tier].ugxPerPlay);
    }
  });

  it("never bills a period before the recording was released", () => {
    // "Boda Boda Anthem" shipped 2026-08-28, inside the 6-month window.
    const late = CATALOGUE.find((t) => t.title === "Boda Boda Anthem")!;
    const periods = new Set(LEDGER.filter((r) => r.isrc === late.isrc).map((r) => r.period));

    for (const period of periods) {
      expect(period >= "2026-08").toBe(true);
    }
  });

  it("keeps shares inside a recording consistent with the policy", () => {
    const featured = CATALOGUE.find((t) => t.featuredArtists.length === 2)!;
    const rows = LEDGER.filter((r) => r.isrc === featured.isrc);
    const shares = new Set(rows.map((r) => r.share));

    expect(shares.has(DISTRIBUTION_POLICY.primaryShare)).toBe(true);
    expect(shares.has(DISTRIBUTION_POLICY.featuredShare / 2)).toBe(true);
  });

  it("is deterministic", () => {
    expect(buildPlayLedger({ catalogue: CATALOGUE, now: NOW, months: 6 })).toEqual(LEDGER);
  });

  it("returns nothing for an empty catalogue", () => {
    expect(buildPlayLedger({ catalogue: [], now: NOW, months: 6 })).toEqual([]);
  });

  it("produces more history for a wider window", () => {
    const three = buildPlayLedger({ catalogue: CATALOGUE, now: NOW, months: 3 });
    expect(LEDGER.length).toBeGreaterThan(three.length);
  });
});

describe("applyFilters", () => {
  it("treats an empty selection as no constraint", () => {
    expect(applyFilters(LEDGER, EMPTY_FILTERS)).toHaveLength(LEDGER.length);
  });

  it("filters by station", () => {
    const target = LEDGER[0].stationId;
    const result = applyFilters(LEDGER, { ...EMPTY_FILTERS, stations: [target] });

    expect(result.length).toBeGreaterThan(0);
    expect(result.every((r) => r.stationId === target)).toBe(true);
  });

  it("accepts several stations at once", () => {
    const ids = [...new Set(LEDGER.map((r) => r.stationId))].slice(0, 3);
    const result = applyFilters(LEDGER, { ...EMPTY_FILTERS, stations: ids });

    expect(new Set(result.map((r) => r.stationId))).toEqual(new Set(ids));
  });

  it("filters by region", () => {
    const result = applyFilters(LEDGER, { ...EMPTY_FILTERS, regions: ["Northern"] });

    expect(result.length).toBeGreaterThan(0);
    expect(result.every((r) => r.region === "Northern")).toBe(true);
  });

  it("filters by period", () => {
    const period = LEDGER[0].period;
    const result = applyFilters(LEDGER, { ...EMPTY_FILTERS, periods: [period] });

    expect(result.every((r) => r.period === period)).toBe(true);
  });

  it("filters by membership id", () => {
    const member = LEDGER[0].memberId;
    const result = applyFilters(LEDGER, { ...EMPTY_FILTERS, members: [member] });

    expect(result.every((r) => r.memberId === member)).toBe(true);
  });

  it("intersects the dimensions", () => {
    const row = LEDGER[0];
    const filters: CmoFilters = {
      stations: [row.stationId],
      regions: [row.region],
      periods: [row.period],
      members: [row.memberId],
    };

    const result = applyFilters(LEDGER, filters);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((r) => r.id === row.id)).toBe(true);
  });

  it("returns nothing for an impossible combination", () => {
    const filters: CmoFilters = {
      stations: [LEDGER[0].stationId],
      regions: ["Northern"],
      periods: [],
      members: [],
    };
    const station = LEDGER.find((r) => r.stationId === filters.stations[0])!;

    if (station.region !== "Northern") {
      expect(applyFilters(LEDGER, filters)).toEqual([]);
    }
  });

  it("counts active filter groups", () => {
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);
    expect(countActiveFilters({ stations: ["a"], regions: [], periods: [], members: [] })).toBe(1);
    expect(
      countActiveFilters({ stations: ["a"], regions: ["Central"], periods: ["2026-08"], members: ["x"] }),
    ).toBe(4);
  });
});

describe("buildReport", () => {
  const report = buildReport(LEDGER, EMPTY_FILTERS, NOW);

  it("totals plays and royalty exactly from the rows", () => {
    expect(report.totalPlays).toBe(LEDGER.reduce((s, r) => s + r.plays, 0));
    expect(report.royaltyPoolUgx).toBe(LEDGER.reduce((s, r) => s + r.allocationUgx, 0));
    expect(report.royaltyPoolUsd).toBeCloseTo(report.royaltyPoolUgx / UGX_PER_USD, 6);
    expect(report.rowCount).toBe(LEDGER.length);
  });

  it("counts distinct stations and recordings", () => {
    expect(report.stationCount).toBe(new Set(LEDGER.map((r) => r.stationId)).size);
    expect(report.workCount).toBe(new Set(LEDGER.map((r) => r.isrc)).size);
  });

  it("allocates the whole pool across members", () => {
    const allocated = report.allocations.reduce((s, a) => s + a.allocationUgx, 0);
    expect(allocated).toBe(report.royaltyPoolUgx);
    expect(report.allocations.reduce((s, a) => s + a.shareOfPool, 0)).toBeCloseTo(1, 6);
  });

  it("sorts members by allocation, largest first", () => {
    for (let i = 1; i < report.allocations.length; i++) {
      expect(report.allocations[i - 1].allocationUgx).toBeGreaterThanOrEqual(
        report.allocations[i].allocationUgx,
      );
    }
  });

  it("breaks the pool down by rate tier and region", () => {
    expect(report.byRate.reduce((s, r) => s + r.amountUgx, 0)).toBe(report.royaltyPoolUgx);
    expect(report.byRegion.reduce((s, r) => s + r.amountUgx, 0)).toBe(report.royaltyPoolUgx);
    expect(report.byRegion).toHaveLength(4);
  });

  it("describes the reporting window", () => {
    expect(report.periods.length).toBeGreaterThan(0);
    expect(report.periodLabel).toContain("–");
  });

  it("summarises the filters in words", () => {
    expect(report.filterSummary).toContain("All stations");
    expect(report.filterSummary).toContain("All regions");
    expect(report.filterSummary).toContain("All members");
  });

  it("handles an empty selection without dividing by zero", () => {
    const empty = buildReport([], EMPTY_FILTERS, NOW);

    expect(empty.rowCount).toBe(0);
    expect(empty.totalPlays).toBe(0);
    expect(empty.royaltyPoolUgx).toBe(0);
    expect(empty.allocations).toEqual([]);
    expect(empty.periodLabel).toBe("—");
  });
});

describe("CSV export", () => {
  it("writes a header and one line per ledger row", () => {
    const csv = ledgerToCsv(LEDGER);
    const lines = csv.split("\r\n");

    expect(lines[0]).toBe(
      "Member ID,Artist,Recording (ISRC),Title,Station,Station tier,Region,Period,Plays,Rights share,Rate (UGX/play),Allocation (UGX),Allocation (USD)",
    );
    expect(lines).toHaveLength(LEDGER.length + 1);
  });

  it("escapes embedded commas and quotes", () => {
    const csv = ledgerToCsv([
      {
        ...LEDGER[0],
        artist: 'Okoth, Peter "PK"',
        title: "One, Two",
      },
    ]);

    expect(csv).toContain('"Okoth, Peter ""PK"""');
    expect(csv).toContain('"One, Two"');
  });

  it("summarises the report with its scope and basis", () => {
    const report = buildReport(LEDGER, EMPTY_FILTERS, NOW);
    const csv = reportToCsv(report);

    expect(csv).toContain("Uganda Performing Right Society (UPRS)");
    expect(csv).toContain(`Total plays,${report.totalPlays}`);
    expect(csv).toContain(`Royalty pool (UGX),${report.royaltyPoolUgx}`);
    expect(csv).toContain("placeholder tariff");
    expect(csv).toContain("Allocation by member");

    const memberLines = csv.split("\r\n");
    expect(memberLines).toContain(`Member ID,Artist,Plays,Stations,Recordings,Allocation (UGX),Allocation (USD),Share of pool`);
  });

  it("exports an empty ledger as a header only", () => {
    expect(ledgerToCsv([]).split("\r\n")).toHaveLength(1);
  });
});
