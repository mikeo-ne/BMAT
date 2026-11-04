import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { CmoDashboard } from "@/components/dashboards/cmo/CmoDashboard";

export const metadata: Metadata = { title: "CMO Auditor" };

// Route-level code splitting: this bundle contains ONLY the cmo module and its data.
export default function Page() {
  return (
    <DashboardShell role="cmo">
      <CmoDashboard />
    </DashboardShell>
  );
}
