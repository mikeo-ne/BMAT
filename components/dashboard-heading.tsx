"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { moduleForPath } from "@/lib/workspaces";

/** A single module catalogue keeps the heading, sidebar and deep-link titles in sync. */
export function DashboardHeading() {
  const title = moduleForPath(usePathname())?.title ?? "Dashboard";
  // Native artist-tab history does not fetch server metadata; keep the browser title in sync too.
  useEffect(() => {
    document.title = `${title} · East Sound`;
  }, [title]);
  return (
    <div className="min-w-0">
      <p className="mb-1 truncate text-[9px] font-medium uppercase tracking-[0.18em] text-muted">
        Active workspace <span className="mx-1 opacity-40">/</span> Uganda
      </p>
      <h1 className="truncate text-sm font-semibold tracking-tight sm:text-base">
        {title}
      </h1>
    </div>
  );
}
