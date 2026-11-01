"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  ArrowUpRight,
  AudioLines,
  Bell,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronRight,
  Disc3,
  FileCheck2,
  FileMusic,
  Globe2,
  Headphones,
  LayoutDashboard,
  MapPinned,
  Menu,
  Radio,
  ScanLine,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { NotificationSettingsLauncher } from "@/components/notification-config-dialog";
import { DashboardHeading } from "@/components/dashboard-heading";
import { OnboardingGuide } from "@/components/onboarding-guide";
import {
  WORKSPACES,
  isWorkspace,
  workspaceForPath,
  type WorkspaceId,
} from "@/lib/workspaces";

const NAV = [
  {
    href: "/dashboard/artist",
    label: "Overview & catalogue",
    icon: LayoutDashboard,
    roles: ["artist"],
  },
  {
    href: "/dashboard/artists",
    label: "Artists & music",
    icon: Disc3,
    roles: ["artist", "broadcaster", "cmo", "advertiser"],
  },
  {
    href: "/dashboard/playout",
    label: "Broadcast playout log",
    icon: FileMusic,
    roles: ["broadcaster"],
  },
  {
    href: "/dashboard/cmo",
    label: "Compliance & audit",
    icon: ShieldCheck,
    roles: ["cmo", "broadcaster"],
  },
  {
    href: "/dashboard/advertisers",
    label: "Campaign overview",
    icon: LayoutDashboard,
    roles: ["advertiser"],
  },
  {
    href: "/dashboard/analytics/regional",
    label: "Regional airplay",
    icon: MapPinned,
    roles: ["artist", "broadcaster", "cmo", "advertiser"],
  },
  {
    href: "/dashboard/charts",
    label: "National charts",
    icon: ChartNoAxesCombined,
    roles: ["artist", "broadcaster"],
  },
  {
    href: "/dashboard/monitoring",
    label: "Live station monitor",
    icon: Radio,
    roles: ["broadcaster", "advertiser", "cmo"],
  },
  {
    href: "/dashboard/mix-parser",
    label: "Unmatched & DJ mixes",
    icon: ScanLine,
    roles: ["broadcaster", "cmo"],
  },
  {
    href: "/dashboard/splits",
    label: "Rights & split sheets",
    icon: Users,
    roles: ["artist", "cmo"],
  },
  {
    href: "/dashboard/royalties",
    label: "Royalties & payouts",
    icon: Wallet,
    roles: ["artist", "cmo"],
  },
  {
    href: "/dashboard/alerts",
    label: "Airplay alerts & webhooks",
    icon: Bell,
    roles: ["artist", "broadcaster", "advertiser"],
  },
];

const STORE_KEY = "east-sound:workspace";
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("east-sound:workspace", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("east-sound:workspace", callback);
  };
}
function getStoredWorkspace(): string | null {
  try {
    return localStorage.getItem(STORE_KEY);
  } catch {
    return null;
  }
}

