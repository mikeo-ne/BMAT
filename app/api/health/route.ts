import {
  referenceStorageOnly,
  masterUploadsAvailable,
  capturePollingAvailable,
} from "@/lib/runtime-storage";
import {
  postgresStorageEnabled,
  postgresPool,
  postgresTenant,
} from "@/lib/postgres/pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Safe deployment/readiness metadata: no recipients, keys, database URLs or tenant identifiers. */
export async function GET() {
  try {
    const reference = referenceStorageOnly(),
      postgres = postgresStorageEnabled();
    if (postgres) {
      const check = await postgresPool().query(
        "SELECT 1 FROM east_sound.tenants WHERE id=$1 LIMIT 1",
        [postgresTenant()],
      );
      if (!check.rowCount) throw new Error("workspace_not_initialized");
    }
    const commit = process.env.VERCEL_GIT_COMMIT_SHA;
    return Response.json(
      {
        status: "ok",
        storage: reference ? "reference" : postgres ? "postgres" : "file",
        masterDelivery: masterUploadsAvailable(),
        capturePolling: capturePollingAvailable(),
        commit: commit && /^[a-f\d]{40}$/i.test(commit) ? commit : null,
        notice: reference
          ? "Read-only public references; durable capture/master integrations are not connected."
          : "Health does not verify capture licences, provider approval or delivered/read receipts.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        status: "unavailable",
        error:
          "Configured storage is unavailable or the workspace is not initialized. No fallback or reset was performed.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
