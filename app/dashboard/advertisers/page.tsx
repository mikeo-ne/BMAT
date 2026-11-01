import { requirePageRole } from "@/lib/auth";
import type { Metadata } from "next";

import { AdAuditor } from "@/components/ad-auditor";

export const metadata: Metadata = {
  title: "Ad Campaign Auditor",
  description:
    "Explore an explicitly simulated ad-contract and spot-audit planning workspace, with contracted windows, a heatmap and example breach queues. Not detected brand activity.",
};

export default async function AdCampaignAuditorPage() {
  const actor = await requirePageRole(
    ["broadcaster"],
    "/dashboard/advertisers",
  );
  return <AdAuditor allowedStationIds={actor.stationIds} />;
}
