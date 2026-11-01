import type { Metadata } from "next";

import { AdAuditor } from "@/components/ad-auditor";

export const metadata: Metadata = {
  title: "Ad Campaign Auditor",
  description:
    "Explore an explicitly simulated ad-contract and spot-audit planning workspace, with contracted windows, a heatmap and example breach queues. Not detected brand activity.",
};

export default function AdCampaignAuditorPage() {
  return <AdAuditor />;
}
