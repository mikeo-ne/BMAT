"use client";

import Link from "next/link";
import { SOLUTIONS, TIERS } from "@/lib/site-content";
import { useLanguage } from "@/components/language-provider";
import { SiteLogo } from "@/components/site-nav";

export function SiteFooter() {
  const { t } = useLanguage();
  return (
    <footer className="mt-24 border-t border-slate-800/80 bg-slate-950">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 lg:grid-cols-[1.5fr_1fr_1fr_1fr] lg:px-8">
        <div>
          <SiteLogo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-400">
            {t("footer.tagline")}
          </p>
          <p className="mt-4 text-xs leading-relaxed text-slate-600">
            {t("footer.disclaimer")}
          </p>
        </div>

        <FooterColumn title={t("nav.solutions")}>
          {SOLUTIONS.map((solution) => (
            <Link
              key={solution.label}
              href={solution.href}
              className="block py-1.5 text-sm text-slate-400 transition-colors hover:text-emerald-300"
            >
              {solution.label}
            </Link>
          ))}
        </FooterColumn>

        <FooterColumn title={t("tiers.title")}>
          {TIERS.map((tier) => (
            <Link
              key={tier.id}
              href={tier.href}
              className="block py-1.5 text-sm text-slate-400 transition-colors hover:text-emerald-300"
            >
              {tier.label}
            </Link>
          ))}
        </FooterColumn>

        <FooterColumn title={t("footer.resources")}>
          <Link href="/charts" className="block py-1.5 text-sm text-slate-400 transition-colors hover:text-emerald-300">
            {t("charts.eyebrow")}
          </Link>
          <Link href="/about" className="block py-1.5 text-sm text-slate-400 transition-colors hover:text-emerald-300">
            {t("nav.about")}
          </Link>
          <Link href="/blog" className="block py-1.5 text-sm text-slate-400 transition-colors hover:text-emerald-300">
            {t("nav.insights")}
          </Link>
          <Link href="/login" className="block py-1.5 text-sm text-slate-400 transition-colors hover:text-emerald-300">
            {t("nav.accessPortal")}
          </Link>
        </FooterColumn>
      </div>
      <div className="border-t border-slate-800/60 py-5">
        <p className="mx-auto max-w-7xl px-4 text-center text-xs text-slate-500 lg:px-8">
          {t("footer.rights")}
        </p>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
        {title}
      </p>
      <div className="mt-3">{children}</div>
    </div>
  );
}
