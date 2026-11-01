import "server-only";
import type { SessionUser } from "@/lib/auth-types";
import { HttpError } from "@/lib/auth-core";
import {
  defaultNotificationPreferences,
  parseNotificationPreferences,
  subscriptionIssues,
  type NotificationPreferences,
} from "@/lib/notifications";
import {
  audit,
  findAccount,
  readAccountDocument,
  writeAccountDocument,
} from "@/lib/security-store";
import { openSecret, sealSecret } from "@/lib/secret-vault";
import { readTracks } from "@/lib/store";
import { postgresStorageEnabled, postgresTenant } from "@/lib/postgres/pool";
import { syncPostgresRules } from "@/lib/postgres/rules";
export const NOTIFICATION_DOCUMENT = "notification-preferences";
interface StoredPreferences {
  version: 1;
  config: NotificationPreferences;
  secrets: Record<string, string>;
}
function view(stored: StoredPreferences): NotificationPreferences {
  return {
    ...stored.config,
    webhooks: stored.config.webhooks.map((h) => ({
      ...h,
      secret: undefined,
      secretConfigured:
        Object.hasOwn(stored.secrets, h.id) && !!stored.secrets[h.id],
    })),
  };
}
export async function accountPreferences(
  ownerId: string,
): Promise<NotificationPreferences> {
  const stored = await readAccountDocument<StoredPreferences>(
    ownerId,
    NOTIFICATION_DOCUMENT,
  );
  return stored ? view(stored) : defaultNotificationPreferences();
}
/** Internal worker-only projection. Never serialize this decrypted value to a browser or audit log. */
export async function deliveryPreferences(
  ownerId: string,
): Promise<NotificationPreferences | null> {
  const stored = await readAccountDocument<StoredPreferences>(
    ownerId,
    NOTIFICATION_DOCUMENT,
  );
  if (!stored) return null;
  return {
    ...stored.config,
    webhooks: await Promise.all(
      stored.config.webhooks.map(async (h) => ({
        ...h,
        ...(stored.secrets[h.id]
          ? { secret: await openSecret(stored.secrets[h.id]) }
          : {}),
      })),
    ),
  };
}
export async function saveAccountPreferences(actor: SessionUser, raw: unknown) {
  const config = parseNotificationPreferences(raw);
  if (!config)
    throw new HttpError(
      422,
      "Invalid notification preferences. No changes were saved.",
    );
  const catalogue = (await readTracks()).filter((t) => t.ownerId === actor.id);
  if (
    config.subscriptions.some(
      (sub) => subscriptionIssues(sub, catalogue).length,
    )
  )
    throw new HttpError(
      422,
      "Subscriptions may watch only recordings owned by this account.",
    );
  const previous = await readAccountDocument<StoredPreferences>(
      actor.id,
      NOTIFICATION_DOCUMENT,
    ),
    secrets: Record<string, string> = Object.create(null);
  const clean: NotificationPreferences = {
    version: 1,
    whatsapp: {
      phone: config.whatsapp.phone,
      consent: config.whatsapp.consent,
      template: config.whatsapp.template,
    },
    email: {
      address: config.email.address,
      consent: config.email.consent,
      daily: config.email.daily,
      weekly: config.email.weekly,
      hour: config.email.hour,
      weeklyDay: config.email.weeklyDay,
    },
    subscriptions: config.subscriptions.map((s) => ({ ...s })),
    webhooks: [],
  };
  const policyChanged =
    previous &&
    JSON.stringify([
      clean.whatsapp,
      clean.email,
      config.webhooks.map((h) => [h.id, h.url, h.enabled]),
    ]) !==
      JSON.stringify([
        previous.config.whatsapp,
        previous.config.email,
        previous.config.webhooks.map((h) => [h.id, h.url, h.enabled]),
      ]);
  clean.subscriptions = clean.subscriptions.map((sub) => {
    const old = previous?.config.subscriptions.find((s) => s.id === sub.id);
    const changed =
      !old ||
      JSON.stringify([
        sub.trackId,
        sub.stationId,
        sub.region,
        sub.channels,
        sub.triggers,
        sub.milestones,
      ]) !==
        JSON.stringify([
          old.trackId,
          old.stationId,
          old.region,
          old.channels,
          old.triggers,
          old.milestones,
        ]);
    return {
      ...sub,
      createdAt: old?.createdAt ?? new Date().toISOString(),
      activatedAt:
        sub.enabled && (!old?.enabled || changed || policyChanged)
          ? new Date().toISOString()
          : (old?.activatedAt ?? new Date().toISOString()),
    };
  });
  for (const hook of config.webhooks) {
    if (
      hook.secret !== undefined &&
      hook.secret !== "" &&
      (typeof hook.secret !== "string" ||
        hook.secret.length < 32 ||
        hook.secret.length > 256)
    )
      throw new HttpError(
        422,
        "Webhook signing secrets must contain 32–256 characters.",
      );
    const old = previous?.config.webhooks.find(
      (h) => h.id === hook.id && h.url === hook.url,
    );
    if (hook.secret) secrets[hook.id] = await sealSecret(hook.secret);
    else if (
      old &&
      previous &&
      Object.hasOwn(previous.secrets, hook.id) &&
      previous.secrets[hook.id]
    )
      secrets[hook.id] = previous.secrets[hook.id];
    if (hook.enabled && !secrets[hook.id])
      throw new HttpError(
        422,
        "Add a signing secret before enabling each webhook. Changing an endpoint requires a new secret.",
      );
    clean.webhooks.push({
      id: hook.id,
      label: hook.label,
      kind: hook.kind,
      url: hook.url,
      enabled: hook.enabled,
    });
  }
  const stored: StoredPreferences = { version: 1, config: clean, secrets };
  if (postgresStorageEnabled())
    await syncPostgresRules(
      actor.mock
        ? {
            ...clean,
            subscriptions: clean.subscriptions.map((s) => ({
              ...s,
              enabled: false,
            })),
          }
        : clean,
      actor.id,
      catalogue,
      async (db) => {
        await db.query(
          `INSERT INTO east_sound.account_documents(tenant_id,owner_id,kind,document_key,value) VALUES($1,$2,$3,'default',$4::jsonb)
      ON CONFLICT(tenant_id,owner_id,kind,document_key) DO UPDATE SET value=excluded.value,updated_at=clock_timestamp()`,
          [
            postgresTenant(),
            actor.id,
            NOTIFICATION_DOCUMENT,
            JSON.stringify(stored),
          ],
        );
      },
    );
  else await writeAccountDocument(actor.id, NOTIFICATION_DOCUMENT, stored);
  await audit(actor.id, "notifications.preferences_saved", actor.id, {
    subscriptions: clean.subscriptions.length,
    webhooks: clean.webhooks.length,
  });
  return view(stored);
}
export async function refreshAccountRules(ownerId: string) {
  if (!postgresStorageEnabled()) return;
  const config = await accountPreferences(ownerId),
    account = await findAccount(ownerId, true);
  await syncPostgresRules(
    account?.mock
      ? {
          ...config,
          subscriptions: config.subscriptions.map((s) => ({
            ...s,
            enabled: false,
          })),
        }
      : config,
    ownerId,
    (await readTracks()).filter((t) => t.ownerId === ownerId),
  );
}
