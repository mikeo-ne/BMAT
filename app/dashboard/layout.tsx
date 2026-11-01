import { deploymentStorageNotice } from "@/lib/runtime-storage";
import { DashboardShell } from "@/components/dashboard-shell";
import { PANEL_SIZE } from "@/lib/catalog";
import { MONITORED_STATIONS, monitoredCount } from "@/lib/monitoring";

export default function DashboardLayout({
  children,
}: LayoutProps<"/dashboard">) {
  return (
    <DashboardShell
      panelSize={PANEL_SIZE}
      deploymentNotice={deploymentStorageNotice()}
      monitored={MONITORED_STATIONS.length}
      fm={monitoredCount("FM")}
      tv={monitoredCount("TV")}
    >
      {children}
    </DashboardShell>
  );
}
