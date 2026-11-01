import type { Metadata } from "next";
import { PublicStatistics } from "@/components/public-statistics";
import { publicCaptureRecords } from "@/lib/public-statistics";
import { readWorkspaceData } from "@/lib/workspace-data";

export const metadata: Metadata = {
  title: "Public Airplay Statistics",
  description:
    "Read-only aggregate statistics from captured Uganda panel records, with regional filters and no inferred national coverage or audience reach.",
};
export const dynamic = "force-dynamic";
export default async function PublicStatisticsPage() {
  const data = await readWorkspaceData();
  // Only the fields needed for public aggregation cross the client boundary; no evidence, rights or recipient data.
  const records = publicCaptureRecords(data.history, data.now);
  return <PublicStatistics records={records} now={data.now} />;
}
