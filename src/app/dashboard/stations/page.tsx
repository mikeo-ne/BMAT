import type { Metadata } from "next";
import { DashboardSection } from "@/components/dashboard-section";

export const metadata: Metadata = { title: "Monitored stations" };

export default function StationsPage() {
  return <DashboardSection section="stations" />;
}
