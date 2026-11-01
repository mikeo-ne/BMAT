import { capturePollingAvailable } from "@/lib/runtime-storage";
import type { Metadata } from "next";

import { AlertsView } from "@/components/alerts-view";
import { readWorkspaceData } from "@/lib/workspace-data";
import { notificationProviderReadiness } from "@/lib/notification-transport";

export const metadata: Metadata = {
  title: "Live Airplay Alerts & Webhooks",
  description:
    "Configure opted-in WhatsApp alerts, daily and weekly email digests, signed webhooks, and a clearly labelled notification simulator for real Ugandan artist releases.",
};

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const data = await readWorkspaceData();
  return (
    <AlertsView
      catalogue={data.catalogue}
      initialEvents={data.history}
      now={data.now}
      providers={notificationProviderReadiness()}
      canPoll={capturePollingAvailable()}
    />
  );
}
