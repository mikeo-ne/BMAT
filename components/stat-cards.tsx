import { formatCompact, formatNumber } from "@/lib/format";
import { FM_STATIONS } from "@/lib/regions";
import type { CatalogSummary } from "@/lib/types";

interface StatCardsProps {
  summary: CatalogSummary;
}

export function StatCards({ summary }: StatCardsProps) {
  const lead = summary.byRegion.Central;
  const cards = [
    {
      label: "Total stream spins",
      value: formatNumber(summary.totalSpins),
      hint: `across ${FM_STATIONS.length} Uganda FM stations`,
      accent: "var(--brand)",
    },
    {
      label: "Tracks in catalogue",
      value: formatNumber(summary.totalTracks),
      hint: `${summary.totalTracks === 0 ? "—" : formatNumber(Math.round(summary.averageSpinsPerTrack))} avg spins / track`,
      accent: "var(--accent)",
    },
    {
      label: "Stations reporting",
      value: `${summary.reportingStations}`,
      hint: "region × track pairs in the last 14 days",
      accent: "var(--region-western)",
    },
    {
      label: "Estimated reach",
      value: formatCompact(summary.totalAudience),
      hint: `led by ${lead?.spins ? "Central" : "—"} (${formatCompact(lead?.spins ?? 0)} spins)`,
      accent: "var(--region-northern)",
    },
  ];

  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="panel p-4">
          <dt className="text-xs text-muted">{card.label}</dt>
          <dd className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tracking-tight tabular-nums">{card.value}</span>
            <span className="h-3 w-1 rounded-full" style={{ background: card.accent }} aria-hidden />
          </dd>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">{card.hint}</p>
        </div>
      ))}
    </dl>
  );
}
