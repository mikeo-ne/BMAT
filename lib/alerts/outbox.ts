/**
 * Draining the alert outbox.
 *
 * The database decides who should be told what (see `enqueue_alerts`); this
 * side only moves rows from "pending" to "sent" or "failed", one recipient at
 * a time. A single bad number must never stop the queue, so every row is
 * handled in its own try/catch and the summary reports what happened.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Alert } from "./compose";
import { deliver, type Channel, type Contact, type DeliveryEnv, type HttpPost } from "./deliver";

export type PendingAlert = Alert & { profile_id: string; attempts: number };

export type OutboxStore = {
  pending(limit: number): Promise<PendingAlert[]>;
  contact(profileId: string): Promise<Contact>;
  markSent(id: string, channel: Channel): Promise<void>;
  markSkipped(id: string, reason: string): Promise<void>;
  markFailed(id: string, error: string, attempts: number): Promise<void>;
};

export type DrainSummary = {
  picked: number;
  sent: number;
  failed: number;
  skipped: number;
  errors: string[];
};

export async function drain(
  store: OutboxStore,
  env: DeliveryEnv,
  post: HttpPost,
  { limit = 25 }: { limit?: number } = {},
): Promise<DrainSummary> {
  const summary: DrainSummary = { picked: 0, sent: 0, failed: 0, skipped: 0, errors: [] };
  const rows = await store.pending(limit);
  summary.picked = rows.length;

  for (const alert of rows) {
    try {
      const contact = await store.contact(alert.profile_id);
      const result = await deliver(alert, contact, env, post);
      if (result.ok) {
        await store.markSent(alert.id, result.channel);
        summary.sent += 1;
      } else if (result.skipped) {
        await store.markSkipped(alert.id, result.skipped);
        summary.skipped += 1;
      } else {
        await store.markFailed(alert.id, result.error ?? "delivery failed", alert.attempts + 1);
        summary.failed += 1;
        summary.errors.push(`${alert.kind}: ${result.error ?? "delivery failed"}`);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "delivery failed";
      summary.failed += 1;
      summary.errors.push(`${alert.kind}: ${message}`);
      // Best effort: the row stays pending if even the bookkeeping write fails.
      await store.markFailed(alert.id, message, alert.attempts + 1).catch(() => undefined);
    }
  }

  return summary;
}

const OUTBOX_COLUMNS = "id, profile_id, kind, title, body, link, created_at, attempts";

/** Postgres-backed store. Expects a service-role client: users never write here. */
export function supabaseStore(sb: SupabaseClient): OutboxStore {
  return {
    async pending(limit) {
      const { data, error } = await sb
        .from("alert_outbox")
        .select(OUTBOX_COLUMNS)
        .is("sent_at", null)
        .order("created_at", { ascending: true })
        .limit(limit);
      if (error) throw new Error(`could not read the alert outbox: ${error.message}`);
      return (data ?? []) as PendingAlert[];
    },

    async contact(profileId) {
      const { data: pref } = await sb
        .from("alert_prefs")
        .select("whatsapp_e164")
        .eq("profile_id", profileId)
        .maybeSingle();
      let email: string | null = null;
      try {
        const { data } = await sb.auth.admin.getUserById(profileId);
        email = data?.user?.email ?? null;
      } catch {
        email = null; // a deleted user is not a reason to fail the whole batch
      }
      return { phone: (pref as { whatsapp_e164: string | null } | null)?.whatsapp_e164 ?? null, email };
    },

    async markSent(id, channel) {
      const { error } = await sb
        .from("alert_outbox")
        .update({ sent_at: new Date().toISOString(), channel, last_error: null })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },

    async markSkipped(id, reason) {
      // Terminal, but explained: retrying a missing phone number forever would
      // only fill the queue with the same row.
      const { error } = await sb
        .from("alert_outbox")
        .update({ sent_at: new Date().toISOString(), channel: null, last_error: reason })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },

    async markFailed(id, error, attempts) {
      const { error: err } = await sb.from("alert_outbox").update({ attempts, last_error: error }).eq("id", id);
      if (err) throw new Error(err.message);
    },
  };
}
