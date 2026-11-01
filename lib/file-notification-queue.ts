import "server-only";
import { randomUUID } from "node:crypto";
import { tokenHash, userDto } from "@/lib/auth-core";
import {
  NOTIFICATION_DOCUMENT,
  accountPreferences,
  deliveryPreferences,
} from "@/lib/account-notifications";
import {
  notificationCandidates,
  type NotificationEvent,
  type NotificationPreferences,
} from "@/lib/notifications";
import {
  documentsOfKind,
  findAccount,
  mutateAccountDocument,
} from "@/lib/security-store";
import { postgresStorageEnabled } from "@/lib/postgres/pool";
import { readTracks } from "@/lib/store";
import {
  notificationProviderReadiness,
  sendAlert,
  type TransportResult,
} from "@/lib/notification-transport";
const KIND = "notification-job";
export interface FileNotificationJob {
  id: string;
  event: NotificationEvent;
  targetId: string;
  targetHash: string;
  activationKey: string;
  status: "queued" | "processing" | "accepted" | "retry" | "failed";
  attempts: number;
  queuedAt: string;
  updatedAt: string;
  availableAt: string;
  lease?: string;
  leaseUntil?: string;
  code?: string;
}
const target = (
  config: NotificationPreferences,
  event: NotificationEvent,
  id: string,
) =>
  event.channel === "whatsapp"
    ? config.whatsapp.phone
    : event.channel === "email"
      ? config.email.address
      : (config.webhooks.find((h) => h.id === id && h.enabled)?.url ?? "");
/** File-mode crash reconciliation: persisted captures are the source of truth; stable job IDs make replay safe. */
export async function reconcileFileOutbox(): Promise<void> {
  if (postgresStorageEnabled()) return;
  const preferences = await documentsOfKind<{
    config: NotificationPreferences;
  }>(NOTIFICATION_DOCUMENT);
  if (!preferences.length) return;
  const { readCapturedSpins } = await import("@/lib/broadcast-store");
  const [history, catalogue] = await Promise.all([
    readCapturedSpins(),
    readTracks(),
  ]);
  for (const entry of preferences) {
    const account = await findAccount(entry.ownerId, true);
    if (
      !account ||
      account.disabled ||
      account.mock ||
      account.role !== "artist"
    )
      continue;
    const actor = userDto(account),
      config = entry.value.config;
    const events = notificationCandidates(
      history,
      catalogue.filter((t) => t.ownerId === actor.id),
      config,
      new Date(),
    );
    for (const event of events) {
      const sub = config.subscriptions.find(
          (s) => s.id === event.subscriptionId,
        )!,
        activationKey = sub.activatedAt ?? sub.createdAt;
      const targets =
        event.channel === "webhook"
          ? config.webhooks.filter((h) => h.enabled).map((h) => h.id)
          : [event.channel];
      for (const targetId of targets) {
        const targetHash = tokenHash(target(config, event, targetId)),
          id = tokenHash(
            JSON.stringify([event.id, targetId, targetHash, activationKey]),
          );
        await mutateAccountDocument<FileNotificationJob>(
          actor.id,
          KIND,
          id,
          (current) =>
            current ?? {
              id,
              event,
              targetId,
              targetHash,
              activationKey,
              status: "queued",
              attempts: 0,
              queuedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              availableAt: new Date().toISOString(),
            },
        );
      }
    }
  }
}
export async function fileOutbox(ownerId: string) {
  return (await documentsOfKind<FileNotificationJob>(KIND))
    .filter((d) => d.ownerId === ownerId)
    .map((d) => d.value)
    .sort((a, b) => b.queuedAt.localeCompare(a.queuedAt));
}
/** Provider I/O happens outside locks. A finishing worker must still own its unexpired lease. */
export async function processFileOutbox(deliver: typeof sendAlert = sendAlert) {
  const readiness = notificationProviderReadiness();
  if (!readiness.liveEnabled)
    throw new Error("Live notifications are disabled.");
  await reconcileFileOutbox();
  const all = await documentsOfKind<FileNotificationJob>(KIND),
    summary = { attempted: 0, accepted: 0, retry: 0, failed: 0, leaseLost: 0 };
  for (const entry of all) {
    if (summary.attempted >= 20) break;
    const channel = entry.value.event.channel;
    if (!readiness[channel]) continue;
    let lease: string | null = null;
    const job = await mutateAccountDocument<FileNotificationJob>(
      entry.ownerId,
      KIND,
      entry.key,
      (current) => {
        if (!current) throw new Error("Outbox job disappeared.");
        if (
          ["accepted", "failed"].includes(current.status) ||
          Date.parse(current.availableAt) > Date.now() ||
          (current.status === "processing" &&
            Date.parse(current.leaseUntil ?? "") > Date.now())
        )
          return current;
        if (current.attempts >= 3)
          return {
            ...current,
            status: "failed",
            code: "attempt_limit",
            lease: undefined,
            leaseUntil: undefined,
          };
        lease = randomUUID();
        return {
          ...current,
          status: "processing",
          attempts: current.attempts + 1,
          lease,
          leaseUntil: new Date(Date.now() + 120000).toISOString(),
          updatedAt: new Date().toISOString(),
        };
      },
    );
    if (!lease) continue;
    const account = await findAccount(entry.ownerId, true),
      publicConfig = await accountPreferences(entry.ownerId),
      sub = publicConfig.subscriptions.find(
        (s) => s.id === job.event.subscriptionId,
      );
    const allowed =
      account &&
      !account.disabled &&
      !account.mock &&
      account.role === "artist" &&
      sub?.enabled &&
      (sub.activatedAt ?? sub.createdAt) === job.activationKey &&
      sub.channels.includes(channel) &&
      tokenHash(target(publicConfig, job.event, job.targetId)) ===
        job.targetHash &&
      (await readTracks()).some(
        (t) => t.id === job.event.trackId && t.ownerId === entry.ownerId,
      );
    let result: TransportResult;
    if (!allowed)
      result = {
        accepted: false,
        retryable: false,
        code: "subscription_withdrawn",
      };
    else
      try {
        const config = await deliveryPreferences(entry.ownerId);
        result = config
          ? await deliver(
              job.event,
              config,
              channel === "webhook"
                ? config.webhooks.find((h) => h.id === job.targetId)
                : undefined,
            )
          : {
              accepted: false,
              retryable: false,
              code: "configuration_missing",
            };
      } catch {
        result = {
          accepted: false,
          retryable: true,
          code: "provider_unavailable",
        };
      }
    summary.attempted++;
    let finished = false;
    const next = await mutateAccountDocument<FileNotificationJob>(
      entry.ownerId,
      KIND,
      entry.key,
      (current) => {
        if (
          !current ||
          current.lease !== lease ||
          Date.parse(current.leaseUntil ?? "") <= Date.now()
        )
          return current!;
        finished = true;
        return {
          ...current,
          status: result.accepted
            ? "accepted"
            : result.retryable && current.attempts < 3
              ? "retry"
              : "failed",
          code: /^[a-z0-9_-]{1,64}$/.test(result.code)
            ? result.code
            : "provider_result",
          availableAt: new Date(
            Date.now() + 60000 * 2 ** (current.attempts - 1),
          ).toISOString(),
          updatedAt: new Date().toISOString(),
          lease: undefined,
          leaseUntil: undefined,
        };
      },
    );
    if (!finished) summary.leaseLost++;
    else if (next.status === "accepted") summary.accepted++;
    else if (next.status === "retry") summary.retry++;
    else summary.failed++;
  }
  return summary;
}
