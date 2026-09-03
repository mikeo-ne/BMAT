import { describe, expect, it } from "vitest";

import { buildSeedTracks } from "@/lib/catalog";
import {
  buildDisputes,
  buildSplitSheet,
  buildSplitSheets,
  DISPUTE_KIND_LABEL,
  rightTypeLabel,
} from "@/lib/splits";

const NOW = new Date("2026-09-03T00:00:00Z");
const CATALOGUE = buildSeedTracks(NOW);
const SHEETS = buildSplitSheets(CATALOGUE, NOW);

describe("split sheets", () => {
  it("builds one sheet per recording", () => {
    expect(SHEETS).toHaveLength(CATALOGUE.length);
    expect(SHEETS.map((s) => s.isrc)).toEqual(CATALOGUE.map((t) => t.isrc));
  });

  it("allocates exactly 100% on every sheet", () => {
    for (const sheet of SHEETS) {
      const total = sheet.parties.reduce((sum, p) => sum + p.sharePct, 0);
      expect(total, `${sheet.title} totals ${total}%`).toBe(100);
      expect(sheet.totalPct).toBe(100);
    }
  });

  it("gives the primary artist the lead share", () => {
    for (const sheet of SHEETS) {
      const primary = sheet.parties.find((p) => p.role === "Primary artist")!;
      for (const other of sheet.parties) {
        expect(primary.sharePct).toBeGreaterThanOrEqual(other.sharePct);
      }
    }
  });

  it("gives featured artists an equal block", () => {
    const withFeatured = SHEETS.find((s) => s.parties.filter((p) => p.role === "Featured artist").length >= 2);
    if (!withFeatured) return;

    const shares = withFeatured.parties
      .filter((p) => p.role === "Featured artist")
      .map((p) => p.sharePct);

    // The first takes any rounding remainder, so the spread is at most 1 point.
    expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
  });

  it("records a producer and a publisher on every sheet", () => {
    for (const sheet of SHEETS) {
      expect(sheet.parties.some((p) => p.role === "Producer")).toBe(true);
      expect(sheet.parties.some((p) => p.role === "Publisher")).toBe(true);
    }
  });

  it("marks a sheet complete only when every party has signed", () => {
    for (const sheet of SHEETS) {
      const allSigned = sheet.parties.every((p) => p.signedAt !== null);
      expect(sheet.status === "complete").toBe(allSigned);
    }
  });

  it("gives every party a member id and a signing channel", () => {
    for (const sheet of SHEETS) {
      for (const party of sheet.parties) {
        expect(party.memberId).toMatch(/^UPRS-[A-Z]{3}-\d{4}$/);
        expect(party.channel).toBeTruthy();
      }
    }
  });

  it("is deterministic", () => {
    const again = buildSplitSheet(CATALOGUE[0], NOW);
    expect(again.parties.map((p) => p.sharePct)).toEqual(
      SHEETS[0].parties.map((p) => p.sharePct),
    );
  });
});

describe("disputes", () => {
  const disputes = buildDisputes(SHEETS, NOW);

  it("flags two publishers claiming the whole mechanical right", () => {
    const overlap = disputes.find((d) => d.kind === "overlapping-rights");
    expect(overlap).toBeTruthy();
    expect(overlap!.claimants).toHaveLength(2);
    expect(overlap!.claimants.every((c) => c.claimPct === 100)).toBe(true);
    expect(overlap!.claimants.every((c) => c.rightType === "mechanical")).toBe(true);
    expect(overlap!.overlapPct).toBe(100);
    expect(overlap!.severity).toBe("critical");
  });

  it("covers the unregistered ISRC case with both claimants named", () => {
    const external = disputes.find((d) => d.kind === "unmatched-registration");
    expect(external).toBeTruthy();
    expect(external!.isrc).toBe("UG-A01-26-00012");
    expect(external!.external).toBe(true);
    expect(external!.headline).toBe(
      "Two publishers claiming 100% mechanical rights for ISRC UG-A01-26-00012",
    );
  });

  it("reports no share-overflow dispute when every sheet totals 100", () => {
    expect(disputes.some((d) => d.kind === "share-overflow")).toBe(false);
  });

  it("labels every dispute kind and right type", () => {
    for (const dispute of disputes) {
      expect(DISPUTE_KIND_LABEL[dispute.kind]).toBeTruthy();
      for (const claimant of dispute.claimants) {
        expect(rightTypeLabel(claimant.rightType)).toMatch(/rights$/);
      }
    }
  });
});
