import type { Metadata } from "next";

import { StationMonitor } from "@/components/station-monitor";
import { readTracks } from "@/lib/store";

export const metadata: Metadata = {
  title: "Live Station Monitor",
  description:
    "Watch the monitored Ugandan radio and TV feeds, preview each station's audio, and run audio fingerprint scans against the delivered catalogue.",
};

export const dynamic = "force-dynamic";

export default async function LiveStationMonitorPage() {
  const catalogue = await readTracks();

  return <StationMonitor catalogue={catalogue} />;
}
