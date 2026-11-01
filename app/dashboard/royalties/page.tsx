import type { Metadata } from "next";

import { RoyaltiesDashboard } from "@/components/royalties-dashboard";
import { buildCapturedRoyaltiesModel } from "@/lib/royalties";
import { readPageWorkspace } from "@/lib/workspace-data";

export const metadata: Metadata = {
  title: "Royalties — Distribution & Payouts",
  description:
    "Per-member royalty statements and payout batches derived from the UPRS play ledger, with approval status, payment references and CSV export.",
};

export const dynamic = "force-dynamic";

export default async function RoyaltiesPage() {
  const data = await readPageWorkspace(["cmo"], "/dashboard/royalties");
  const now = new Date();
  const model = buildCapturedRoyaltiesModel(
    data.catalogue,
    data.history,
    now,
    6,
  );

  return <RoyaltiesDashboard model={model} />;
}
