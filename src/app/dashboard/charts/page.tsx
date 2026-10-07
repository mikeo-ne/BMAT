import type { Metadata } from "next";
import { DashboardSection } from "@/components/dashboard-section";

export const metadata: Metadata = { title: "Airplay charts" };

export default function ChartsPage() {
  return <DashboardSection section="charts" />;
}
