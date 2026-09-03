import type { Metadata } from "next";

import { NationalCharts } from "@/components/national-charts";
import { buildWeeklyChart } from "@/lib/charts";
import { readTracks } from "@/lib/store";

export const metadata: Metadata = {
  title: "National Charts",
  description:
    "The weekly Uganda national airplay chart: podium, movement, 14-day curves and regional leaders, ranked by verified spins.",
};

export const dynamic = "force-dynamic";

export default async function NationalChartsPage() {
  const catalogue = await readTracks();
  const chart = buildWeeklyChart(catalogue);

  return <NationalCharts chart={chart} />;
}
