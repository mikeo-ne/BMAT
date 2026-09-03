"use client";

import { usePathname } from "next/navigation";

const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/artist": "Artist & Label Portal",
  "/dashboard/monitoring": "Live Station Monitor",
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
