import type { Metadata } from "next";
import { DashboardSection } from "@/components/dashboard-section";

export const metadata: Metadata = { title: "Live station monitor" };

export default function MonitorPage() {
  return <DashboardSection section="monitor" />;
}
