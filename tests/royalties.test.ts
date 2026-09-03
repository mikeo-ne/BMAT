import { describe, expect, it } from "vitest";

import { buildSeedTracks } from "@/lib/catalog";
import {
  batchesToCsv,
  buildRoyaltiesModel,
  paymentReferenceFor,
  statementId,
  statementsToCsv,
  STATUS_LABEL,
  totals,
  type RoyaltyStatement,
} from "@/lib/royalties";
import { buildPlayLedger } from "@/lib/uprs";

const NOW = new Date("2026-09-03T00:00:00Z");
const CATALOGUE = buildSeedTracks(NOW);
const MODEL = buildRoyaltiesModel(CATALOGUE, NOW, 6);
const LEDGER = buildPlayLedger({ catalogue: CATALOGUE, now: NOW, months: 6 });

describe("statementId", () => {
  it("is stable and period encoded", () => {
    expect(statementId("UPRS-12345", "2026-08")).toBe("stmt_UPRS-12345_202608");
  });
});

describe("buildStatements", () => {
  it("groups the ledger into one statement per member period", () => {
    expect(MODEL.statements.length).toBeGreaterThan(10);
    const keys = new Set(MODEL.statements.map((s) => `${s.memberId}:${s.period}`));
    expect(keys.size).toBe(MODEL.statements.length);
  });

  it("prices every statement from its ledger rows", () => {
    const sample = MODEL.statements[0];
    const rows = LEDGER.filter(
      (r) => r.memberId === sample.memberId && r.period === sample.period,
    );
    expect(sample.allocationUgx).toBe(rows.reduce((a, r) => a + r.allocationUgx, 0));
    expect(sample.plays).toBe(rows.reduce((a, r) => a + r.plays, 0));
  });

  it("moves older periods toward paid and the latest toward pending", () => {
    const newest = MODEL.statements.filter((s) => s.period === MODEL.months.at(-1));
    const oldest = MODEL.statements.filter((s) => s.period === MODEL.months.at(0));

    expect(newest.some((s) => s.status === "pending")).toBe(true);
    expect(oldest.filter((s) => s.status === "paid").length).toBeGreaterThan(0);
  });
});

describe("buildPayoutBatches", () => {
  it("creates one batch per period with correct totals", () => {
    expect(MODEL.batches.length).toBe(6);

    for (const batch of MODEL.batches) {
      expect(batch.members).toBe(new Set(batch.statements.map((s) => s.memberId)).size);
      expect(batch.allocationUgx).toBe(
        batch.statements.reduce((a, s) => a + s.allocationUgx, 0),
      );
      expect(batch.plays).toBe(batch.statements.reduce((a, s) => a + s.plays, 0));
    }
  });

  it("marks a batch blocked when any statement is held", () => {
    const blocked = MODEL.statements.find((s) => s.status === "blocked")!;
    const batch = MODEL.batches.find((b) => b.period === blocked.period)!;

    expect(batch.status).toBe("blocked");
    expect(batch.statements.some((s) => s.status === "blocked")).toBe(true);
  });
});

describe("totals", () => {
  it("accounts for every statement exactly once", () => {
    const summary = totals(MODEL);
    const stated = summary.paidUgx + summary.pendingUgx + summary.blockedUgx;
    expect(stated).toBe(summary.poolUgx);
    expect(summary.pendingCount).toBe(MODEL.statements.filter(
      (s) => s.status === "approved" || s.status === "pending",
    ).length);
  });
});

describe("csv export", () => {
  it("writes a header row and one line per statement", () => {
    const csv = statementsToCsv(MODEL.statements);
    const lines = csv.split("\r\n");
    expect(lines[0]).toContain("Member ID");
    expect(lines[0]).toContain("Payment reference");
    expect(lines.length).toBe(MODEL.statements.length + 1);
  });

  it("escapes commas in artist names", () => {
    const statement: RoyaltyStatement = {
      ...MODEL.statements[0],
      artist: "DJ, Say & The Crew",
      status: "pending",
    };
    const csv = statementsToCsv([statement]);
    expect(csv).toContain('"DJ, Say & The Crew"');
  });

  it("exports batches with their totals", () => {
    const csv = batchesToCsv(MODEL.batches);
    expect(csv).toContain("Batch");
    expect(csv).toContain("Covered (UGX)");
  });
});

describe("labels", () => {
  it("labels every status", () => {
    expect(STATUS_LABEL.pending).toBe("Pending");
    expect(STATUS_LABEL.paid).toBe("Paid");
  });

  it("builds a stable payment reference", () => {
    expect(paymentReferenceFor("UPRS-12345", "2026-08")).toBe("UPRS-202608-2345");
  });
});
