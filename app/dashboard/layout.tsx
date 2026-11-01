import { serverSession, userDto } from "@/lib/auth";
import { sessionScope } from "@/lib/auth-types";
import { deploymentStorageNotice } from "@/lib/runtime-storage";
import { DashboardShell } from "@/components/dashboard-shell";
import { PANEL_SIZE } from "@/lib/catalog";
import { FM_STATIONS } from "@/lib/regions";
import { monitoredCount } from "@/lib/monitoring";

// Deployment/storage capabilities are request-specific, including otherwise static role views.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: LayoutProps<"/dashboard">) {
  const auth = await serverSession();
  return (
    <DashboardShell
      serverScope={sessionScope(auth ? userDto(auth.user) : null)}
      panelSize={PANEL_SIZE}
      deploymentNotice={deploymentStorageNotice()}
      fm={FM_STATIONS.length}
      tv={monitoredCount("TV")}
    >
      {children}
    </DashboardShell>
  );
}
