import "server-only";
import type { PoolClient } from "pg";
import { createHash } from "node:crypto";
import {
  channelReady,
  normaliseWhatsappPhone,
  subscriptionIssues,
  type NotificationPreferences,
} from "@/lib/notifications";
import type { Track } from "@/lib/types";
import {
  inTransaction,
  postgresPool,
  postgresTenant,
} from "@/lib/postgres/pool";

export class RuleConfigurationError extends Error {}

const triggerNames = {
  first: "first_spin",
  milestone: "spin_milestone",
  prime: "prime_time",
} as const;
/** Trusted administrative action; caller identity comes from server configuration, never browser role/user_id. */
export async function syncPostgresRules(
  config: NotificationPreferences,
  user: string,
  catalogue: Track[],
  after?: (db: PoolClient) => Promise<void>,
) {
  const plan: {
    external_key: string;
    track_key: string | null;
    station_key: string | null;
    region: string | null;
    channel: string;
    trigger_type: string;
    destination: string;
    webhook_kind: string;
    template: string;
    milestones: number[];
    active: boolean;
    activation_key: string;
  }[] = [];
  const watched = new Set<string>();
  for (const sub of config.subscriptions) {
    if (subscriptionIssues(sub, catalogue).length)
      throw new RuleConfigurationError("Invalid subscription scope.");
    for (const track of catalogue.filter(
      (track) => sub.trackId === "all" || track.id === sub.trackId,
    ))
      watched.add(track.id);
    for (const channel of sub.channels) {
      if (!channelReady(config, channel)) continue;
      const destinations =
        channel === "whatsapp"
          ? [
              {
                key: "phone",
                destination: normaliseWhatsappPhone(config.whatsapp.phone)!,
                kind: "json",
              },
            ]
          : channel === "email"
            ? [
                {
                  key: "email",
                  destination: config.email.address.trim(),
                  kind: "json",
                },
              ]
            : config.webhooks
                .filter((hook) => hook.enabled)
                .map((hook) => ({
                  key: hook.id,
                  destination: hook.url,
                  kind: hook.kind,
                }));
      for (const trigger of sub.triggers)
        for (const target of destinations)
          plan.push({
            external_key: JSON.stringify([
              sub.id,
              channel,
              trigger,
              target.key,
            ]),
            track_key: sub.trackId === "all" ? null : sub.trackId,
            station_key: sub.stationId === "all" ? null : sub.stationId,
            region: sub.region === "All" ? null : sub.region,
            channel,
            trigger_type: triggerNames[trigger],
            destination: target.destination,
            webhook_kind: target.kind,
            template: config.whatsapp.template,
            // Non-milestone SQL rules still require a nonempty storage array.
            // These values are never evaluated for first/prime triggers.
            milestones: trigger === "milestone" ? sub.milestones : [100, 1000],
            active: sub.enabled,
            activation_key: sub.activatedAt ?? sub.createdAt,
          });
    }
  }
  if (plan.length > 1000)
    throw new RuleConfigurationError(
      "Limit this principal to 1,000 expanded notification rules.",
    );
  plan.sort((a, b) => a.external_key.localeCompare(b.external_key));
  const keys = [...watched].sort();
  const checksum = createHash("sha256")
    .update(JSON.stringify({ plan, keys }))
    .digest("hex");
  const tenant = postgresTenant();
  return inTransaction(postgresPool(), async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      tenant + ":" + user,
    ]);
    const previous = await db.query<{ sha256: string }>(
      "SELECT sha256 FROM east_sound.notification_configs WHERE tenant_id=$1 AND user_id=$2",
      [tenant, user],
    );
    if (previous.rows[0]?.sha256 === checksum) {
      await after?.(db);
      return {
        unchanged: true,
        rules: plan.length,
        active: plan.filter((rule) => rule.active).length,
      };
    }
    await db.query(
      "UPDATE east_sound.notification_rules SET is_active=false WHERE tenant_id=$1 AND user_id=$2 AND is_active",
      [tenant, user],
    );
    await db.query(
      "DELETE FROM east_sound.subscriber_track_access WHERE tenant_id=$1 AND user_id=$2",
      [tenant, user],
    );
    await db.query(
      `INSERT INTO east_sound.subscriber_track_access(tenant_id,user_id,track_id)
      SELECT $1,$2,id FROM east_sound.tracks WHERE tenant_id=$1 AND external_key=ANY($3::text[]) AND deleted_at IS NULL`,
      [tenant, user, keys],
    );
    if (plan.length) {
      const result = await db.query(
        `INSERT INTO east_sound.notification_rules(tenant_id,user_id,external_key,track_id,station_id,region,channel,
        trigger_type,destination,webhook_kind,message_template,milestones,is_active,consented_at)
        SELECT $1,$2,p.external_key,t.id,s.id,p.region,p.channel::east_sound.alert_channel_enum,
          p.trigger_type::east_sound.alert_trigger_type_enum,p.destination,p.webhook_kind,p.template,p.milestones,p.active,clock_timestamp()
        FROM jsonb_to_recordset($3::jsonb) AS p(external_key text,track_key text,station_key text,region text,channel text,
          trigger_type text,destination text,webhook_kind text,template text,milestones bigint[],active boolean)
        LEFT JOIN east_sound.tracks t ON t.tenant_id=$1 AND t.external_key=p.track_key AND t.deleted_at IS NULL
        LEFT JOIN east_sound.stations s ON s.tenant_id=$1 AND s.external_key=p.station_key
        WHERE (p.track_key IS NULL OR t.id IS NOT NULL) AND (p.station_key IS NULL OR s.id IS NOT NULL)
        ON CONFLICT (tenant_id,user_id,external_key) DO UPDATE SET track_id=excluded.track_id,station_id=excluded.station_id,
          region=excluded.region,channel=excluded.channel,trigger_type=excluded.trigger_type,destination=excluded.destination,
          webhook_kind=excluded.webhook_kind,message_template=excluded.message_template,milestones=excluded.milestones,
          is_active=excluded.is_active,consented_at=excluded.consented_at,generation=gen_random_uuid(),activated_at=clock_timestamp()`,
        [tenant, user, JSON.stringify(plan)],
      );
      if (result.rowCount !== plan.length)
        throw new RuleConfigurationError(
          "A rule refers to a station or recording outside the workspace.",
        );
    }
    await db.query(
      `INSERT INTO east_sound.notification_configs(tenant_id,user_id,sha256) VALUES($1,$2,$3)
      ON CONFLICT(tenant_id,user_id) DO UPDATE SET sha256=excluded.sha256,updated_at=clock_timestamp()`,
      [tenant, user, checksum],
    );
    await after?.(db);
    return {
      unchanged: false,
      rules: plan.length,
      active: plan.filter((rule) => rule.active).length,
    };
  });
}
