import "server-only";
import { after } from "next/server";
import { notificationProviderReadiness } from "@/lib/notification-transport";
import { processPostgresOutbox } from "@/lib/postgres/outbox";
import { processFileOutbox } from "@/lib/file-notification-queue";
import { postgresStorageEnabled } from "@/lib/postgres/pool";
import type { NotificationExecutionReadiness } from "@/lib/notification-execution-types";

/** Redacted operator readiness, never provider credentials, contacts, URLs or key material. */
export function notificationExecutionReadiness(): NotificationExecutionReadiness {
  const ready = notificationProviderReadiness();
  const workerEnabled = process.env.EAST_SOUND_WORKER_ENABLED === "1";
  const providers = {
    whatsapp: ready.whatsapp,
    email: ready.email,
    webhook: ready.webhook,
  };
  const anyProvider = Object.values(providers).some(Boolean);
  const scheduledRetriesConfigured =
    (process.env.CRON_SECRET?.length ?? 0) >= 32;
  return {
    liveEnabled: ready.liveEnabled,
    workerEnabled,
    providers,
    immediateDispatchReady: ready.liveEnabled && workerEnabled && anyProvider,
    scheduledRetriesConfigured,
    retrySchedule: "daily-safety-net",
    missing: [
      ...(!ready.liveEnabled ? ["Production message sending is disabled"] : []),
      ...(!workerEnabled ? ["Automatic dispatch worker is disabled"] : []),
      ...(!anyProvider
        ? ["No approved notification provider is configured"]
        : []),
      ...(!scheduledRetriesConfigured
        ? ["Scheduled retry authentication is not configured"]
        : []),
    ],
  };
}
export async function runNotificationBatch() {
  const ready = notificationExecutionReadiness();
  if (!ready.immediateDispatchReady)
    return {
      skipped: true,
      attempted: 0,
      accepted: 0,
      retry: 0,
      failed: 0,
      reason: "notification_configuration_incomplete",
    };
  return postgresStorageEnabled()
    ? processPostgresOutbox()
    : processFileOutbox();
}
/** Register ONLY after a real capture transaction commits. This is an immediate attempt, not the durable scheduler. */
export function dispatchAfterCaptureCommit() {
  if (!notificationExecutionReadiness().immediateDispatchReady) return;
  try {
    after(async () => {
      try {
        await runNotificationBatch();
      } catch {
        console.error(
          "Automatic alert dispatch unavailable; committed outbox jobs remain eligible for scheduled retry.",
        );
      }
    });
  } catch {
    // Non-request import/QA contexts and an unavailable after() runner must never turn a committed capture into a failed write.
    console.error(
      "Deferred alert execution unavailable; durable outbox jobs require the configured retry worker.",
    );
  }
}
