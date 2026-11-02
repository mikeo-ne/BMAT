import { notificationExecutionReadiness } from "@/lib/notification-runtime";
import { guardedApi } from "@/lib/auth-core";
import { fileOutbox } from "@/lib/file-notification-queue";
import {
  postgresPool,
  postgresStorageEnabled,
  postgresTenant,
} from "@/lib/postgres/pool";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return guardedApi(request, ["artist"], false, async (actor) => {
    if (!postgresStorageEnabled())
      return Response.json({
        execution: notificationExecutionReadiness(),
        jobs: (await fileOutbox(actor.id)).slice(0, 100).map((j) => ({
          id: j.id,
          channel: j.event.channel,
          message: j.event.message,
          status: j.status,
          attempts: j.attempts,
          queuedAt: j.queuedAt,
          code: j.code,
        })),
        notice:
          "Queued is not sent. Accepted is provider acceptance, not a delivery/read receipt.",
      });
    const result = await postgresPool().query(
      `SELECT o.id,o.channel,o.status,o.attempts,o.created_at AS "queuedAt",o.error_code AS code,o.payload->>'title' AS title
    FROM east_sound.notification_outbox o JOIN east_sound.notification_rules r ON r.tenant_id=o.tenant_id AND r.id=o.rule_id
    JOIN east_sound.tracks t ON t.tenant_id=o.tenant_id AND t.id=o.track_id
    WHERE o.tenant_id=$1 AND r.user_id=$2 AND t.metadata->>'ownerId'=$2::text ORDER BY o.created_at DESC LIMIT 100`,
      [postgresTenant(), actor.id],
    );
    return Response.json({
      execution: notificationExecutionReadiness(),
      jobs: result.rows.map((j) => ({
        ...j,
        status: j.status === "sent" ? "accepted" : j.status,
      })),
      notice: "Provider acceptance is not a delivery/read receipt.",
    });
  });
}
