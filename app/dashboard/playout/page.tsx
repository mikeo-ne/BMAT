import { capturePollingAvailable } from "@/lib/runtime-storage";
import type { Metadata } from "next";
import { PlayoutLog } from "@/components/playout-log";
import { readWorkspaceData } from "@/lib/workspace-data";
export const metadata: Metadata = {
  title: "Broadcaster Playout Log",
  description:
    "Filter Uganda FM and TV playout, review ten-second audio excerpts, and export station logging sheets for UPRS review.",
};
export const dynamic = "force-dynamic";
export default async function PlayoutPage() {
  const data = await readWorkspaceData();
  return (
    <PlayoutLog
      catalogue={data.catalogue}
      initialEvents={data.history}
      now={data.now}
      canPoll={capturePollingAvailable()}
    />
  );
}
