"use client";

import { usePathname } from "next/navigation";

const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/artist": "Artist & Label Portal",
  "/dashboard/monitoring": "Live Station Monitor",
  "/dashboard/cmo": "CMO & Regulatory Audit",
  "/dashboard/splits": "Rights & Split-Sheet Management",
  "/dashboard/advertisers": "Ad Campaign Auditor",
  "/dashboard/mix-parser": "Unidentified Audio & DJ Mix Parser",
  "/dashboard/analytics/regional": "Airplay Geography & Hit Velocity",
  "/dashboard/alerts": "Live Airplay Alerts & Webhooks",
};

/** Topbar title, derived from the active route. */
export function DashboardHeading() {
  const pathname = usePathname();
  const title = TITLES[pathname] ?? "Dashboard";

  return (
    <div className="min-w-0">
      <p className="truncate text-xs uppercase tracking-[0.14em] text-muted">Dashboard</p>
      <h1 className="truncate text-base font-semibold tracking-tight">{title}</h1>
    </div>
  );
}
