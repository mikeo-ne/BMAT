"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LogIn, LogOut } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { authFetch, evictPrivateBrowserState } from "@/lib/auth-client";
import { initials } from "@/lib/format";
import { ROLE_HOME } from "@/lib/auth-types";
import { SOLUTIONS, USE_CASES } from "@/lib/site-content";
import { useLanguage } from "@/components/language-provider";

function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect x="1" y="13" width="3" height="6" rx="1.5" fill="#34d399" />
      <rect x="6.5" y="9" width="3" height="14" rx="1.5" fill="#34d399" />
      <rect x="12" y="4" width="3" height="24" rx="1.5" fill="#34d399" />
      <rect x="17.5" y="9" width="3" height="14" rx="1.5" fill="#34d399" />
      <rect x="23" y="13" width="3" height="6" rx="1.5" fill="#34d399" />
    </svg>
  );
}

export function SiteLogo({
  className = "",
  showMark = true,
}: {
  className?: string;
  showMark?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {showMark && <LogoMark className="h-7 w-7" />}
      <span className="text-lg font-extrabold tracking-tight text-white">
        EAST SOUND
      </span>
    </span>
  );
}

function HoverMenu({
  label,
  children,
  ariaLabel,
}: {
  label: string;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        aria-label={ariaLabel}
        className="flex h-10 items-center gap-1 rounded-lg px-3 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800/70 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
      >
        {label}
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </button>
      <div className="pointer-events-none absolute left-0 top-full z-50 w-[min(22rem,85vw)] pt-2 opacity-0 -translate-y-1 transition-all duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-focus-within:translate-y-0">
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/95 p-2 shadow-2xl shadow-black/60 backdrop-blur-xl">
          {children}
        </div>
      </div>
    </div>
  );
}

export function SiteNav() {
  const { t, lang, setLang, languages } = useLanguage();
  const { session, update } = useAuth();
  const pathname = usePathname();
  const user = session.user;

  const handleSignOut = async () => {
    try {
      await authFetch("/api/auth/logout", { method: "POST" });
      evictPrivateBrowserState(user?.id ?? "");
      await update({ user: null, csrfToken: null, expiresAt: null });
    } catch {
      /* network failure: the session simply stays; retry is safe */
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl">
      <nav
        className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 lg:px-8"
        aria-label="Primary"
      >
        <Link
          href="/"
          className="shrink-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
        >
          <SiteLogo />
        </Link>

        <div className="hidden items-center gap-1 lg:flex">
          <HoverMenu label={t("nav.useCases")} ariaLabel={t("nav.useCases")}>
            {USE_CASES.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="block rounded-xl px-3 py-2.5 transition-colors hover:bg-slate-800/80"
              >
                <span className="block text-sm font-semibold text-white">
                  {item.label}
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-slate-400">
                  {item.blurb}
                </span>
              </Link>
            ))}
          </HoverMenu>

          <HoverMenu label={t("nav.solutions")} ariaLabel={t("nav.solutions")}>
            {SOLUTIONS.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="block rounded-xl px-3 py-2.5 transition-colors hover:bg-slate-800/80"
              >
                <span className="block text-sm font-semibold text-white">
                  {item.label}
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-slate-400">
                  {item.blurb}
                </span>
              </Link>
            ))}
          </HoverMenu>

          <NavLink href="/about" active={pathname === "/about"}>
            {t("nav.about")}
          </NavLink>
          <NavLink href="/blog" active={pathname.startsWith("/blog")}>
            {t("nav.insights")}
          </NavLink>
        </div>

        <div className="flex items-center gap-2">
          {/* Language selector (cycles EN → SW → LU) */}
          <button
            type="button"
            onClick={() => {
              const current = languages.findIndex((o) => o.code === lang);
              setLang(languages[(current + 1) % languages.length].code);
            }}
            className="hidden h-10 items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/60 px-3 text-xs font-bold uppercase tracking-wider text-slate-300 transition-colors hover:border-emerald-400/40 hover:text-white lg:flex"
            aria-label={t("nav.language")}
          >
            {lang.toUpperCase()}
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </button>

          {user ? (
            <div className="hidden items-center gap-2 lg:flex">
              <Link
                href={ROLE_HOME[user.role]}
                className="flex h-10 items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 pl-2.5 pr-3 transition-colors hover:border-emerald-400/40"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-300">
                  {initials(user.name)}
                </span>
                <span className="max-w-[7rem] truncate text-sm font-medium text-slate-200">
                  {user.name.split(" ")[0]}
                </span>
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm text-slate-400 transition-colors hover:bg-slate-800/70 hover:text-white"
              >
                <LogOut className="h-4 w-4" />
                {t("nav.signOut")}
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="hidden h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800/70 hover:text-white lg:flex"
            >
              <LogIn className="h-4 w-4" />
              {t("nav.signIn")}
            </Link>
          )}

          <Link
            href={user ? ROLE_HOME[user.role] : "/login"}
            className="flex h-11 items-center rounded-xl bg-emerald-400 px-4 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/25 transition-all hover:bg-emerald-300 hover:shadow-emerald-500/40"
          >
            {t("nav.accessPortal")}
          </Link>
        </div>
      </nav>
    </header>
  );
}

function NavLink({
  href,
  children,
  active,
}: {
  href: string;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex h-10 items-center rounded-lg px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 ${
        active
          ? "text-emerald-300"
          : "text-slate-300 hover:bg-slate-800/70 hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
}
