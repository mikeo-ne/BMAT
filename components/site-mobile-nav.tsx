"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  ChevronRight,
  Disc3,
  Home,
  LogIn,
  Menu,
  MessageSquare,
  Upload,
  X,
} from "lucide-react";
import { SiteLogo } from "@/components/site-nav";
import { SOLUTIONS, TIERS } from "@/lib/site-content";
import { useLanguage } from "@/components/language-provider";

const BOTTOM_DESTINATIONS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/dashboard/artist/catalogue", label: "My Catalogue", icon: Disc3 },
  { href: "/dashboard/artist/delivery", label: "Deliver Master", icon: Upload },
  {
    href: "/dashboard/alerts",
    label: "WhatsApp Alerts",
    icon: MessageSquare,
  },
] as const;

export function SiteMobileNav() {
  const { t, lang, setLang, languages } = useLanguage();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      {/* Mobile header: brand + live status + hamburger */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between px-4 lg:hidden">
        <Link href="/" className="shrink-0 rounded-lg">
          <SiteLogo />
        </Link>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            32 Stations
          </span>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={t("nav.openMenu")}
            className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/80 text-slate-200 transition-colors hover:border-emerald-400/40"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Slide-over drawer */}
      <div
        className={`fixed inset-0 z-50 lg:hidden ${open ? "" : "pointer-events-none"}`}
        aria-hidden={!open}
      >
        <div
          className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300 ${
            open ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setOpen(false)}
        />
        <div
          className={`absolute left-0 top-0 flex h-full w-[88vw] max-w-sm flex-col border-r border-slate-800 bg-slate-950 shadow-2xl transition-transform duration-300 ease-out ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
          role="dialog"
          aria-modal="true"
          aria-label={t("nav.closeMenu")}
        >
          <div className="flex items-center justify-between px-4 py-4">
            <SiteLogo />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("nav.closeMenu")}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-800 text-slate-300 transition-colors hover:bg-slate-900"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="px-4 pb-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              32 Stations Active · Kampala Panel
            </span>
            <button
              type="button"
              onClick={() => {
                const current = languages.findIndex((o) => o.code === lang);
                setLang(languages[(current + 1) % languages.length].code);
              }}
              className="mt-3 flex h-11 w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 px-3 text-sm text-slate-200"
            >
              <span className="font-semibold">{t("nav.language")}</span>
              <span className="font-bold uppercase">{lang.toUpperCase()}</span>
            </button>
          </div>

          <nav
            className="flex-1 overflow-y-auto px-4 py-2"
            aria-label="Mobile"
            onClick={(event) => {
              // Any in-drawer link closes the slide-over on navigation.
              const anchor = (event.target as HTMLElement).closest("a");
              if (anchor) setOpen(false);
            }}
          >
            <SectionLabel>{t("nav.useCases")}</SectionLabel>
            {TIERS.map((tier) => (
              <Link
                key={tier.id}
                href={tier.href}
                className="flex items-center justify-between rounded-xl px-3 py-3 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-900"
              >
                {tier.label}
                <ChevronRight className="h-4 w-4 text-slate-500" />
              </Link>
            ))}

            <SectionLabel className="mt-4">{t("nav.solutions")}</SectionLabel>
            {SOLUTIONS.map((solution) => (
              <Link
                key={solution.label}
                href={solution.href}
                className="flex items-center justify-between rounded-xl px-3 py-3 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-900"
              >
                {solution.label}
                <ChevronRight className="h-4 w-4 text-slate-500" />
              </Link>
            ))}

            <SectionLabel className="mt-4">{t("nav.about")}</SectionLabel>
            <Link
              href="/about"
              className="flex items-center justify-between rounded-xl px-3 py-3 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-900"
            >
              {t("nav.about")}
              <ChevronRight className="h-4 w-4 text-slate-500" />
            </Link>
            <Link
              href="/blog"
              className="flex items-center justify-between rounded-xl px-3 py-3 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-900"
            >
              {t("nav.insights")}
              <ChevronRight className="h-4 w-4 text-slate-500" />
            </Link>
            <Link
              href="/charts"
              className="flex items-center justify-between rounded-xl px-3 py-3 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-900"
            >
              {t("charts.eyebrow")}
              <ChevronRight className="h-4 w-4 text-slate-500" />
            </Link>
          </nav>

          <div className="border-t border-slate-800 p-4">
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 text-sm font-bold text-slate-950"
            >
              <LogIn className="h-5 w-5" />
              {t("nav.accessPortal")}
            </Link>
          </div>
        </div>
      </div>

      {/* Fixed bottom navigation */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800 bg-slate-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
        aria-label="Mobile primary"
      >
        <div className="mx-auto flex max-w-md items-stretch justify-around px-2">
          {BOTTOM_DESTINATIONS.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/" ? pathname === "/" : pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-1 flex-col items-center justify-center gap-1 py-2 transition-colors ${
                  active ? "text-emerald-400" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-semibold leading-none">
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

function SectionLabel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 ${className}`}
    >
      {children}
    </p>
  );
}
