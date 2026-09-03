import type { Metadata } from "next";

import { RoyaltiesDashboard } from "@/components/royalties-dashboard";
import { buildRoyaltiesModel } from "@/lib/royalties";
import { readTracks } from "@/lib/store";

export const metadata: Metadata = {
  title: "Royalties — Distribution & Payouts",
  description:
    "Per-member royalty statements and payout batches derived from the UPRS play ledger, with approval status, payment references and CSV export.",
};

export const dynamic = "force-dynamic";

export default async function RoyaltiesPage() {
  const catalogue = await readTracks();
  const now = new Date();
  const model = buildRoyaltiesModel(catalogue, now, 6);

  return <RoyaltiesDashboard model={model} />;
}
