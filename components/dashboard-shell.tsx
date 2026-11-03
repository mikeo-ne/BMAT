"use client";

import {
  useEffect,
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  Bell,
  ChartNoAxesCombined,
  ChevronRight,
  Disc3,
  FileCheck2,
  FileMusic,
  Globe2,
  Headphones,
  LayoutDashboard,
  MapPinned,
  Megaphone,
  Menu,
  Radio,
  ScanLine,
  ScrollText,
  ShieldCheck,
  Upload,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { ROLE_LABELS, roleMayOpen, sessionScope } from "@/lib/auth-types";
import { initials } from "@/lib/format";
import { LogIn, LogOut, ShieldCheck as SecurityShield } from "lucide-react";
import { ArtistNavigationProvider } from "@/components/artist-navigation";
import { NotificationSettingsLauncher } from "@/components/notification-config-dialog";
import { DashboardHeading } from "@/components/dashboard-heading";
import { OnboardingGuide } from "@/components/onboarding-guide";
import {
  WORKSPACES,
  artistViewForPath,
  artistViewHref,
  moduleForPath,
  modulesForWorkspace,
  type ArtistView,
  type ModuleId,
} from "@/lib/workspaces";

const ICONS: Record<ModuleId, LucideIcon> = {
  overview: LayoutDashboard,
  music: Disc3,
  catalogue: FileMusic,
  delivery: Upload,
  alerts: Bell,
  charts: ChartNoAxesCombined,
  stats: Globe2,
  "station-overview": Radio,
  "station-logs": FileMusic,
  "ad-audit": Megaphone,
  audit: ShieldCheck,
  rights: Users,
  royalties: Wallet,
  regional: MapPinned,
  "mix-parser": ScanLine,
  reportal: ScrollText,
};

/** BMAT operating-system suite taxonomy shown above the concrete use cases. */
const SOLUTIONS: ReadonlyArray<{
  id: string;
  label: string;
  href: string;
}> = [
  { id: "vericast", label: "Vericast", href: "/dashboard/monitoring" },
  { id: "reportal", label: "Reportal", href: "/dashboard/reportal" },
  { id: "resol", label: "ReSol", href: "/dashboard/splits" },
  { id: "ad-control", label: "AD Control", href: "/dashboard/advertisers" },
  { id: "music-charts", label: "Music Charts", href: "/dashboard/charts" },
];
export function DashboardShell({
  children,
  deploymentNotice,
  panelSize,
  serverScope,
  fm,
  tv,
}: {
  children: ReactNode;
  deploymentNotice?: string | null;
  panelSize: number;
  serverScope?: string;
  fm: number;
  tv: number;
}) {
  const pathname = usePathname();
  const { session, signOut } = useAuth();
  const [authError, setAuthError] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const asideRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const role = session.user?.role ?? "public";
  const workspace = WORKSPACES.find((item) => item.id === role)!;
  const modules = modulesForWorkspace(role).filter((item) =>
    roleMayOpen(role, item.href),
  );
  const active = moduleForPath(pathname);
  const artistView = role === "artist" ? artistViewForPath(pathname) : null;
  const publicView = role === "public";

  useEffect(() => {
    if (!mobileOpen) return;
    const toggle = menuButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const controls = () =>
      Array.from(
        asideRef.current?.querySelectorAll<HTMLElement>(
          "a[href], button:not(:disabled), select",
        ) ?? [],
      );
    controls()[0]?.focus();
    function keyboard(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileOpen(false);
      }
      if (event.key !== "Tab") return;
      const items = controls(),
        first = items[0],
        last = items[items.length - 1];
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
      toggle?.focus();
    };
  }, [mobileOpen]);

  const selectArtistView = useCallback((view: ArtistView) => {
    const url = new URL(window.location.href);
    const prefix = url.pathname.split("/dashboard")[0];
    const slash = url.pathname.endsWith("/") ? "/" : "";
    const previous = url.pathname + url.search + url.hash;
    url.pathname = prefix + artistViewHref(view) + slash;
    if (view !== "music") url.hash = "";
    const next = url.pathname + url.search + url.hash;
    // Next's native-history integration updates usePathname without discarding staged audio or metadata.
    // Dedicated server routes make the same URLs reloadable and static-exportable.
    if (previous !== next) window.history.pushState(null, "", next);
    setMobileOpen(false);
  }, []);
  function navigate(event: MouseEvent<HTMLAnchorElement>, href: string) {
    const destination = artistViewForPath(href);
    if (
      artistView &&
      destination &&
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey
    ) {
      event.preventDefault();
      selectArtistView(destination);
    } else setMobileOpen(false);
  }

  return (
    <ArtistNavigationProvider
      value={artistView ? { view: artistView, select: selectArtistView } : null}
    >
      <div
        className="dashboard-root min-h-dvh lg:pl-72"
        style={{ "--workspace-accent": workspace.accent } as CSSProperties}
      >
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        {mobileOpen && (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-slate-950/75 backdrop-blur-sm lg:hidden"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
        )}
        <aside
          id="workspace-navigation"
          ref={asideRef}
          aria-label="Workspace navigation"
          role={mobileOpen ? "dialog" : undefined}
          aria-modal={mobileOpen || undefined}
          className={`app-sidebar fixed inset-y-0 left-0 z-50 flex w-72 max-w-[calc(100%_-_1.5rem)] flex-col border-r border-line transition-transform duration-200 ${mobileOpen ? "visible translate-x-0" : "invisible -translate-x-full lg:visible lg:translate-x-0"}`}
        >
          <div className="flex items-center justify-between px-6 pb-7 pt-7">
            <Link
              href={workspace.href}
              onClick={(event) => navigate(event, workspace.href)}
              aria-label="East Sound home"
              className="flex min-w-0 items-center gap-3"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-400 to-cyan-400 text-base font-bold tracking-tight text-slate-950">
                ES
              </span>
              <span>
                <span className="block text-lg font-semibold tracking-tight text-slate-100">
                  East Sound<span className="text-emerald-400">.</span>
                </span>
                <span className="mt-0.5 block text-[10px] tracking-wide text-muted">
                  Airplay OS · Uganda
                </span>
              </span>
            </Link>
            <button
              type="button"
              className="icon-btn -mr-2 lg:hidden"
              aria-label="Close menu"
              onClick={() => setMobileOpen(false)}
            >
              <X size={18} />
            </button>
          </div>
          <div className="mx-5 rounded-xl border border-line bg-background/60 p-3.5">
            <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted">
              {session.user ? "Your assigned role" : "Public access"}
            </p>
            <p className="flex items-center gap-2 text-xs font-medium">
              <SecurityShield size={14} className="text-brand" />
              {ROLE_LABELS[role]}
            </p>
            <p className="mt-2 break-words text-[10px] leading-relaxed text-muted">
              {session.user
                ? session.user.email
                : "Charts and platform statistics. Sign in to use a private workspace."}
            </p>
            {session.user?.mock && (
              <p className="mt-2 text-[10px] text-amber-200">
                Development-only mock identity
              </p>
            )}
            {!session.user && (
              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="btn btn-primary mt-3 w-full !text-xs"
              >
                <LogIn size={13} />
                Sign in
              </Link>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-6">
            <p className="mb-3 px-3 text-[9px] font-semibold uppercase tracking-[0.2em] text-muted">
              Solutions · BMAT operating system
            </p>
            {session.user && (
              <nav
                aria-label="Solutions"
                className="solutions-grid mb-5 grid grid-cols-2 gap-1.5 px-1"
              >
                {SOLUTIONS.filter((item) => roleMayOpen(role, item.href)).map(
                  (item) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      onClick={(event) => navigate(event, item.href)}
                      className="solution-pill group flex items-center gap-1.5 rounded-lg border border-line bg-surface-2/40 px-2.5 py-2 text-[10px] font-semibold leading-4 text-muted transition-colors hover:border-brand/40 hover:bg-surface-2 hover:text-foreground"
                    >
                      {item.label}
                    </Link>
                  ),
                )}
              </nav>
            )}
            <p className="mb-3 px-3 text-[9px] font-semibold uppercase tracking-[0.2em] text-muted">
              {publicView ? "Public charts" : "Use cases"}
            </p>
            <nav aria-label="Dashboard" className="space-y-1">
              {modules.map((item) => {
                const selected = active?.id === item.id;
                const Icon = ICONS[item.id];
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    aria-current={selected ? "page" : undefined}
                    onClick={(event) => navigate(event, item.href)}
                    className="workspace-nav-link group flex min-w-0 items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-[12px] font-medium leading-5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                  >
                    <Icon
                      size={17}
                      strokeWidth={selected ? 2 : 1.6}
                      className="shrink-0"
                    />
                    <span className="min-w-0">{item.label}</span>
                    {selected && (
                      <ChevronRight size={13} className="ml-auto shrink-0" />
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="mx-5 mb-4 rounded-xl border border-line bg-background/50 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-medium text-foreground">
                Uganda station directory
              </p>
              <Radio size={14} className="text-muted" />
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-muted">
              {fm} FM · {tv} TV directory entries
              <br />
              {panelSize} FM stations listed, not a live-coverage claim.
            </p>
            <p className="mt-2.5 border-t border-line pt-2.5 text-[9px] leading-relaxed text-muted">
              Licensed capture sources must be connected separately.
            </p>
          </div>
          <div className="flex items-center gap-3 border-t border-line px-6 py-4">
            <span
              className="workspace-avatar flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
              aria-hidden
            >
              {session.user ? initials(session.user.name) : workspace.initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-medium">
                {session.user?.name ?? "Public guest workspace"}
              </p>
              <p className="mt-1 text-[9px] text-muted">
                {session.user
                  ? "HttpOnly session · server-enforced permissions"
                  : "No signed-in session"}
              </p>
            </div>
          </div>
          {session.user && (
            <div className="px-5 pb-4">
              <button
                type="button"
                className="btn btn-ghost w-full !text-xs"
                onClick={() => {
                  setAuthError("");
                  void signOut().catch((error) =>
                    setAuthError(
                      error instanceof Error
                        ? error.message
                        : "Sign-out failed.",
                    ),
                  );
                }}
              >
                <LogOut size={13} />
                Sign out
              </button>
              {authError && (
                <p role="alert" className="mt-2 text-[10px] text-red-200">
                  {authError}
                </p>
              )}
            </div>
          )}
        </aside>
        <div
          className="flex min-h-dvh min-w-0 flex-col"
          inert={mobileOpen || undefined}
        >
          <header className="sticky top-0 z-30 flex min-h-20 items-center justify-between gap-2 border-b border-line bg-surface/95 px-4 backdrop-blur-xl sm:gap-3 sm:px-7 lg:px-8">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <button
                type="button"
                ref={menuButtonRef}
                className="icon-btn lg:hidden"
                aria-label="Open navigation"
                aria-controls="workspace-navigation"
                aria-expanded={mobileOpen}
                onClick={() => setMobileOpen(true)}
              >
                <Menu size={20} />
              </button>
              <DashboardHeading />
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <span className="hidden items-center gap-1.5 text-[10px] text-muted xl:flex">
                <Globe2 size={13} />
                Kampala, UG<span className="text-line">/</span>EAT
              </span>
              <span
                aria-label={`Authenticated role: ${ROLE_LABELS[role]}`}
                className="workspace-badge max-w-[110px] truncate rounded-full border px-2.5 py-1 text-[9px] font-semibold sm:text-[10px]"
              >
                {workspace.badge}
              </span>
              <Link
                href="/"
                aria-label="Public site"
                title="Back to the public site"
                className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-background/60 px-2.5 text-[10px] font-semibold text-muted transition-colors hover:border-brand/40 hover:text-foreground"
              >
                <Globe2 size={13} />
                <span className="hidden sm:inline">Public site</span>
              </Link>
              {!publicView && (
                <>
                  <span className="hidden sm:block">
                    <OnboardingGuide compact />
                  </span>
                  {role === "artist" && <NotificationSettingsLauncher />}
                </>
              )}
              <span
                className="workspace-avatar hidden h-9 w-9 items-center justify-center rounded-full border border-line text-[11px] font-semibold sm:flex"
                title={session.user?.name ?? "Public guest"}
                aria-hidden
              >
                {session.user
                  ? initials(session.user.name)
                  : workspace.initials}
              </span>
            </div>
          </header>
          <main
            id="main-content"
            tabIndex={-1}
            className="min-w-0 flex-1 px-4 py-6 outline-none sm:px-7 lg:px-8 lg:py-8"
          >
            {deploymentNotice && (
              <p
                role="status"
                className="mb-5 rounded-xl border border-brand/20 bg-brand/5 px-4 py-3 text-xs leading-relaxed text-muted"
              >
                {deploymentNotice}
              </p>
            )}
            {serverScope === undefined ||
            serverScope === sessionScope(session.user) ? (
              children
            ) : (
              <p role="status" className="panel p-6 text-sm text-muted">
                Your account changed. Reopening its authorized workspace…
              </p>
            )}
          </main>
          <footer className="mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-line py-5 text-[10px] text-muted sm:mx-7 lg:mx-8">
            <span className="flex items-center gap-1.5">
              <Headphones size={12} />
              East Sound · East Africa Airplay Intelligence
            </span>
            <span className="flex max-w-full items-start gap-1.5">
              <FileCheck2 size={12} className="mt-0.5 shrink-0" />
              {workspace.description}
            </span>
            {publicView && (
              <span className="flex items-center gap-1.5">
                <ArrowUpRight size={11} />
                Public reference view · not a national monitoring claim
              </span>
            )}
          </footer>
        </div>
      </div>
    </ArtistNavigationProvider>
  );
}
