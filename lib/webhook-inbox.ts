import type { Pool, PoolClient } from "pg";
import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { SessionUser } from "@/lib/auth-types";
import { HttpError, tokenHash } from "@/lib/auth-core";
import {
  postgresPool,
  postgresStorageEnabled,
  postgresTenant,
  inTransaction,
} from "@/lib/postgres/pool";
import { takeRateLimit } from "@/lib/security-store";
import { openSecret, sealSecret } from "@/lib/secret-vault";
import {
  signWebhook,
  verifyWebhookSignature,
} from "@/lib/notification-transport";
import { webhookInboxPayload } from "@/lib/webhook-inbox-payload";
import type {
  WebhookReceiverView,
  WebhookReceiptView,
  WebhookReceiptSummary,
  WebhookStorageStatus,
} from "@/lib/webhook-inbox-types";

const validId = (id: string) =>
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
    id,
  );
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
interface ReceiverRow {
  secret_configured?: boolean;
  id: string;
  owner_id: string;
  label: string;
  enabled: boolean;
  generation: number;
  secret_ciphertext: string;
  created_at: string | Date;
  updated_at: string | Date;
}
function artist(actor: SessionUser) {
  if (actor.role !== "artist" || actor.mock)
    throw new HttpError(
      403,
      "A non-mock artist account is required to manage a private receiver.",
    );
}
export function receiverOrigin(): {
  origin: string;
  publicHttps: boolean;
} | null {
  try {
    const value = process.env.EAST_SOUND_APP_ORIGIN ?? "",
      url = new URL(value);
    if (url.origin !== value || url.username || url.password) return null;
    if (url.protocol === "https:") return { origin: value, publicHttps: true };
    if (
      process.env.VERCEL !== "1" &&
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    )
      return { origin: value, publicHttps: false };
  } catch {}
  return null;
}
function endpoint(id: string): string | null {
  const configured = receiverOrigin();
  return configured ? `${configured.origin}/api/webhooks/airplay/${id}` : null;
}
export async function webhookStorageStatus(): Promise<WebhookStorageStatus> {
  if (!postgresStorageEnabled())
    return { available: false, reason: "postgres_required" };
  try {
    const result = await postgresPool().query(
      "SELECT to_regclass('east_sound.webhook_receivers') IS NOT NULL AND to_regclass('east_sound.webhook_receipts') IS NOT NULL AND EXISTS(SELECT 1 FROM public.east_sound_schema_migrations WHERE name='003_webhook_receivers.sql') AS ready",
    );
    return result.rows[0]?.ready
      ? { available: true, reason: "ready" }
      : { available: false, reason: "migration_required" };
  } catch {
    return { available: false, reason: "storage_unavailable" };
  }
}
async function storage() {
  if (!(await webhookStorageStatus()).available)
    throw new HttpError(
      503,
      "Private webhook storage is not ready. Configure PostgreSQL and apply migration 003; no file fallback or reset was performed.",
    );
}
function receiverView(
  row: ReceiverRow,
  receipts: WebhookReceiptView[] = [],
): WebhookReceiverView {
  return {
    id: row.id,
    label: row.label,
    enabled: row.enabled,
    generation: row.generation,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    endpointUrl: endpoint(row.id),
    secretConfigured: row.secret_configured ?? !!row.secret_ciphertext,
    receipts,
  };
}
export async function listWebhookReceivers(
  actor: SessionUser,
): Promise<WebhookReceiverView[]> {
  artist(actor);
  await storage();
  const result = await postgresPool().query<ReceiverRow>(
    "SELECT id,owner_id,label,enabled,generation,(length(secret_ciphertext)>0) AS secret_configured,created_at,updated_at FROM east_sound.webhook_receivers WHERE tenant_id=$1 AND owner_id=$2 ORDER BY created_at,id",
    [postgresTenant(), actor.id],
  );
  const views: WebhookReceiverView[] = [];
  for (const row of result.rows) {
    const receipts = await postgresPool().query<{
      id: string;
      received_at: Date;
      body_sha256: string;
      payload: WebhookReceiptSummary;
    }>(
      "SELECT id,received_at,body_sha256,payload FROM east_sound.webhook_receipts WHERE tenant_id=$1 AND receiver_id=$2 ORDER BY received_at DESC,id DESC LIMIT 20",
      [postgresTenant(), row.id],
    );
    views.push(
      receiverView(
        row,
        receipts.rows.map((r) => ({
          id: r.id,
          receivedAt: new Date(r.received_at).toISOString(),
          bodySha256: r.body_sha256,
          summary: r.payload,
        })),
      ),
    );
  }
  return views;
}
export async function createWebhookReceiver(
  actor: SessionUser,
  labelInput: unknown,
) {
  artist(actor);
  await storage();
  if (!receiverOrigin())
    throw new HttpError(
      503,
      "Configure the exact application origin before creating a receiver.",
    );
  if (typeof labelInput !== "string")
    throw new HttpError(422, "Give this receiver a descriptive label.");
  const label = labelInput.trim();
  if (
    label.length < 2 ||
    label.length > 80 ||
    !label.isWellFormed() ||
    /[\u0000-\u001f\u007f]/.test(label)
  )
    throw new HttpError(
      422,
      "Use a label of 2–80 characters without control characters.",
    );
  if (
    !(await takeRateLimit(
      tokenHash("receiver-create:" + actor.id),
      10,
      86400000,
    ))
  )
    throw new HttpError(
      429,
      "Too many receiver creation attempts. Rotate an existing receiver's key when needed.",
    );
  const secret = randomBytes(32).toString("hex"),
    encrypted = await sealSecret(secret);
  const row = await inTransaction(postgresPool(), async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      postgresTenant() + ":webhook-receivers:" + actor.id,
    ]);
    const active = await db.query(
      "SELECT 1 FROM east_sound.auth_users WHERE tenant_id=$1 AND id=$2 AND role='artist' AND NOT disabled AND NOT mock",
      [postgresTenant(), actor.id],
    );
    if (!active.rowCount)
      throw new HttpError(403, "The artist account is no longer active.");
    const count = await db.query(
      "SELECT count(*)::int AS n FROM east_sound.webhook_receivers WHERE tenant_id=$1 AND owner_id=$2",
      [postgresTenant(), actor.id],
    );
    if (count.rows[0].n >= 5)
      throw new HttpError(
        409,
        "This account already has five receivers. Reuse or rotate an existing receiver; disabling does not erase its history.",
      );
    const created = await db.query<ReceiverRow>(
      "INSERT INTO east_sound.webhook_receivers(tenant_id,owner_id,label,secret_ciphertext) VALUES($1,$2,$3,$4) RETURNING *",
      [postgresTenant(), actor.id, label, encrypted],
    );
    await db.query(
      "INSERT INTO east_sound.security_audit(tenant_id,actor_id,action,object_key,detail) VALUES($1,$2,'webhook.receiver_created',$3,'{}'::jsonb)",
      [postgresTenant(), actor.id, created.rows[0].id],
    );
    return created.rows[0];
  });
  // Deliberately one-time. The secret is never returned by list/read endpoints or stored in browser caches.
  return { receiver: receiverView(row), secret, secretShownOnce: true };
}
export async function changeWebhookReceiver(
  actor: SessionUser,
  id: string,
  action: "enable" | "disable" | "rotate",
) {
  artist(actor);
  await storage();
  if (!validId(id)) throw new HttpError(404, "Receiver not found.");
  if (
    !(await takeRateLimit(
      tokenHash("receiver-change:" + actor.id),
      60,
      3600000,
    ))
  )
    throw new HttpError(429, "Too many receiver changes.");
  const secret = action === "rotate" ? randomBytes(32).toString("hex") : null;
  const encrypted = secret ? await sealSecret(secret) : null;
  const row = await inTransaction(postgresPool(), async (db) => {
    const current = await db.query<ReceiverRow>(
      "SELECT r.* FROM east_sound.webhook_receivers r JOIN east_sound.auth_users u ON u.tenant_id=r.tenant_id AND u.id=r.owner_id WHERE r.tenant_id=$1 AND r.owner_id=$2 AND r.id=$3 AND u.role='artist' AND NOT u.disabled AND NOT u.mock FOR UPDATE OF r",
      [postgresTenant(), actor.id, id],
    );
    if (!current.rowCount) throw new HttpError(404, "Receiver not found.");
    const updated = await db.query<ReceiverRow>(
      "UPDATE east_sound.webhook_receivers SET enabled=$4,secret_ciphertext=coalesce($5,secret_ciphertext),generation=generation+CASE WHEN $5::text IS NULL THEN 0 ELSE 1 END,updated_at=clock_timestamp() WHERE tenant_id=$1 AND owner_id=$2 AND id=$3 RETURNING *",
      [
        postgresTenant(),
        actor.id,
        id,
        action === "enable"
          ? true
          : action === "disable"
            ? false
            : current.rows[0].enabled,
        encrypted,
      ],
    );
    await db.query(
      "INSERT INTO east_sound.security_audit(tenant_id,actor_id,action,object_key,detail) VALUES($1,$2,$3,$4,$5::jsonb)",
      [
        postgresTenant(),
        actor.id,
        "webhook.receiver_" + action,
        id,
        JSON.stringify({ generation: updated.rows[0].generation }),
      ],
    );
    return updated.rows[0];
  });
  return {
    receiver: receiverView(row),
    ...(secret ? { secret, secretShownOnce: true } : {}),
  };
}
async function rawBody(request: Request): Promise<string> {
  const contentType = request.headers
    .get("content-type")
    ?.toLowerCase()
    .split(";")[0]
    .trim();
  if (
    contentType !== "application/json" ||
    (request.headers.get("content-encoding") &&
      request.headers.get("content-encoding") !== "identity")
  )
    throw new HttpError(415, "Use uncompressed UTF-8 application/json.");
  if (Number(request.headers.get("content-length")) > 32768)
    throw new HttpError(413, "Webhook payload exceeds 32 KiB.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "A signed JSON body is required.");
  let size = 0,
    finished = false;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 32768)
        throw new HttpError(413, "Webhook payload exceeds 32 KiB.");
      chunks.push(next.value);
    }
    finished = true;
  } finally {
    if (!finished) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    throw new HttpError(400, "Use valid UTF-8 JSON.");
  }
}
async function activeReceiver(
  id: string,
  lock = false,
  db: Pool | PoolClient = postgresPool(),
) {
  const result = await db.query<ReceiverRow>(
    `SELECT r.* FROM east_sound.webhook_receivers r JOIN east_sound.auth_users u ON u.tenant_id=r.tenant_id AND u.id=r.owner_id WHERE r.tenant_id=$1 AND r.id=$2 AND r.enabled AND u.role='artist' AND NOT u.disabled AND NOT u.mock ${lock ? "FOR UPDATE OF r" : ""}`,
    [postgresTenant(), id],
  );
  if (!result.rowCount) throw new HttpError(404, "Receiver not found.");
  return result.rows[0];
}
/** External HMAC ingress, not session/CSRF auth. Never calls capture ingestion, outbox enqueue or another URL. */
export async function receiveWebhook(request: Request, id: string) {
  if (!validId(id)) throw new HttpError(404, "Receiver not found.");
  const timestamp = request.headers.get("x-east-sound-timestamp") ?? "",
    signature = request.headers.get("x-east-sound-signature") ?? "";
  if (
    !/^\d{10,11}$/.test(timestamp) ||
    !/^v1=[a-f0-9]{64}$/.test(signature) ||
    Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
  )
    throw new HttpError(403, "Webhook signature verification failed.");
  const body = await rawBody(request);
  await storage();
  const initial = await activeReceiver(id);
  if (
    !verifyWebhookSignature(
      body,
      timestamp,
      signature,
      await openSecret(initial.secret_ciphertext),
    )
  )
    throw new HttpError(403, "Webhook signature verification failed.");
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    throw new HttpError(400, "Use valid JSON.");
  }
  const parsed = webhookInboxPayload(raw);
  if (!parsed)
    throw new HttpError(
      422,
      "Use the documented East Sound alert or configuration-test envelope. Simulator events are not accepted as alerts.",
    );
  if (!(await takeRateLimit(tokenHash("webhook-ingress:" + id), 120, 300000)))
    throw new HttpError(429, "Receiver rate limit reached. Retry later.");
  const bodySha256 = hash(body),
    eventKey = hash(parsed.eventId);
  return inTransaction(postgresPool(), async (db) => {
    const current = await activeReceiver(id, true, db);
    // Rotation/disable can race the initial lookup. Verify again while holding the current receiver row.
    if (
      !verifyWebhookSignature(
        body,
        timestamp,
        signature,
        await openSecret(current.secret_ciphertext),
      )
    )
      throw new HttpError(403, "Webhook signature verification failed.");
    const inserted = await db.query<{ id: string }>(
      "INSERT INTO east_sound.webhook_receipts(tenant_id,receiver_id,event_key_hash,body_sha256,payload) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(tenant_id,receiver_id,event_key_hash) DO NOTHING RETURNING id",
      [
        postgresTenant(),
        id,
        eventKey,
        bodySha256,
        JSON.stringify(parsed.summary),
      ],
    );
    if (inserted.rowCount) {
      await db.query(
        "INSERT INTO east_sound.security_audit(tenant_id,actor_id,action,object_key,detail) VALUES($1,NULL,'webhook.received',$2,$3::jsonb)",
        [
          postgresTenant(),
          id,
          JSON.stringify({
            receiptId: inserted.rows[0].id,
            kind: parsed.summary.kind,
            bodySha256,
          }),
        ],
      );
      return {
        accepted: true,
        duplicate: false,
        receiptId: inserted.rows[0].id,
        kind: parsed.summary.kind,
        verifiedAirplay: false,
      };
    }
    const previous = await db.query<{ id: string; body_sha256: string }>(
      "SELECT id,body_sha256 FROM east_sound.webhook_receipts WHERE tenant_id=$1 AND receiver_id=$2 AND event_key_hash=$3",
      [postgresTenant(), id, eventKey],
    );
    if (!previous.rowCount || previous.rows[0].body_sha256 !== bodySha256)
      throw new HttpError(
        409,
        "This signed event ID was already received with a different body. No receipt was overwritten.",
      );
    return {
      accepted: true,
      duplicate: true,
      receiptId: previous.rows[0].id,
      kind: parsed.summary.kind,
      verifiedAirplay: false,
    };
  });
}
/** Explicit owner action: test verifier/storage in-process. It is NOT an external delivery or a real airplay event. */
export async function testWebhookReceiver(actor: SessionUser, id: string) {
  artist(actor);
  await storage();
  if (!validId(id)) throw new HttpError(404, "Receiver not found.");
  if (
    !(await takeRateLimit(tokenHash("receiver-test:" + actor.id), 10, 3600000))
  )
    throw new HttpError(429, "Too many configuration tests.");
  const result = await postgresPool().query<ReceiverRow>(
    "SELECT * FROM east_sound.webhook_receivers WHERE tenant_id=$1 AND owner_id=$2 AND id=$3 AND enabled",
    [postgresTenant(), actor.id, id],
  );
  if (!result.rowCount) throw new HttpError(404, "Enabled receiver not found.");
  const url = endpoint(id);
  if (!url)
    throw new HttpError(
      503,
      "The canonical receiver origin is not configured.",
    );
  const body = JSON.stringify({
    id: "cfg_" + randomUUID(),
    type: "east-sound.configuration-test",
    source: "east-sound",
    mode: "configuration-test",
    occurred_at: new Date().toISOString(),
    message:
      "Configuration test only — not recorded airplay, a royalty claim, an email or a WhatsApp message.",
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const received = await receiveWebhook(
    new Request(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-east-sound-timestamp": timestamp,
        "x-east-sound-signature": signWebhook(
          body,
          timestamp,
          await openSecret(result.rows[0].secret_ciphertext),
        ),
      },
      body,
    }),
    id,
  );
  return {
    ...received,
    transport: "in-process-verifier" as const,
    externalRequestMade: false,
    messagesSent: 0,
  };
}
