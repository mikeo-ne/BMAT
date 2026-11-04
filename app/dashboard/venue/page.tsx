import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { VenueDashboard } from "@/components/dashboards/venue/VenueDashboard";

export const metadata: Metadata = { title: "Venue Dashboard" };

// Route-level code splitting: this bundle contains ONLY the venue module and its data.
export default function Page() {
  return (
    <DashboardShell role="venue">
      <VenueDashboard />
    </DashboardShell>
  );
}
