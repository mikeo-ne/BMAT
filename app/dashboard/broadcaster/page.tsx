import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { BroadcasterDashboard } from "@/components/dashboards/broadcaster/BroadcasterDashboard";

export const metadata: Metadata = { title: "Broadcaster Dashboard" };

// Route-level code splitting: this bundle contains ONLY the broadcaster module and its data.
export default function Page() {
  return (
    <DashboardShell role="broadcaster">
      <BroadcasterDashboard />
    </DashboardShell>
  );
}
