"use client";

import { usePathname } from "next/navigation";

const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/artist": "Artist & Label Portal",
  "/dashboard/artists": "Artists & Music Library",
  "/dashboard/monitoring": "Live Station Monitor",
  "/dashboard/playout": "Broadcaster Playout Log",
  "/dashboard/cmo": "CMO & UPRS Regulatory Auditor",
  "/dashboard/cmo/master": "CMO & UPRS Regulatory Auditor",
  "/dashboard/east-sound": "CMO & UPRS Regulatory Auditor",
  "/dashboard/splits": "Rights & Split-Sheet Management",
  "/dashboard/advertisers": "Advertiser Spot Tracker",
  "/dashboard/mix-parser": "Unidentified Audio & DJ Mix Parser",
  "/dashboard/analytics/regional": "Airplay Geography & Hit Velocity",
  "/dashboard/alerts": "Live Airplay Alerts & Webhooks",
  "/dashboard/charts": "National Charts",
  "/dashboard/royalties": "Royalties",
};

/** Topbar title, derived from the active route. */
export function DashboardHeading() {
  const pathname = usePathname().replace(/\/+$/, "");
  const title = TITLES[pathname] ?? "Dashboard";

  return (
    <div className="min-w-0">
      <p className="mb-1 truncate text-[9px] font-medium uppercase tracking-[0.18em] text-muted">
        WORKSPACE <span className="mx-1 opacity-50">/</span> UGANDA PANEL
      </p>
      <h1 className="truncate text-sm font-semibold tracking-tight">{title}</h1>
    </div>
  );
}
