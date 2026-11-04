import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ArtistDashboard } from "@/components/dashboards/artist/ArtistDashboard";

export const metadata: Metadata = { title: "Artist Dashboard" };

// Route-level code splitting: this bundle contains ONLY the artist module and its data.
export default function Page() {
  return (
    <DashboardShell role="artist">
      <ArtistDashboard />
    </DashboardShell>
  );
}
