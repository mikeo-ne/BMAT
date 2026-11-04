import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { LabelDashboard } from "@/components/dashboards/label/LabelDashboard";

export const metadata: Metadata = { title: "Label Dashboard" };

// Route-level code splitting: this bundle contains ONLY the label module and its data.
export default function Page() {
  return (
    <DashboardShell role="label">
      <LabelDashboard />
    </DashboardShell>
  );
}
