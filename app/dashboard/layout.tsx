import Link from "next/link";

import { DashboardHeading } from "@/components/dashboard-heading";
import { PANEL_SIZE } from "@/lib/catalog";
import { MONITORED_STATIONS, monitoredCount } from "@/lib/monitoring";

const NAV = [
  {
    href: "/dashboard/artist",
    label: "Artist & Label Portal",
    hint: "Deliver masters, track spins",
    status: "live" as const,
  },
  {
    href: "/dashboard/monitoring",
    label: "Live Station Monitor",
    hint: "Fingerprint the broadcast panel",
    status: "live" as const,
  },
  {
    href: "/dashboard/cmo",
    label: "CMO & Regulatory Audit",
    hint: "UPRS ledger & royalty splits",
    status: "live" as const,
  },
  { href: "/dashboard/charts", label: "National Charts", hint: "Weekly Top 100", status: "soon" as const },
  { href: "/dashboard/royalties", label: "Royalties", hint: "Distribution & payouts", status: "soon" as const },
];

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div className="flex min-h-screen w-full flex-col lg:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-line bg-surface lg:w-64 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-sm font-bold text-brand-ink">
            BM
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">BMAT</div>
            <div className="text-[11px] text-muted">Broadcast Music Analytics</div>
          </div>
        </div>

        <nav aria-label="Dashboard" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:pb-0">
          {NAV.map((item) =>
            item.status === "live" ? (
              <Link
                key={item.href}
                href={item.href}
                className="flex min-w-max flex-col rounded-lg px-3 py-2 transition-colors hover:bg-surface-2 lg:min-w-0"
              >
                <span className="text-sm font-medium text-foreground">{item.label}</span>
                <span className="text-[11px] text-muted">{item.hint}</span>
              </Link>
            ) : (
              <span
                key={item.href}
                aria-disabled="true"
                title="Not part of this milestone"
                className="flex min-w-max flex-col rounded-lg px-3 py-2 text-muted/60 lg:min-w-0"
              >
                <span className="flex items-center gap-2 text-sm">
                  {item.label}
                  <span className="rounded border border-line px-1 text-[9px] uppercase tracking-wider">
                    soon
                  </span>
                </span>
                <span className="text-[11px]">{item.hint}</span>
              </span>
            ),
          )}
        </nav>

        <div className="mt-auto hidden px-5 py-5 lg:block">
          <div className="rounded-lg border border-line bg-surface-2 p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse-dot" />
              Panel online
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
              {MONITORED_STATIONS.length} feeds monitored ({monitoredCount("FM")} FM,{" "}
              {monitoredCount("TV")} TV) · {PANEL_SIZE} stations in the spin panel.
            </p>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-line bg-background/85 px-5 py-3 backdrop-blur lg:px-8">
          <DashboardHeading />
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted sm:inline">Nyege Nyege Tapes</span>
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-brand"
              title="Signed in as Nyege Nyege Tapes"
            >
              NN
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-5 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
