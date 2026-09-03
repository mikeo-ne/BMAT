import type { Metadata } from "next";

import { CmoAudit } from "@/components/cmo-audit";
import { buildDisputes, buildSplitSheets } from "@/lib/splits";
import { readTracks } from "@/lib/store";

export const metadata: Metadata = {
  title: "CMO & Regulatory Audit",
  description:
    "UPRS aggregated radio play ledger with station, region, period and membership filters, flat-rate royalty estimation and CSV export.",
};

export const dynamic = "force-dynamic";

export default async function CmoAuditPage() {
  const catalogue = await readTracks();
  const disputes = buildDisputes(buildSplitSheets(catalogue));

  return <CmoAudit catalogue={catalogue} now={new Date().toISOString()} disputes={disputes} />;
}
