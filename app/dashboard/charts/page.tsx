import type { Metadata } from "next";

import { NationalCharts } from "@/components/national-charts";
import { buildWeeklyChart } from "@/lib/charts";
import { readWorkspaceData } from "@/lib/workspace-data";
import { catalogueWithCapturedStats } from "@/lib/captured-airplay";

export const metadata: Metadata = {
  title: "National Charts",
  description:
    "Uganda connected-panel airplay rankings: captured FM plays, rolling seven-day comparisons and regional leaders, without inferred national coverage or historical peaks.",
};

export const dynamic = "force-dynamic";

export default async function NationalChartsPage() {
  const data = await readWorkspaceData();
  const catalogue = catalogueWithCapturedStats(
    data.catalogue,
    data.history.filter((event) => event.medium === "FM"),
    new Date(data.now),
  );
  const chart = buildWeeklyChart(catalogue, new Date(data.now));

  return <NationalCharts chart={chart} />;
}
