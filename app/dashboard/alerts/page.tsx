import type { Metadata } from "next";

import { AlertsView } from "@/components/alerts-view";
import { readTracks } from "@/lib/store";

export const metadata: Metadata = {
  title: "Live Airplay Alerts & Webhooks",
  description:
    "Toggle WhatsApp, email and webhook alerts per track or station, and watch verified plays land on a simulated handset in real time.",
};

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const catalogue = await readTracks();
  // Rounded to the hour so a refresh does not reshuffle the whole event stream.
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);

  return <AlertsView catalogue={catalogue} now={now} />;
}
