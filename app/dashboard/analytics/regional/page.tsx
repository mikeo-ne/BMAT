import type { Metadata } from "next";

import { RegionalAnalytics } from "@/components/regional-analytics";
import { readTracks } from "@/lib/store";

export const metadata: Metadata = {
  title: "Airplay Geography & Hit Velocity",
  description:
    "Uganda and East Africa airplay by hub, radio spin growth against streaming-search trends, and an A&R predictor for tracks breaking out of secondary markets.",
};

export const dynamic = "force-dynamic";

export default async function RegionalAnalyticsPage() {
  const catalogue = await readTracks();

  return <RegionalAnalytics catalogue={catalogue} />;
}
