import { SecurityAuditPanel } from "@/components/security-audit-panel";
import { CmoAudit } from "@/components/cmo-audit";
import { capturePollingAvailable } from "@/lib/runtime-storage";
import { buildDisputes, buildSplitSheets } from "@/lib/splits";
import { readPageWorkspace } from "@/lib/workspace-data";

/** One capture-backed server workspace for the current CMO view and legacy bookmarks. */
export async function CmoAuditWorkspace() {
  const data = await readPageWorkspace(["cmo"], "/dashboard/cmo");
  const disputes = buildDisputes(buildSplitSheets(data.catalogue));
  return (
    <>
      <CmoAudit
        catalogue={data.catalogue}
        disputes={disputes}
        initialEvents={data.history}
        now={data.now}
        canPoll={capturePollingAvailable()}
      />
      <SecurityAuditPanel />
    </>
  );
}
