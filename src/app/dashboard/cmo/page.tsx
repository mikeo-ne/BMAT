import type { Metadata } from "next";
import { DashboardSection } from "@/components/dashboard-section";

export const metadata: Metadata = { title: "CMO audit" };

export default function CmoPage() {
  return <DashboardSection section="cmo" />;
}
