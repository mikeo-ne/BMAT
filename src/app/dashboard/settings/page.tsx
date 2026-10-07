import type { Metadata } from "next";
import { DashboardSection } from "@/components/dashboard-section";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return <DashboardSection section="settings" />;
}
