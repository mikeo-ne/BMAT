import { integrationAuth } from "@/lib/integration-auth";
import { referenceStorageOnly } from "@/lib/runtime-storage";
import { cleanupMasterUploads } from "@/lib/cloud-masters";
import { runNotificationBatch } from "@/lib/notification-runtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
/** Vercel Cron/external scheduler only. CRON_SECRET is server-side, independent of integration and session tokens. */
export async function GET(request: Request) {
  const denied = integrationAuth(request, "CRON_SECRET");
  if (denied) return denied;
  if (referenceStorageOnly())
    return Response.json(
      { error: "Maintenance requires durable configured storage." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  try {
    const uploads = await cleanupMasterUploads();
    const notifications = await runNotificationBatch();
    return Response.json(
      {
        uploads,
        notifications,
        notice:
          "Provider acceptance is not a delivery/read receipt. Daily scheduling is a retry safety net, not an instant retry guarantee.",
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        error:
          "Maintenance is temporarily unavailable. Pending work was not reset.",
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
