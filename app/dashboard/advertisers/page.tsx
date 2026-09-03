import type { Metadata } from "next";

import { AdAuditor } from "@/components/ad-auditor";

export const metadata: Metadata = {
  title: "Ad Campaign Auditor",
  description:
    "Book ad jingles with contracted airtime, then audit contracted plays against verified detected plays, with a time-of-day heatmap and a missed-airtime breach queue.",
};

export default function AdCampaignAuditorPage() {
  return <AdAuditor />;
}
