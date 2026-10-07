"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Headphones,
  Menu,
  Mic2,
  Music2,
  Radio,
  Settings,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigation: { label: string; href: string; icon: LucideIcon; group: string }[] = [
  { label: "Artist & Label", href: "/dashboard/artist", icon: Mic2, group: "Workspace" },
  { label: "Airplay charts", href: "/dashboard/charts", icon: BarChart3, group: "Workspace" },
  { label: "Live monitor", href: "/dashboard/monitor", icon: Radio, group: "Workspace" },
  { label: "CMO audit", href: "/dashboard/cmo", icon: ShieldCheck, group: "Workspace" },
  { label: "Stations", href: "/dashboard/stations", icon: Building2, group: "Manage" },
  { label: "Reports", href: "/dashboard/reports", icon: FileText, group: "Manage" },
  { label: "Settings", href: "/dashboard/settings", icon: Settings, group: "Manage" },
];

function isCurrentPath(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard/artist" && pathname.startsWith(`${href}/`));
}

function Navigation({
  pathname,
  collapsed = false,
  onNavigate,
}: {
  pathname: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  let lastGroup = "";

  return (
    <nav aria-label="Main navigation" className="space-y-5 px-2.5 py-3">
      {navigation.map((item) => {
        const Icon = item.icon;
        const isActive = isCurrentPath(pathname, item.href);
        const showGroup = item.group !== lastGroup;
        lastGroup = item.group;

        return (
          <div key={item.href}>
            {showGroup && !collapsed && (
              <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                {item.group}
              </p>
            )}
            <Link
              href={item.href}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              aria-label={collapsed ? item.label : undefined}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "group flex min-h-11 items-center rounded-xl text-sm font-medium transition-colors",
                collapsed ? "justify-center px-2" : "gap-3 px-3",
                isActive
                  ? "bg-violet-50 text-brand"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                  isActive
                    ? "bg-white text-brand shadow-sm"
                    : "text-slate-500 group-hover:text-slate-800",
                )}
              >
                <Icon aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.9} />
              </span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pageTitle = navigation.find((item) => isCurrentPath(pathname, item.href))?.label ?? "Dashboard";

  useEffect(() => {
    if (!mobileOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileOpen]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-canvas lg:flex">
      {/* Desktop rail: in the normal document flow, so it never overlays or covers the page. */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-slate-200/80 bg-white transition-[width] duration-200 lg:flex",
          collapsed ? "w-[76px]" : "w-[232px]",
        )}
        aria-label="Desktop sidebar"
      >
        <div className={cn("flex h-[72px] shrink-0 items-center border-b border-slate-100", collapsed ? "justify-center px-2" : "justify-between px-4")}>
          <Link href="/dashboard/artist" className="flex min-w-0 items-center gap-2.5" aria-label="EastSound home">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-md shadow-violet-200">
              <Music2 className="h-5 w-5" aria-hidden="true" />
            </span>
            {!collapsed && (
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold tracking-tight text-slate-900">EastSound</span>
                <span className="block text-[10px] font-medium text-slate-400">UG AIRPLAY</span>
              </span>
            )}
          </Link>
          {!collapsed && (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto py-3">
          <Navigation pathname={pathname} collapsed={collapsed} />
        </div>

        <div className={cn("border-t border-slate-100 p-2.5", collapsed ? "flex justify-center" : "")}>
          {collapsed ? (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-brand"
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex items-center gap-2.5 rounded-xl bg-slate-50 p-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">
                BC
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-800">Bebe Cool</p>
                <p className="truncate text-[10px] text-slate-500">Artist account</p>
              </div>
              <Activity className="h-4 w-4 text-emerald-500" aria-label="Account active" />
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/95 px-3 backdrop-blur sm:h-[68px] sm:px-5 lg:px-8">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 lg:hidden"
              aria-label="Open navigation menu"
              aria-expanded={mobileOpen}
              aria-controls="mobile-navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 lg:flex"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900 sm:text-base">{pageTitle}</p>
              <p className="hidden text-[11px] text-slate-500 xs:block">Uganda airplay intelligence</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 sm:flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              24 stations live
            </div>
            <button
              type="button"
              className="relative flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              aria-label="Notifications"
            >
              <Bell className="h-[18px] w-[18px]" />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-white bg-rose-500" />
            </button>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-100 to-fuchsia-100 text-[11px] font-bold text-violet-800" title="Bebe Cool">
              BC
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-3 py-4 sm:px-5 sm:py-6 lg:px-8 lg:py-7">
          <div className="mx-auto w-full max-w-[1440px]">{children}</div>
        </main>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default bg-slate-950/45 backdrop-blur-[2px] lg:hidden"
            aria-label="Close navigation menu"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            id="mobile-navigation"
            className="fixed inset-y-0 left-0 z-50 flex w-[min(300px,86vw)] flex-col border-r border-slate-200 bg-white shadow-float lg:hidden"
            aria-label="Mobile sidebar"
          >
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-100 px-4">
              <Link href="/dashboard/artist" className="flex items-center gap-2.5" onClick={() => setMobileOpen(false)}>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white">
                  <Music2 className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-bold text-slate-900">EastSound</span>
                  <span className="block text-[10px] font-medium text-slate-400">UG AIRPLAY</span>
                </span>
              </Link>
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto py-3">
              <Navigation pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            </div>
            <div className="border-t border-slate-100 p-4">
              <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">BC</div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">Bebe Cool</p>
                  <p className="truncate text-xs text-slate-500">Artist account</p>
                </div>
              </div>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
