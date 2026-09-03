import { NextResponse } from "next/server";

import { batchesToCsv, buildRoyaltiesModel, statementsToCsv } from "@/lib/royalties";
import { readTracks } from "@/lib/store";
import { reportToCsv } from "@/lib/uprs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME = "text/csv;charset=utf-8";

/**
 * GET /api/royalties/export?kind=statements|batches|report
 *
 * Downloads the royalty view as Excel-friendly CSV (BOM so UTF-8 names in the
 * ledger survive spreadsheets). `months` constrains the window the same way as
 * /api/royalties.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind") ?? "statements";
  const rawMonths = Number(searchParams.get("months") ?? "6");
  const months = Number.isFinite(rawMonths) ? Math.min(12, Math.max(1, Math.round(rawMonths))) : 6;

  const catalogue = await readTracks();
  const model = buildRoyaltiesModel(catalogue, new Date(), months);

  let csv: string;
  let fileName: string;

  if (kind === "report") {
    csv = reportToCsv(model.report);
    fileName = "east-sound-uprs-distribution-report.csv";
  } else if (kind === "batches") {
    csv = batchesToCsv(model.batches);
    fileName = "east-sound-payout-batches.csv";
  } else if (kind === "statements") {
    csv = statementsToCsv(model.statements);
    fileName = "east-sound-royalty-statements.csv";
  } else {
    return NextResponse.json({ error: "kind must be statements, batches or report." }, { status: 400 });
  }

  return new NextResponse(`\uFEFF${csv}`, {
    status: 200,
    headers: {
      "Content-Type": MIME,
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
