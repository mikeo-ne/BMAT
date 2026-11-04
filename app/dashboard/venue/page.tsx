import type { Metadata } from "next";

import { VenueDashboard } from "@/components/venue-dashboard";
import { VENUE_NODES, VENUE_PINGS } from "@/lib/site-content";
import { readPageWorkspace } from "@/lib/workspace-data";

export const metadata: Metadata = {
  title: "Venue Operator Dashboard",
  description:
    "Ambient listener node logs, resident DJ sets and the UPRS public performance compliance badge for your own venues.",
};

export const dynamic = "force-dynamic";

export default async function VenuePage() {
  // Session + role gate: venue operators only, plus the CMO auditor whose
  // remit is universal system visibility.
  const data = await readPageWorkspace(["venue", "cmo"], "/dashboard/venue");
  const assigned = new Set(data.actor.stationIds);
  const nodes =
    data.actor.role === "cmo"
      ? VENUE_NODES
      : VENUE_NODES.filter(
          (node) => assigned.has(node.nodeId) || assigned.has(node.id),
        );
  const names = new Set(nodes.map((node) => node.name));
  const pings = VENUE_PINGS.filter((ping) => names.has(ping.venue));

  return <VenueDashboard nodes={nodes} pings={pings} />;
}
