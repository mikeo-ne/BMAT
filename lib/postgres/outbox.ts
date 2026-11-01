import "server-only";
import type { Pool } from "pg";
import type { ChannelId } from "@/lib/alerts";
import { formatEatClock } from "@/lib/format";
import { REGIONS, type Region } from "@/lib/regions";
import {
  defaultNotificationPreferences,
  renderMessageTemplate,
  templateIssues,
  type NotificationEvent,
  type WebhookDestination,
} from "@/lib/notifications";
import {
  notificationProviderReadiness,
  sendAlert,
  type TransportResult,
} from "@/lib/notification-transport";
import { postgresPool, postgresTenant } from "@/lib/postgres/pool";

export interface LeasedNotification {
  id: string;
  tenant_id: string;
  rule_id: string;
  rule_generation: string;
  track_id: string;
  channel: ChannelId;
  destination: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  lease_token: string;
}
const eligible = `EXISTS (SELECT 1 FROM east_sound.notification_rules r JOIN east_sound.tracks t ON t.tenant_id=r.tenant_id AND t.id=o.track_id
  JOIN east_sound.subscriber_track_access a ON a.tenant_id=r.tenant_id AND a.user_id=r.user_id AND a.track_id=o.track_id
  WHERE r.tenant_id=o.tenant_id AND r.id=o.rule_id AND r.generation=o.rule_generation AND r.is_active AND r.consented_at IS NOT NULL
    AND r.channel=o.channel AND r.destination=o.destination AND t.deleted_at IS NULL)`;