export function DashboardShell({
  children,
  deploymentNotice,
  panelSize,
  fm,
  tv,
}: {
  children: ReactNode;
  deploymentNotice?: string | null;
  panelSize: number;
  monitored: number;
  fm: number;
  tv: number;
}) {
  const pathname = usePathname().replace(/\/+$/, "");
  const router = useRouter();
  const stored = useSyncExternalStore(
    subscribe,
    getStoredWorkspace,
    () => null,
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const asideRef = useRef<HTMLElement>(null);
  // Direct links to a primary workspace always reveal the appropriate navigation.
  const primary = WORKSPACES.find(
    (item) =>
      item.href === pathname ||
      (item.id === "artist" && pathname === "/dashboard/artists"),
  );
  const role: WorkspaceId =
    primary?.id ?? (isWorkspace(stored) ? stored : workspaceForPath(pathname));
  const workspace = WORKSPACES.find((item) => item.id === role)!;
  useEffect(() => {
    if (!primary || stored === primary.id) return;
    try {
      localStorage.setItem(STORE_KEY, primary.id);
      window.dispatchEvent(new Event("east-sound:workspace"));
    } catch {
      /* Storage is optional. */
    }
  }, [primary, stored]);
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      Array.from(
        asideRef.current?.querySelectorAll<HTMLElement>(
          "a[href], button:not(:disabled), select",
        ) ?? [],
      );
    focusable()[0]?.focus();
    function keyboard(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileOpen(false);
      if (event.key !== "Tab") return;
      const controls = focusable();
      const first = controls[0],
        last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    const media = window.matchMedia?.("(min-width: 1024px)");
    const resize = () => {
      if (media?.matches) setMobileOpen(false);
    };
    media?.addEventListener("change", resize);
    document.addEventListener("keydown", keyboard);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keyboard);
      media?.removeEventListener("change", resize);
      previous?.focus();
    };
  }, [mobileOpen]);

  function switchWorkspace(value: string) {
    if (!isWorkspace(value)) return;
    try {
      localStorage.setItem(STORE_KEY, value);
      window.dispatchEvent(new Event("east-sound:workspace"));
    } catch {
      /* Navigation still works with storage disabled. */
    }
    const next = WORKSPACES.find((item) => item.id === value)!;
    setMobileOpen(false);
    router.push(next.href);
  }

  return (
    <div className="min-h-screen lg:pl-[252px]">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm lg:hidden"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        ref={asideRef}
        aria-label="Workspace navigation"
        className={`app-sidebar fixed inset-y-0 left-0 z-50 flex w-[252px] flex-col transition-transform duration-200 ${mobileOpen ? "visible translate-x-0" : "invisible -translate-x-full lg:visible lg:translate-x-0"}`}
      >
        <div className="flex items-center justify-between px-6 pb-7 pt-8">
          <Link
            href="/dashboard/artist"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-3"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#d5ef83] text-[#132a21]">
              <AudioLines size={24} strokeWidth={2.2} />
            </span>
            <span>
              <span className="block text-xl font-semibold tracking-tight text-white">
                east sound<span className="text-[#d5ef83]">.</span>
              </span>
              <span className="mt-0.5 block text-[9px] uppercase tracking-[0.22em] text-[#91a5af]">
                Every play has a story
              </span>
            </span>
          </Link>
          <button
            type="button"
            className="rounded p-1 text-[#a6b9c3] lg:hidden"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="mx-4 rounded-xl border border-white/10 bg-white/[0.035] p-3">
          <div className="mb-1.5 flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.17em] text-[#93a9b4]">
            <span className="h-1 w-1 rounded-full bg-[#d5ef83]" />
            Your workspace
          </div>
          <div className="relative">
            <select
              aria-label="Switch workspace"
              className="w-full cursor-pointer appearance-none bg-transparent pr-6 text-xs font-medium text-white outline-none"
              value={role}
              onChange={(event) => switchWorkspace(event.target.value)}
            >
              {WORKSPACES.map((item) => (
                <option className="bg-[#13242e]" key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-0 top-0.5 text-[#a6b9c3]"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-7">
          <p className="mb-3 px-3 text-[9px] font-medium uppercase tracking-[0.2em] text-[#6f8794]">
            YOUR INTELLIGENCE
          </p>
          <nav aria-label="Dashboard" className="space-y-1">
            {NAV.filter((item) => item.roles.includes(role)).map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`group flex items-center gap-3 rounded-lg px-3 py-3 text-xs font-medium transition-colors ${active ? "bg-[#d5ef83] text-[#172e24]" : "text-[#a8bac4] hover:bg-white/5 hover:text-white"}`}
                >
                  <item.icon size={17} strokeWidth={active ? 2 : 1.7} />
                  <span>{item.label}</span>
                  {active && <ChevronRight size={13} className="ml-auto" />}
                </Link>
              );
            })}
          </nav>
          <div className="mt-7 border-t border-white/10 pt-5">
            <p className="mb-3 px-3 text-[9px] uppercase tracking-[0.2em] text-[#6f8794]">
              OTHER WORKSPACES
            </p>
            {WORKSPACES.filter((item) => item.id !== role).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => switchWorkspace(item.id)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[11px] text-[#91a7b2] hover:bg-white/5 hover:text-white"
              >
                <span className="h-1 w-1 rounded-full bg-[#58727e]" />
                {item.short}
                <ArrowUpRight size={12} className="ml-auto opacity-50" />
              </button>
            ))}
          </div>
        </div>
        <div className="px-5 pb-5">
          <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-[11px] font-medium text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-[#b7d977]" />
                Uganda panel
              </span>
              <Activity size={14} className="text-[#b7d977]" />
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-[#91a7b2]">
              {fm} FM / {tv} TV directory entries
              <br />
              {panelSize} directory stations · connect licensed sources
            </p>
            <span className="mt-3 inline-block rounded border border-white/10 px-1.5 py-0.5 text-[8px] uppercase tracking-[0.14em] text-[#b7c7cf]">
              Capture-backed workspace
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 border-t border-white/10 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2e444c] text-[11px] font-semibold text-[#d5ef83]">
            ES
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-white">
              East Sound workspace
            </p>
            <p className="mt-0.5 text-[10px] text-[#829ba8]">
              Uganda music workspace
            </p>
          </div>
          <Disc3 size={15} className="ml-auto text-[#72909e]" />
        </div>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex min-h-[78px] items-center justify-between gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur-xl sm:px-7 lg:px-9">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="icon-btn lg:hidden"
              aria-label="Open navigation"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={20} />
            </button>
            <DashboardHeading />
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-4">
            <span className="hidden items-center gap-1.5 text-[11px] text-muted md:flex">
              <Globe2 size={14} />
              Uganda <span className="ml-1 text-line">/</span> EAT
            </span>
            <span className="hidden rounded-full border border-brand/20 bg-brand/5 px-2.5 py-1 text-[10px] font-medium text-brand sm:inline">
              Source-led workspace
            </span>
            <OnboardingGuide compact />
            <NotificationSettingsLauncher />
            <div className="hidden h-6 w-px bg-line sm:block" />
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 text-[10px] font-semibold text-brand"
              title="East Sound workspace"
            >
              ES
            </span>
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="min-w-0 flex-1 px-4 py-6 outline-none sm:px-7 lg:px-9 lg:py-8"
        >
          {deploymentNotice && (
            <p
              role="status"
              className="mb-5 rounded-xl border border-brand/20 bg-brand/5 px-4 py-3 text-xs leading-relaxed text-muted"
            >
              {deploymentNotice}
            </p>
          )}
          {children}
        </main>
        <footer className="mx-4 flex flex-wrap items-center justify-between gap-2 border-t border-line py-5 text-[10px] text-muted sm:mx-7 lg:mx-9">
          <span className="flex items-center gap-1.5">
            <Headphones size={12} />
            East Sound · East Africa Airplay Intelligence
          </span>
          <span className="flex items-center gap-1.5">
            <FileCheck2 size={12} />
            {workspace.description}
          </span>
        </footer>
      </div>
    </div>
  );
}
