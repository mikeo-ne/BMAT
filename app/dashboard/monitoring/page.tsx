import { capturePollingAvailable } from "@/lib/runtime-storage";
import type { Metadata } from "next";

import { LiveBroadcastMonitor } from "@/components/live-broadcast-monitor";
import { readWorkspaceData } from "@/lib/workspace-data";

export const metadata: Metadata = {
  title: "Live Station Monitor",
  description:
    "Configure authorized public station feeds for FM/TV playback and review authenticated captured records. Playback does not imply capture or fingerprinting.",
};

export const dynamic = "force-dynamic";

export default async function LiveStationMonitorPage() {
  const data = await readWorkspaceData();
  return (
    <LiveBroadcastMonitor
      catalogue={data.catalogue}
      initialEvents={data.history}
      now={data.now}
      canPoll={capturePollingAvailable()}
    />
  );
}
