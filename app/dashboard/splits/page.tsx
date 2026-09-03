import type { Metadata } from "next";

import { SplitManager } from "@/components/split-manager";
import { buildDisputes, buildSplitSheets } from "@/lib/splits";
import { readTracks } from "@/lib/store";

export const metadata: Metadata = {
  title: "Rights & Split-Sheet Management",
  description:
    "Ownership percentages per recording, collaboration sign-off status, and the CMO dispute queue for overlapping ISRC registrations.",
};

export const dynamic = "force-dynamic";

export default async function SplitsPage() {
  const catalogue = await readTracks();
  const sheets = buildSplitSheets(catalogue);
  const disputes = buildDisputes(sheets);

  return <SplitManager sheets={sheets} disputes={disputes} />;
}
