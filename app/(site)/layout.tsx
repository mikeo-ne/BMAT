import type { Metadata } from "next";
import { LanguageProvider } from "@/components/language-provider";
import { SiteFooter } from "@/components/site-footer";
import { SiteMobileNav } from "@/components/site-mobile-nav";
import { SiteNav } from "@/components/site-nav";

export const metadata: Metadata = {
  title: {
    default: "East Sound — East Africa Airplay Analytics",
    template: "%s · East Sound",
  },
  description:
    "East Sound measures music airplay across Uganda's FM panel — national Top 100 charts, UPRS cue sheets, master delivery and ad-spot auditing for labels, stations and collecting societies.",
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <SiteNav />
      <SiteMobileNav />
      <main className="mx-auto w-full max-w-7xl flex-1 pb-28 lg:pb-0">
        {children}
      </main>
      <SiteFooter />
    </LanguageProvider>
  );
}
