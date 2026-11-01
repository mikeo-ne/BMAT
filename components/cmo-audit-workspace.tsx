import { CmoAudit } from "@/components/cmo-audit";
import { capturePollingAvailable } from "@/lib/runtime-storage";
import { buildDisputes, buildSplitSheets } from "@/lib/splits";
import { readWorkspaceData } from "@/lib/workspace-data";

/** One capture-backed server workspace for the current CMO view and legacy bookmarks. */
export async function CmoAuditWorkspace() {
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
