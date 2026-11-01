import { capturePollingAvailable } from "@/lib/runtime-storage";
import type { Metadata } from "next";

import { CmoAudit } from "@/components/cmo-audit";
import { buildDisputes, buildSplitSheets } from "@/lib/splits";
import { readWorkspaceData } from "@/lib/workspace-data";

export const metadata: Metadata = {
  title: "CMO & Regulatory Audit",
  description:
    "Captured-play allocations with station, region, period and local rights-holder filters, illustrative daypart estimates and logging-sheet exports for UPRS review.",
};

export const dynamic = "force-dynamic";

export default async function CmoAuditPage() {
  const data = await readWorkspaceData();
  const disputes = buildDisputes(buildSplitSheets(data.catalogue));
  return (
    <CmoAudit
      catalogue={data.catalogue}
      disputes={disputes}
      initialEvents={data.history}
      now={data.now}
      canPoll={capturePollingAvailable()}
    />
  );
}
