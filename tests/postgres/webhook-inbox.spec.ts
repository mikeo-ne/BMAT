import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import type { Pool } from "pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
vi.mock("server-only", () => ({}));
import { createPostgresPool, closePostgresPool } from "@/lib/postgres/pool";
import { migratePostgres } from "@/lib/postgres/migrate";
import { seedPostgres } from "@/lib/postgres/catalogue";
import { testActor } from "@/tests/fixtures/auth";
import { signWebhook } from "@/lib/notification-transport";
import {
  createWebhookReceiver,
  changeWebhookReceiver,
  listWebhookReceivers,
  receiveWebhook,
  testWebhookReceiver,
  webhookStorageStatus,
} from "@/lib/webhook-inbox";
import {
  GET as manageGet,
  POST as managePost,
} from "@/app/api/integrations/webhooks/route";
import { POST as publicPost } from "@/app/api/webhooks/airplay/[id]/route";
let database: EmbeddedPostgres,
  pool: Pool,
  directory: string,
  connection: string,
  tenant: string;
beforeAll(async () => {
  await mkdir(".data/qa", { recursive: true });
  directory = await mkdtemp(
    path.join(process.cwd(), ".data/qa/pg-webhook-inbox-"),
  );
  const listener = createServer();
  await new Promise<void>((r) => listener.listen(0, "127.0.0.1", r));
  const port = (listener.address() as { port: number }).port;
  await new Promise<void>((r, reject) =>
    listener.close((e) => (e ? reject(e) : r())),
  );
  database = new EmbeddedPostgres({
    databaseDir: path.join(directory, "db"),
    port,
    user: "postgres",
    password: "qa-local-only",
    persistent: false,
    postgresFlags: ["-h", "127.0.0.1", "-F"],
    onLog: () => {},
    onError: () => {},
  });
  await database.initialise();
  await database.start();
  connection = `postgresql://postgres:qa-local-only@127.0.0.1:${port}/postgres`;
  pool = createPostgresPool(connection);
  await migratePostgres(pool);
}, 120000);
afterAll(async () => {
  vi.useRealTimers();
  await closePostgresPool();
  await pool?.end();
  await database?.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  vi.useRealTimers();
  await pool.query("TRUNCATE east_sound.tenants CASCADE");
  tenant = randomUUID();
  vi.stubEnv("EAST_SOUND_STORAGE_BACKEND", "postgres");
  vi.stubEnv("DATABASE_URL", connection);
  vi.stubEnv("EAST_SOUND_TENANT_ID", tenant);
  vi.stubEnv("EAST_SOUND_DATA_DIR", path.join(directory, "unused-files"));
  vi.stubEnv("EAST_SOUND_STATIC_EXPORT", "0");
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("EAST_SOUND_APP_ORIGIN", "https://app.example.com");
  vi.stubEnv("EAST_SOUND_SECRET_KEY", "cd".repeat(32));
  vi.stubEnv("EAST_SOUND_LIVE_NOTIFICATIONS", "false");
  vi.stubEnv("EAST_SOUND_WORKER_ENABLED", "0");
  await seedPostgres(pool, tenant);
});
function payload(id = randomUUID()) {
  return {
    id,
    type: "airplay.first",
    source: "east-sound",
    mode: "captured",
    occurred_at: new Date().toISOString(),
    recording: {
      id: "not-an-owned-master",
      title: "External test claim",
      artist: "Unverified external artist",
    },
    station: { id: "capital-kla", name: "Capital FM", region: "Central" },
    fm_spins_in_connected_history: 1,
    fm_spins_today: 1,
    milestone: null,
    message: "Signed external data is not proof of captured airplay.",
  };
}
function signed(
  id: string,
  secret: string,
  input: unknown = payload(),
  timestamp = String(Math.floor(Date.now() / 1000)),
  extra: Record<string, string> = {},
) {
  const body = typeof input === "string" ? input : JSON.stringify(input);
  return new Request(`https://app.example.com/api/webhooks/airplay/${id}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-east-sound-timestamp": timestamp,
      "x-east-sound-signature": signWebhook(body, timestamp, secret),
      ...extra,
    },
    body,
  });
}
async function fixture() {
  const actor = await testActor();
  const created = await createWebhookReceiver(
    actor.user,
    "QA private receiver",
  );
  return { actor, ...created };
}
const receiptCount = async () =>
  (
    await pool.query(
      "SELECT count(*)::int AS n FROM east_sound.webhook_receipts",
    )
  ).rows[0].n;
const sideEffects = async () =>
  (
    await pool.query(
      "SELECT (SELECT count(*)::int FROM east_sound.airplay_logs) AS captures,(SELECT count(*)::int FROM east_sound.notification_outbox) AS jobs,(SELECT count(*)::int FROM east_sound.tracks WHERE metadata->>'ownerId' IS NOT NULL) AS masters",
    )
  ).rows[0];
describe("private HMAC inbox with real PostgreSQL constraints and transactions", () => {
  it("requires explicit migration 003 and never resets an unavailable store into an empty inbox", async () => {
    expect(await webhookStorageStatus()).toEqual({
      available: true,
      reason: "ready",
    });
    await pool.query(
      "ALTER TABLE east_sound.webhook_receipts RENAME TO qa_missing_receipts",
    );
    try {
      expect(await webhookStorageStatus()).toEqual({
        available: false,
        reason: "migration_required",
      });
      const actor = await testActor();
      await expect(
        createWebhookReceiver(actor.user, "No fallback"),
      ).rejects.toMatchObject({ status: 503 });
    } finally {
      await pool.query(
        "ALTER TABLE east_sound.qa_missing_receipts RENAME TO webhook_receipts",
      );
    }
  });
  it("shows a newly generated secret once, stores only ciphertext and omits both from every read response", async () => {
    const f = await fixture();
    expect(f.secret).toMatch(/^[a-f0-9]{64}$/);
    expect(f.secretShownOnce).toBe(true);
    const stored = (
      await pool.query(
        "SELECT secret_ciphertext FROM east_sound.webhook_receivers WHERE id=$1",
        [f.receiver.id],
      )
    ).rows[0].secret_ciphertext;
    expect(stored).not.toContain(f.secret);
    expect(stored).toMatch(/^v1\./);
    const views = await listWebhookReceivers(f.actor.user);
    expect(JSON.stringify(views)).not.toContain(f.secret);
    expect(JSON.stringify(views)).not.toContain(stored);
    expect(views[0].endpointUrl).toBe(
      `https://app.example.com/api/webhooks/airplay/${f.receiver.id}`,
    );
    const response = await manageGet(
      f.actor.request("/api/integrations/webhooks"),
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(await response.json())).not.toContain(f.secret);
  });
  it("stores a minimized signed claim without inventing an owned master, capture, outbox job or verified play", async () => {
    const f = await fixture();
    const body = {
      ...payload(),
      password: "must-not-be-persisted",
      headers: { authorization: "private" },
    };
    const result = await receiveWebhook(
      signed(f.receiver.id, f.secret, body),
      f.receiver.id,
    );
    expect(result).toMatchObject({
      accepted: true,
      duplicate: false,
      verifiedAirplay: false,
      kind: "signed-external-alert",
    });
    const receipts = (await listWebhookReceivers(f.actor.user))[0].receipts;
    expect(receipts).toHaveLength(1);
    expect(JSON.stringify(receipts)).not.toContain("must-not-be-persisted");
    expect(JSON.stringify(receipts)).not.toContain("authorization");
    expect(await sideEffects()).toEqual({ captures: 0, jobs: 0, masters: 0 });
    expect(
      (
        await pool.query(
          "SELECT actor_id FROM east_sound.security_audit WHERE action='webhook.received'",
        )
      ).rows[0].actor_id,
    ).toBeNull();
  });
  it("rejects missing/wrong/expired HMAC and tampered raw bytes before creating receipts", async () => {
    const f = await fixture();
    const wrong = signed(f.receiver.id, "x".repeat(64));
    await expect(receiveWebhook(wrong, f.receiver.id)).rejects.toMatchObject({
      status: 403,
    });
    const missing = signed(f.receiver.id, f.secret);
    missing.headers.delete("x-east-sound-signature");
    await expect(receiveWebhook(missing, f.receiver.id)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      receiveWebhook(
        signed(
          f.receiver.id,
          f.secret,
          payload(),
          String(Math.floor(Date.now() / 1000) - 301),
        ),
        f.receiver.id,
      ),
    ).rejects.toMatchObject({ status: 403 });
    const valid = signed(f.receiver.id, f.secret);
    const tampered = new Request(valid.url, {
      method: "POST",
      headers: valid.headers,
      body: (await valid.text()) + " ",
    });
    await expect(receiveWebhook(tampered, f.receiver.id)).rejects.toMatchObject(
      { status: 403 },
    );
    expect(await receiptCount()).toBe(0);
  });
  it("deduplicates signed IDs even with different unsigned idempotency headers or a fresh signature a day later", async () => {
    const f = await fixture(),
      body = payload();
    const first = await receiveWebhook(
      signed(f.receiver.id, f.secret, body, undefined, {
        "idempotency-key": "first-header",
      }),
      f.receiver.id,
    );
    const replay = await receiveWebhook(
      signed(f.receiver.id, f.secret, body, undefined, {
        "idempotency-key": "changed-header",
      }),
      f.receiver.id,
    );
    expect(replay).toMatchObject({
      duplicate: true,
      receiptId: first.receiptId,
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 86400000);
    try {
      expect(
        await receiveWebhook(
          signed(f.receiver.id, f.secret, body),
          f.receiver.id,
        ),
      ).toMatchObject({ duplicate: true, receiptId: first.receiptId });
    } finally {
      vi.useRealTimers();
    }
    expect(await receiptCount()).toBe(1);
  });
  it("returns conflict for changed bodies under an already signed event ID without overwriting history", async () => {
    const f = await fixture(),
      body = payload();
    await receiveWebhook(signed(f.receiver.id, f.secret, body), f.receiver.id);
    await expect(
      receiveWebhook(
        signed(f.receiver.id, f.secret, {
          ...body,
          message: "Changed content under the same ID",
        }),
        f.receiver.id,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(await receiptCount()).toBe(1);
    expect(
      (await listWebhookReceivers(f.actor.user))[0].receipts[0].summary.message,
    ).toBe(body.message);
  });
  it("serializes concurrent duplicates into exactly one receipt and one machine-origin audit event", async () => {
    const f = await fixture(),
      body = payload();
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        receiveWebhook(signed(f.receiver.id, f.secret, body), f.receiver.id),
      ),
    );
    expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
    expect(await receiptCount()).toBe(1);
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM east_sound.security_audit WHERE action='webhook.received'",
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it("rolls back receipt insertion if its audit fails, leaving the same event safely retryable", async () => {
    const f = await fixture(),
      body = payload();
    await pool.query(
      "ALTER TABLE east_sound.security_audit ADD CONSTRAINT qa_webhook_audit CHECK(action<>'webhook.received')",
    );
    try {
      await expect(
        receiveWebhook(signed(f.receiver.id, f.secret, body), f.receiver.id),
      ).rejects.toBeDefined();
      expect(await receiptCount()).toBe(0);
    } finally {
      await pool.query(
        "ALTER TABLE east_sound.security_audit DROP CONSTRAINT qa_webhook_audit",
      );
    }
    expect(
      await receiveWebhook(
        signed(f.receiver.id, f.secret, body),
        f.receiver.id,
      ),
    ).toMatchObject({ duplicate: false });
  });
  it("rotates signing keys without exposing the old key or erasing existing receipts", async () => {
    const f = await fixture();
    await receiveWebhook(signed(f.receiver.id, f.secret), f.receiver.id);
    const rotated = await changeWebhookReceiver(
      f.actor.user,
      f.receiver.id,
      "rotate",
    );
    expect(rotated.secret).not.toBe(f.secret);
    expect(rotated.receiver.generation).toBe(2);
    await expect(
      receiveWebhook(signed(f.receiver.id, f.secret), f.receiver.id),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      await receiveWebhook(
        signed(f.receiver.id, rotated.secret!),
        f.receiver.id,
      ),
    ).toMatchObject({ accepted: true });
    expect(await receiptCount()).toBe(2);
    expect(
      JSON.stringify(await listWebhookReceivers(f.actor.user)),
    ).not.toContain(rotated.secret);
  });
  it("disables acceptance while retaining receipt history, and re-enables only for the owner", async () => {
    const f = await fixture(),
      other = await testActor();
    await receiveWebhook(signed(f.receiver.id, f.secret), f.receiver.id);
    await expect(
      changeWebhookReceiver(other.user, f.receiver.id, "disable"),
    ).rejects.toMatchObject({ status: 404 });
    await changeWebhookReceiver(f.actor.user, f.receiver.id, "disable");
    await expect(
      receiveWebhook(signed(f.receiver.id, f.secret), f.receiver.id),
    ).rejects.toMatchObject({ status: 404 });
    expect((await listWebhookReceivers(f.actor.user))[0].receipts).toHaveLength(
      1,
    );
    await changeWebhookReceiver(f.actor.user, f.receiver.id, "enable");
    expect(
      await receiveWebhook(signed(f.receiver.id, f.secret), f.receiver.id),
    ).toMatchObject({ accepted: true });
  });
  it("never lets an account read, rotate or test another owner's receiver", async () => {
    const f = await fixture(),
      other = await testActor();
    expect(await listWebhookReceivers(other.user)).toEqual([]);
    await expect(
      changeWebhookReceiver(other.user, f.receiver.id, "rotate"),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      testWebhookReceiver(other.user, f.receiver.id),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      (
        await manageGet(
          new Request("https://app.example.com/api/integrations/webhooks"),
        )
      ).status,
    ).toBe(401);
    const broadcaster = await testActor("broadcaster");
    expect(
      (await manageGet(broadcaster.request("/api/integrations/webhooks")))
        .status,
    ).toBe(403);
  });
  it("requires session/CSRF for management and refuses development-only mock identities", async () => {
    const actor = await testActor();
    const body = JSON.stringify({ action: "create", label: "HTTP test" });
    const noCsrf = actor.request("/api/integrations/webhooks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    noCsrf.headers.delete("x-east-sound-csrf");
    expect((await managePost(noCsrf)).status).toBe(403);
    const response = await managePost(
      actor.request("/api/integrations/webhooks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      }),
    );
    expect(response.status).toBe(201);
    expect((await response.json()).secretShownOnce).toBe(true);
    await expect(
      createWebhookReceiver({ ...actor.user, mock: true }, "Mock actor"),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("uses HMAC rather than browser cookies for external ingress and classifies configuration tests honestly", async () => {
    const f = await fixture();
    const result = await testWebhookReceiver(f.actor.user, f.receiver.id);
    expect(result).toMatchObject({
      kind: "configuration-test",
      verifiedAirplay: false,
      transport: "in-process-verifier",
      externalRequestMade: false,
      messagesSent: 0,
    });
    const request = signed(f.receiver.id, f.secret);
    request.headers.set("origin", "https://another-sender.example");
    expect(
      (
        await publicPost(request, {
          params: Promise.resolve({ id: f.receiver.id }),
        })
      ).status,
    ).toBe(202);
    expect(await sideEffects()).toEqual({ captures: 0, jobs: 0, masters: 0 });
    expect(process.env.EAST_SOUND_LIVE_NOTIFICATIONS).toBe("false");
  });
  it("fences a disabled owner and keeps tenant boundaries independent of a valid signing key", async () => {
    const f = await fixture();
    await pool.query(
      "UPDATE east_sound.auth_users SET disabled=true WHERE id=$1",
      [f.actor.user.id],
    );
    await expect(
      receiveWebhook(signed(f.receiver.id, f.secret), f.receiver.id),
    ).rejects.toMatchObject({ status: 404 });
    await pool.query(
      "UPDATE east_sound.auth_users SET disabled=false WHERE id=$1",
      [f.actor.user.id],
    );
    vi.stubEnv("EAST_SOUND_TENANT_ID", randomUUID());
    await expect(
      receiveWebhook(signed(f.receiver.id, f.secret), f.receiver.id),
    ).rejects.toMatchObject({ status: 404 });
    expect(await receiptCount()).toBe(0);
  });
  it("rejects oversized, non-JSON and invalid UTF-8 bodies without persisting partial input", async () => {
    const f = await fixture();
    const large = signed(f.receiver.id, f.secret, {
      ...payload(),
      message: "x".repeat(40000),
    });
    large.headers.set("content-length", "1");
    await expect(receiveWebhook(large, f.receiver.id)).rejects.toMatchObject({
      status: 413,
    });
    const wrongType = signed(f.receiver.id, f.secret);
    wrongType.headers.set("content-type", "text/plain");
    await expect(
      receiveWebhook(wrongType, f.receiver.id),
    ).rejects.toMatchObject({ status: 415 });
    const valid = signed(f.receiver.id, f.secret);
    const invalid = new Request(valid.url, {
      method: "POST",
      headers: valid.headers,
      body: new Uint8Array([255]),
    });
    await expect(receiveWebhook(invalid, f.receiver.id)).rejects.toMatchObject({
      status: 400,
    });
    expect(await receiptCount()).toBe(0);
  });
  it("enforces the five-receiver cap under concurrent creation instead of trusting browser counts", async () => {
    const actor = await testActor();
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) =>
        createWebhookReceiver(actor.user, "Receiver " + i),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(await listWebhookReceivers(actor.user)).toHaveLength(5);
  });
  it("retains a valid bounded emoji preview without creating invalid JSONB text", async () => {
    const f = await fixture();
    const result = await receiveWebhook(
      signed(f.receiver.id, f.secret, {
        ...payload(),
        message: "x" + "🔥".repeat(1000),
      }),
      f.receiver.id,
    );
    expect(result.accepted).toBe(true);
    const message = (await listWebhookReceivers(f.actor.user))[0].receipts[0]
      .summary.message;
    expect(message.length).toBeLessThanOrEqual(2000);
    expect(message.isWellFormed()).toBe(true);
  });
  it("rejects signed null/surrogate display text before it can become a storage outage", async () => {
    const f = await fixture();
    for (const message of ["bad\u0000message", "bad\ud800message"])
      await expect(
        receiveWebhook(
          signed(f.receiver.id, f.secret, { ...payload(), message }),
          f.receiver.id,
        ),
      ).rejects.toMatchObject({ status: 422 });
    expect(await receiptCount()).toBe(0);
  });
});