/** Each statement commits before any network I/O. No pooled client is held during provider calls. */
export async function claimPostgresNotifications(
  pool: Pool,
  tenant: string,
  channels: ChannelId[],
  limit = 20,
): Promise<LeasedNotification[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20)
    throw new Error("Claim at most 20 notifications.");
  await pool.query(
    `WITH doomed AS (
    SELECT o.id FROM east_sound.notification_outbox o WHERE o.tenant_id=$1
      AND (o.status='pending' OR (o.status='processing' AND o.lease_expires_at<=clock_timestamp()))
      AND (o.attempts>=o.max_attempts OR NOT (${eligible}))
      ORDER BY o.created_at,o.id LIMIT 100 FOR UPDATE OF o SKIP LOCKED)
    UPDATE east_sound.notification_outbox o SET status='failed',processed_at=clock_timestamp(),lease_token=NULL,lease_expires_at=NULL,
      error_code=CASE WHEN o.attempts>=o.max_attempts THEN 'attempt_limit' ELSE 'rule_inactive' END
    FROM doomed WHERE o.id=doomed.id`,
    [tenant],
  );
  if (!channels.length) return [];
  const result = await pool.query<LeasedNotification>(
    `WITH candidates AS (
    SELECT o.id FROM east_sound.notification_outbox o WHERE o.tenant_id=$1 AND o.channel=ANY($3::east_sound.alert_channel_enum[])
      AND o.attempts<o.max_attempts AND ${eligible}
      AND ((o.status='pending' AND o.available_at<=clock_timestamp()) OR (o.status='processing' AND o.lease_expires_at<=clock_timestamp()))
      ORDER BY o.created_at,o.id LIMIT $2 FOR UPDATE OF o SKIP LOCKED)
    UPDATE east_sound.notification_outbox o SET status='processing',attempts=o.attempts+1,
      lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '120 seconds',error_code=NULL
    FROM candidates WHERE o.id=candidates.id RETURNING o.*`,
    [tenant, limit, channels],
  );
  return result.rows;
}
export async function finishPostgresNotification(
  pool: Pool,
  row: LeasedNotification,
  result: TransportResult,
): Promise<"sent" | "pending" | "failed" | null> {
  const code = /^[a-z0-9_-]{1,64}$/.test(result.code)
    ? result.code
    : "provider_result";
  const update = await pool.query<{ status: "sent" | "pending" | "failed" }>(
    `UPDATE east_sound.notification_outbox
    SET status=CASE WHEN $4 THEN 'sent'::east_sound.dispatch_status_enum
      WHEN $5 AND attempts<max_attempts THEN 'pending'::east_sound.dispatch_status_enum ELSE 'failed'::east_sound.dispatch_status_enum END,
      processed_at=CASE WHEN $4 OR NOT $5 OR attempts>=max_attempts THEN clock_timestamp() ELSE NULL END,
      available_at=CASE WHEN NOT $4 AND $5 AND attempts<max_attempts THEN clock_timestamp()+interval '60 seconds'*power(2,attempts-1) ELSE available_at END,
      lease_token=NULL,lease_expires_at=NULL,error_code=$6,provider_id=$7
    WHERE tenant_id=$1 AND id=$2 AND lease_token=$3 AND status='processing' AND lease_expires_at>clock_timestamp() RETURNING status`,
    [
      row.tenant_id,
      row.id,
      row.lease_token,
      result.accepted,
      result.retryable,
      code,
      result.accepted &&
      typeof result.providerId === "string" &&
      result.providerId.length <= 512 &&
      [...result.providerId].every(
        (character) =>
          character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
      )
        ? result.providerId
        : null,
    ],
  );
  return update.rows[0]?.status ?? null;
}
function eventFromRow(row: LeasedNotification): NotificationEvent {
  const p = row.payload;
  const strings = [
    "spinId",
    "trackId",
    "title",
    "artist",
    "stationId",
    "station",
    "region",
    "atIso",
    "template",
    "location",
  ];
  if (
    p.source !== "captured" ||
    strings.some(
      (key) =>
        typeof p[key] !== "string" || !p[key] || String(p[key]).length > 1000,
    ) ||
    !REGIONS.includes(p.region as Region) ||
    !Number.isFinite(Date.parse(String(p.atIso))) ||
    !Number.isSafeInteger(p.ordinal) ||
    Number(p.ordinal) < 1 ||
    !Number.isSafeInteger(p.spinsToday) ||
    Number(p.spinsToday) < 1 ||
    templateIssues(String(p.template)).length
  )
    throw new Error("invalid_outbox_payload");
  const trigger =
    p.event === "first_spin"
      ? "first"
      : p.event === "spin_milestone"
        ? "milestone"
        : p.event === "prime_time"
          ? "prime"
          : p.event === "custom_threshold"
            ? "custom_threshold"
            : null;
  if (!trigger) throw new Error("invalid_outbox_payload");
  const ordinal = Number(p.ordinal),
    spinsToday = Number(p.spinsToday);
  return {
    id: row.id,
    subscriptionId: row.rule_id,
    spinId: String(p.spinId),
    trackId: String(p.trackId),
    title: String(p.title),
    artist: String(p.artist),
    stationId: String(p.stationId),
    station: String(p.station),
    region: p.region as Region,
    atIso: String(p.atIso),
    trigger,
    channel: row.channel,
    ordinal,
    spinsToday,
    milestone:
      trigger === "milestone" || trigger === "custom_threshold"
        ? ordinal
        : null,
    source: "captured",
    message: renderMessageTemplate(String(p.template), {
      title: String(p.title),
      artist: String(p.artist),
      station: String(p.station),
      region: String(p.region),
      location: String(p.location),
      time: formatEatClock(String(p.atIso)),
      spinsToday,
      totalSpins: ordinal,
      milestone: ordinal,
      trigger:
        trigger === "first"
          ? "First captured FM play in the connected panel."
          : trigger === "milestone"
            ? `Milestone: ${ordinal} captured FM spins.`
            : trigger === "custom_threshold"
              ? `Custom threshold: ${ordinal} captured FM spins.`
              : "Prime-time airplay.",
    }),
  };
}
export async function sendPostgresNotification(
  row: LeasedNotification,
): Promise<TransportResult> {
  let event: NotificationEvent;
  try {
    event = eventFromRow(row);
  } catch {
    return {
      accepted: false,
      retryable: false,
      code: "invalid_outbox_payload",
    };
  }
  const config = defaultNotificationPreferences();
  let webhook: WebhookDestination | undefined;
  if (row.channel === "whatsapp")
    config.whatsapp = {
      phone: row.destination,
      consent: true,
      template: String(row.payload.template),
    };
  else if (row.channel === "email")
    config.email = { ...config.email, address: row.destination, consent: true };
  else {
    if (
      !["json", "discord", "telegram"].includes(String(row.payload.webhookKind))
    )
      return {
        accepted: false,
        retryable: false,
        code: "invalid_outbox_payload",
      };
    webhook = {
      id: row.rule_id,
      label: "Configured label endpoint",
      url: row.destination,
      enabled: true,
      kind: row.payload.webhookKind as WebhookDestination["kind"],
    };
    config.webhooks = [webhook];
  }
  return sendAlert(event, config, webhook);
}
export async function processPostgresOutbox(
  pool = postgresPool(),
  tenant = postgresTenant(),
  deliver: (
    row: LeasedNotification,
  ) => Promise<TransportResult> = sendPostgresNotification,
) {
  const readiness = notificationProviderReadiness();
  if (!readiness.liveEnabled)
    throw new Error("Live notifications are disabled.");
  const channels = (["whatsapp", "email", "webhook"] as ChannelId[]).filter(
    (channel) => readiness[channel],
  );
  if (!channels.length)
    throw new Error(
      "Configure at least one notification provider before claiming jobs.",
    );
  const rows = await claimPostgresNotifications(pool, tenant, channels);
  const summary = {
    attempted: rows.length,
    accepted: 0,
    retry: 0,
    failed: 0,
    leaseLost: 0,
  };
  for (let offset = 0; offset < rows.length; offset += 5)
    await Promise.all(
      rows.slice(offset, offset + 5).map(async (row) => {
        // Consent, entitlement, destination, generation and ownership of the lease
        // are checked again immediately before I/O. Revocation cannot recall a request already accepted by a provider.
        const valid = await pool.query(
          `UPDATE east_sound.notification_outbox o SET lease_expires_at=clock_timestamp()+interval '120 seconds'
      WHERE o.tenant_id=$1 AND o.id=$2 AND o.lease_token=$3 AND o.lease_expires_at>clock_timestamp()
      AND o.status='processing' AND ${eligible} RETURNING o.id`,
          [tenant, row.id, row.lease_token],
        );
        let result: TransportResult;
        if (!valid.rowCount)
          result = { accepted: false, retryable: false, code: "rule_inactive" };
        else
          try {
            result = await deliver(row);
          } catch {
            result = {
              accepted: false,
              retryable: true,
              code: "provider_unreachable",
            };
          }
        const status = await finishPostgresNotification(pool, row, result);
        if (status === "sent") summary.accepted++;
        else if (status === "pending") summary.retry++;
        else if (status === "failed") summary.failed++;
        else summary.leaseLost++;
      }),
    );
  return summary;
}
