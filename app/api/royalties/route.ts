import { NextResponse } from "next/server";

import { buildCapturedRoyaltiesModel } from "@/lib/royalties";
import { readWorkspaceData } from "@/lib/workspace-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/royalties
 *
 * Full distribution & payouts view: the play-ledger report, per-member royalty
 * statements and the payout batches that carry them. `months` optionally limits
 * the reporting window (default 6, bounded 1-12).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawMonths = Number(searchParams.get("months") ?? "6");
  const months = Number.isFinite(rawMonths)
    ? Math.min(12, Math.max(1, Math.round(rawMonths)))
    : 6;

  const data = await readWorkspaceData();
  const model = buildCapturedRoyaltiesModel(
    data.catalogue,
    data.history,
    new Date(),
    months,
  );

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    window: months,
    report: model.report,
    members: model.members,
    statements: model.statements,
    batches: model.batches,
    months: model.months,
  });
}
