import type { Metadata } from "next";
import { ReportalCueSheet } from "@/components/reportal-cue-sheet";
import { readPageWorkspace } from "@/lib/workspace-data";

export const metadata: Metadata = {
  title: "Reportal · UPRS Cue Sheets",
  description:
    "Generate UPRS broadcast cue sheets for your station from captured playout logs and export official XLSX and PDF compliance documents.",
};

export const dynamic = "force-dynamic";

export default async function ReportalPage() {
  const data = await readPageWorkspace(["broadcaster"], "/dashboard/reportal");
  return (
    <ReportalCueSheet
      events={data.history}
      now={data.now}
      licensee={data.actor.name}
    />
  );
}
