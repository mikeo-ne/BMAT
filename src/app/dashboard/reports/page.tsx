import type { Metadata } from "next";
import { DashboardSection } from "@/components/dashboard-section";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return <DashboardSection section="reports" />;
}
