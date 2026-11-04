"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { LANGS, useI18n, type Lang } from "@/lib/i18n";
import { ROLE_META, ROLES } from "@/lib/roles";
import { SOLUTIONS } from "@/lib/data/public";
import { loadPublicStats } from "@/lib/db/shared";
import { cx } from "@/lib/safe";
import { Logo } from "./Logo";

function Dropdown({ label, items }: { label: string; items: { key: string; title: string; desc: string; href: string }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => {
        if (timer.current) window.clearTimeout(timer.current);
        setOpen(true);
      }}
      onMouseLeave={() => {
        timer.current = window.setTimeout(() => setOpen(false), 120);
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
        className={cx("flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition", open ? "text-emerald-300" : "text-slate-300 hover:text-white")}
      >
        {label}
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className={cx("transition", open && "rotate-180")}>
          <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 w-80 animate-fade-in pt-2">
          <div className="glass overflow-hidden p-2 shadow-2xl shadow-black/50">
            {(items || []).map((it) => (
              <Link
                key={it.key}
                href={it.href}
                onClick={() => setOpen(false)}
                className="block rounded-xl px-3 py-2.5 transition hover:bg-emerald-400/10"
              >
                <span className="block text-sm font-semibold text-white">{it.title}</span>
                <span className="block text-xs text-slate-400">{it.desc}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function LiveBadge() {
  const { t } = useI18n();
  const [stats, setStats] = useState<{ streams: number; venues: number } | null>(null);
  useEffect(() => {
    loadPublicStats().then(setStats).catch(() => setStats(null)); // live mode only; demo keeps the default copy
  }, []);
  const text = stats ? t("liveTpl").replace("{s}", String(stats.streams)).replace("{v}", String(stats.venues)) : t("live");
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-emerald-400" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      </span>
      <span className="whitespace-nowrap">{text}</span>
    </span>
  );
}

function LanguageSelect() {
  const { lang, setLang } = useI18n();
  return (
    <div role="group" aria-label="Language" className="flex rounded-lg border border-slate-800 p-0.5">
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          title={l.name}
          aria-pressed={lang === l.code}
          onClick={() => setLang(l.code as Lang)}
          className={cx(
            "rounded-md px-2 py-1 text-[11px] font-semibold transition",
            lang === l.code ? "bg-emerald-400 text-slate-950" : "text-slate-400 hover:text-white",
          )}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

export function Header() {
  const { t } = useI18n();
  const { session, openAuth } = useAuth();
  const [mobile, setMobile] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const solutionItems = SOLUTIONS.map((s) => ({ key: s.id, title: s.name, desc: s.desc, href: `/#solution-${s.id}` }));
  const useCaseItems = ROLES.map((r) => ({ key: r, title: ROLE_META[r].useCase, desc: ROLE_META[r].blurb, href: `/#use-cases` }));

  return (
    <header
      className={cx(
        "sticky top-0 z-40 border-b transition-colors",
        scrolled ? "border-slate-800 bg-slate-950/85 backdrop-blur-xl" : "border-transparent bg-slate-950/40 backdrop-blur",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Logo />
        <div className="hidden xl:block">
          <LiveBadge />
        </div>

        <nav className="ml-auto hidden items-center lg:flex" aria-label="Primary">
          <Dropdown label={t("solutions")} items={solutionItems} />
          <Dropdown label={t("useCases")} items={useCaseItems} />
          <Link href="/blog" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition hover:text-white">
            {t("blog")}
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-2">
          <div className="hidden sm:block">
            <LanguageSelect />
          </div>
          {session ? (
            <Link href={ROLE_META[session.role].path} className="btn-primary !py-2">
              {t("dashboard")}
            </Link>
          ) : (
            <button type="button" className="btn-primary !py-2" onClick={() => openAuth("signin")}>
              {t("signIn")}
            </button>
          )}
          <button
            type="button"
            className="rounded-lg p-2 text-slate-300 lg:hidden"
            aria-label="Menu"
            aria-expanded={mobile}
            onClick={() => setMobile((m) => !m)}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
              <path d={mobile ? "M6 6l12 12M18 6 6 18" : "M4 7h16M4 12h16M4 17h16"} stroke="currentColor" strokeWidth="1.8" fill="none" />
            </svg>
          </button>
        </div>
      </div>

      {mobile && (
        <div className="border-t border-slate-800 bg-slate-950 px-4 pb-6 pt-4 lg:hidden">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <LiveBadge />
            <LanguageSelect />
          </div>
          <p className="label">{t("solutions")}</p>
          <div className="mb-4 grid grid-cols-2 gap-1">
            {solutionItems.map((s) => (
              <Link key={s.key} href={s.href} onClick={() => setMobile(false)} className="rounded-lg px-2 py-2 text-sm text-slate-300 hover:bg-slate-900">
                {s.title}
              </Link>
            ))}
          </div>
          <p className="label">{t("useCases")}</p>
          <div className="mb-4 grid grid-cols-2 gap-1">
            {useCaseItems.map((s) => (
              <Link key={s.key} href={s.href} onClick={() => setMobile(false)} className="rounded-lg px-2 py-2 text-sm text-slate-300 hover:bg-slate-900">
                {s.title}
              </Link>
            ))}
          </div>
          <Link href="/blog" onClick={() => setMobile(false)} className="text-sm font-medium text-emerald-300">
            {t("blog")} →
          </Link>
        </div>
      )}
    </header>
  );
}
