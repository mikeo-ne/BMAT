import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
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
const transport = vi.hoisted(() => ({ alert: vi.fn() }));
vi.mock("@/lib/notification-transport", async (original) => ({
  ...(await original<typeof import("@/lib/notification-transport")>()),
  sendAlert: transport.alert,
}));
import { createPostgresPool, closePostgresPool } from "@/lib/postgres/pool";
import { migratePostgres } from "@/lib/postgres/migrate";
import { seedPostgres } from "@/lib/postgres/catalogue";
import { syncPostgresRules } from "@/lib/postgres/rules";
import {
  claimPostgresNotifications,
  finishPostgresNotification,
  processPostgresOutbox,
} from "@/lib/postgres/outbox";
import { CaptureIdentityConflict } from "@/lib/postgres/captures";
import { readTracks, reserveIsrc, addTrack, deleteTrack } from "@/lib/store";
import { appendCapturedSpins, readCapturedSpins } from "@/lib/broadcast-store";
import { claimDelivery, finishDelivery } from "@/lib/notification-outbox";
import { capturedSpin, optedInPreferences } from "@/tests/fixtures/captured";
import { eatDate } from "@/lib/playout";
import { testActor } from "@/tests/fixtures/auth";
import { deliveryFixture } from "@/tests/fixtures/master";
import { defaultNotificationPreferences } from "@/lib/notifications";

let database: EmbeddedPostgres,
  pool: Pool,
  directory: string,
  tenant: string,
  user: string,
  connection: string;
const accepted = {
  accepted: true,
  retryable: false,
  code: "provider_accepted",
  providerId: "qa-provider-id",
};
const retry = { accepted: false, retryable: true, code: "provider_http_429" };
const at = () => new Date(Date.now() - 60000).toISOString();
const spin = (id: string, extra: Parameters<typeof capturedSpin>[0] = {}) =>
  capturedSpin({ id, detectedAt: at(), ...extra });
async function configure(
  triggers: ("first" | "milestone" | "prime")[] = ["first"],
) {
  const config = optedInPreferences({ triggers });
  await syncPostgresRules(config, user, await readTracks());
  // Test-only activation boundary; no real server/database is used by this suite.
  await pool.query(
    "UPDATE east_sound.notification_rules SET activated_at=clock_timestamp()-interval '30 days' WHERE tenant_id=$1",
    [tenant],
  );
  return config;
}
const counts = async () => {
  const result = await pool.query(
    "SELECT (SELECT count(*)::int FROM east_sound.airplay_logs) AS logs,(SELECT count(*)::int FROM east_sound.airplay_event_keys) AS keys,(SELECT count(*)::int FROM east_sound.notification_outbox) AS jobs",
  );
  return result.rows[0];
};

beforeAll(async () => {
  await mkdir(".data/qa", { recursive: true });
  directory = await mkdtemp(path.join(process.cwd(), ".data/qa/pg-isolated-"));
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
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
  expect(await migratePostgres(pool)).toEqual([
    "001_capture_outbox.sql",
    "002_accounts_sessions.sql",
    "003_webhook_receivers.sql",
  ]);
}, 120000);
afterAll(async () => {
  await closePostgresPool();
  await pool?.end();
  await database?.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  await pool.query("TRUNCATE east_sound.tenants CASCADE");
  await pool.query("TRUNCATE east_sound.isrc_counters");
  tenant = randomUUID();
  user = randomUUID();
  vi.stubEnv("EAST_SOUND_STORAGE_BACKEND", "postgres");
  vi.stubEnv("EAST_SOUND_TENANT_ID", tenant);
  vi.stubEnv("DATABASE_URL", connection);
  vi.stubEnv("EAST_SOUND_DATA_DIR", path.join(directory, "unrelated-json"));
  vi.stubEnv("EAST_SOUND_STATIC_EXPORT", "0");
  vi.stubEnv("EAST_SOUND_LIVE_NOTIFICATIONS", "true");
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "qa-no-provider-calls");
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1234");
  vi.stubEnv("WHATSAPP_GRAPH_VERSION", "v26.0");
  vi.stubEnv("WHATSAPP_TEMPLATE_NAME", "qa_only");
  vi.stubEnv(
    "EAST_SOUND_NOTIFICATION_TOKEN",
    "qa-worker-token-" + randomUUID(),
  );
  vi.stubEnv("EAST_SOUND_NOTIFICATION_USER_ID", user);
  transport.alert.mockReset().mockResolvedValue(accepted);
  await seedPostgres(pool, tenant);
});

describe("real PostgreSQL migrations, capture transactions and multi-worker outbox", () => {
  it("reapplies migrations idempotently and seeds actual references without inventing ISRCs, masters, rights or activity", async () => {
    expect(await migratePostgres(pool)).toEqual([]);
    expect(await seedPostgres(pool, tenant)).toEqual({
      referencesInserted: 0,
      captureRecordsInserted: 0,
    });
    const tracks = await readTracks();
    expect(tracks).toHaveLength(12);
    expect(
      tracks.every(
        (track) =>
          track.origin === "public-reference" &&
          !track.isrc &&
          !track.audio.storedName &&
          !track.ownership,
      ),
    ).toBe(true);
    expect(await counts()).toEqual({ logs: 0, keys: 0, jobs: 0 });
    const directory = await pool.query(
      "SELECT stream_url,is_active FROM east_sound.stations",
    );
    expect(
      directory.rows.every((row) => row.stream_url === null && !row.is_active),
    ).toBe(true);
  });
  it("rejects changed migration checksums without executing replacement SQL", async () => {
    const folder = path.join(directory, "changed-migration");
    await mkdir(folder, { recursive: true });
    await writeFile(
      path.join(folder, "001_capture_outbox.sql"),
      "DROP SCHEMA east_sound CASCADE;",
    );
    await writeFile(
      path.join(folder, "002_accounts_sessions.sql"),
      await readFile(
        path.join(process.cwd(), "db/migrations/002_accounts_sessions.sql"),
        "utf8",
      ),
    );
    await writeFile(
      path.join(folder, "003_webhook_receivers.sql"),
      await readFile(
        path.join(process.cwd(), "db/migrations/003_webhook_receivers.sql"),
        "utf8",
      ),
    );
    await expect(migratePostgres(pool, folder)).rejects.toThrow(
      /applied migration changed/,
    );
    expect(await readTracks()).toHaveLength(12);
  });
  it("atomically logs a capture, creates exactly one first-spin job and preserves a partition-safe foreign key", async () => {
    await configure();
    expect(await appendCapturedSpins([spin("qa-one")])).toEqual({
      inserted: 1,
      duplicates: 0,
    });
    expect(await counts()).toEqual({ logs: 1, keys: 1, jobs: 1 });
    expect(await readCapturedSpins()).toMatchObject([
      { id: "qa-one", source: "captured", isrc: null, confidence: 0.98 },
    ]);
    const rows = await pool.query(
      "SELECT o.status,o.attempts,l.provider_event_id FROM east_sound.notification_outbox o JOIN east_sound.airplay_logs l ON l.tenant_id=o.tenant_id AND l.played_at=o.airplay_played_at AND l.id=o.airplay_log_id",
    );
    expect(rows.rows).toEqual([
      { status: "pending", attempts: 0, provider_event_id: "qa-one" },
    ]);
  });
  it("serializes simultaneous first plays without COUNT(*) races or missed/duplicate first-spin jobs", async () => {
    await configure();
    const timestamp = at();
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        appendCapturedSpins([
          spin(`qa-concurrent-${i}`, { detectedAt: timestamp }),
        ]),
      ),
    );
    expect(await counts()).toEqual({ logs: 12, keys: 12, jobs: 1 });
    expect(
      (await pool.query("SELECT spins FROM east_sound.track_spin_totals"))
        .rows[0].spins,
    ).toBe("12");
  });
  it("deduplicates simultaneous provider IDs globally across partitions and rolls back changed-ID batches", async () => {
    await configure();
    const original = spin("z-existing");
    const duplicates = await Promise.all(
      Array.from({ length: 8 }, () => appendCapturedSpins([original])),
    );
    expect(duplicates.reduce((sum, result) => sum + result.inserted, 0)).toBe(
      1,
    );
    await expect(
      appendCapturedSpins([
        spin("a-must-rollback", { detectedAt: original.detectedAt }),
        { ...original, durationSec: 200 },
      ]),
    ).rejects.toBeInstanceOf(CaptureIdentityConflict);
    const earlier = new Date(original.detectedAt);
    earlier.setUTCMonth(earlier.getUTCMonth() - 1);
    await expect(
      appendCapturedSpins([{ ...original, detectedAt: earlier.toISOString() }]),
    ).rejects.toBeInstanceOf(CaptureIdentityConflict);
    expect(await counts()).toEqual({ logs: 1, keys: 1, jobs: 1 });
  });
  it("never sends retroactively when rules are activated after historical ingestion; unchanged syncs preserve generations", async () => {
    await appendCapturedSpins([spin("qa-before-config")]);
    const config = optedInPreferences({ triggers: ["first"] });
    expect(
      (await syncPostgresRules(config, user, await readTracks())).unchanged,
    ).toBe(false);
    const before = (
      await pool.query("SELECT generation FROM east_sound.notification_rules")
    ).rows[0].generation;
    expect(
      (await syncPostgresRules(config, user, await readTracks())).unchanged,
    ).toBe(true);
    expect(
      (await pool.query("SELECT generation FROM east_sound.notification_rules"))
        .rows[0].generation,
    ).toBe(before);
    await appendCapturedSpins([spin("qa-late-history")]);
    expect((await counts()).jobs).toBe(0);
  });
  it("uses global FM counters before scopes, supports exact milestones and optional every-N milestones", async () => {
    const config = optedInPreferences({
      triggers: ["milestone"],
      milestones: [2, 4],
    });
    await syncPostgresRules(config, user, await readTracks());
    await pool.query(
      "UPDATE east_sound.notification_rules SET milestone_step=3 WHERE tenant_id=$1",
      [tenant],
    );
    await pool.query(
      "UPDATE east_sound.notification_rules SET activated_at=clock_timestamp()-interval '30 days' WHERE tenant_id=$1",
      [tenant],
    );
    for (let i = 1; i <= 4; i++)
      await appendCapturedSpins([spin(`qa-milestone-${i}`)]);
    expect((await counts()).jobs).toBe(3);
    expect(
      (
        await pool.query(
          "SELECT payload->>'ordinal' AS ordinal FROM east_sound.notification_outbox ORDER BY (payload->>'ordinal')::int",
        )
      ).rows,
    ).toEqual([{ ordinal: "2" }, { ordinal: "3" }, { ordinal: "4" }]);
  });
  it("never produces first/milestone jobs for TV or unmatched captures, but retains their audit records", async () => {
    await configure();
    await appendCapturedSpins([
      spin("qa-tv", { stationId: "nbs-tv-kla" }),
      spin("qa-unknown", { trackId: null, isrc: null }),
    ]);
    expect(await counts()).toEqual({ logs: 2, keys: 2, jobs: 0 });
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM east_sound.track_spin_totals",
        )
      ).rows[0].n,
    ).toBe(0);
  });
  it("scopes all-track rules to their tenant AND explicitly entitled tracks, and rejects cross-tenant references", async () => {
    await configure();
    const other = randomUUID();
    await seedPostgres(pool, other);
    const station = (
      await pool.query(
        "SELECT id FROM east_sound.stations WHERE tenant_id=$1 LIMIT 1",
        [other],
      )
    ).rows[0].id;
    const track = (
      await pool.query(
        "SELECT id FROM east_sound.tracks WHERE tenant_id=$1 LIMIT 1",
        [tenant],
      )
    ).rows[0].id;
    await expect(
      pool.query(
        `INSERT INTO east_sound.airplay_logs(tenant_id,provider_event_id,station_id,track_id,played_at,duration_played,confidence_score)
      VALUES($1,'qa-cross-tenant',$2,$3,clock_timestamp()-interval '1 minute',1,98)`,
        [other, station, track],
      ),
    ).rejects.toBeTruthy();
    await pool.query(
      "DELETE FROM east_sound.subscriber_track_access WHERE tenant_id=$1",
      [tenant],
    );
    await appendCapturedSpins([spin("qa-no-entitlement")]);
    expect((await counts()).jobs).toBe(0);
  });
  it("lets independent workers claim disjoint batches using SKIP LOCKED", async () => {
    await configure(["prime"]);
    const day = eatDate(new Date(Date.now() - 86400000).toISOString());
    await appendCapturedSpins(
      Array.from({ length: 30 }, (_, i) =>
        spin(`qa-queue-${i}`, {
          detectedAt: new Date(
            `${day}T17:05:${String(i).padStart(2, "0")}+03:00`,
          ).toISOString(),
        }),
      ),
    );
    const [one, two] = await Promise.all([
      claimPostgresNotifications(pool, tenant, ["whatsapp"]),
      claimPostgresNotifications(pool, tenant, ["whatsapp"]),
    ]);
    expect(one.length + two.length).toBe(30);
    expect(new Set([...one, ...two].map((row) => row.id)).size).toBe(30);
  });
  it("recovers crashed leases and fences stale worker completions", async () => {
    await configure();
    await appendCapturedSpins([spin("qa-lease")]);
    const first = (
      await claimPostgresNotifications(pool, tenant, ["whatsapp"])
    )[0];
    await pool.query(
      "UPDATE east_sound.notification_outbox SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
      [first.id],
    );
    const second = (
      await claimPostgresNotifications(pool, tenant, ["whatsapp"])
    )[0];
    expect(second.attempts).toBe(2);
    expect(second.lease_token).not.toBe(first.lease_token);
    expect(await finishPostgresNotification(pool, first, accepted)).toBeNull();
    expect(await finishPostgresNotification(pool, second, accepted)).toBe(
      "sent",
    );
    expect(
      await claimPostgresNotifications(pool, tenant, ["whatsapp"]),
    ).toEqual([]);
  });
  it("backs off retryable errors, terminates permanent errors and terminalizes exhausted crashed attempts", async () => {
    await configure();
    await appendCapturedSpins([spin("qa-retry")]);
    const first = (
      await claimPostgresNotifications(pool, tenant, ["whatsapp"])
    )[0];
    expect(await finishPostgresNotification(pool, first, retry)).toBe(
      "pending",
    );
    expect(
      await claimPostgresNotifications(pool, tenant, ["whatsapp"]),
    ).toEqual([]);
    await pool.query(
      "UPDATE east_sound.notification_outbox SET available_at=clock_timestamp()-interval '1 second'",
    );
    const second = (
      await claimPostgresNotifications(pool, tenant, ["whatsapp"])
    )[0];
    expect(second.attempts).toBe(2);
    await pool.query(
      "UPDATE east_sound.notification_outbox SET attempts=max_attempts,lease_expires_at=clock_timestamp()-interval '1 second'",
    );
    expect(
      await claimPostgresNotifications(pool, tenant, ["whatsapp"]),
    ).toEqual([]);
    expect(
      (
        await pool.query(
          "SELECT status,error_code FROM east_sound.notification_outbox",
        )
      ).rows[0],
    ).toEqual({ status: "failed", error_code: "attempt_limit" });
  });
  it("dispatches accepted/retry/permanent outcomes without holding a database transaction over provider I/O", async () => {
    await configure();
    await appendCapturedSpins([spin("qa-send")]);
    const deliver = vi.fn(async () => {
      expect(
        (
          await pool.query(
            "SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name='east-sound' AND state='idle in transaction'",
          )
        ).rows[0].n,
      ).toBe(0);
      return accepted;
    });
    expect(await processPostgresOutbox(pool, tenant, deliver)).toMatchObject({
      attempted: 1,
      accepted: 1,
      retry: 0,
      failed: 0,
      leaseLost: 0,
    });
    expect(deliver).toHaveBeenCalledOnce();
  });
  it("cancels queued deliveries after consent/rule revocation without calling any provider", async () => {
    await configure();
    await appendCapturedSpins([spin("qa-revoked")]);
    await pool.query(
      "UPDATE east_sound.notification_rules SET is_active=false",
    );
    const deliver = vi.fn().mockResolvedValue(accepted);
    expect(await processPostgresOutbox(pool, tenant, deliver)).toMatchObject({
      attempted: 0,
      accepted: 0,
    });
    expect(deliver).not.toHaveBeenCalled();
    expect(
      (
        await pool.query(
          "SELECT status,error_code FROM east_sound.notification_outbox",
        )
      ).rows[0],
    ).toEqual({ status: "failed", error_code: "rule_inactive" });
  });
  it("uses transactional ISRC reservations and preserves real capture history when a master is soft-deleted", async () => {
    const reservations = await Promise.all(
      Array.from({ length: 8 }, () => reserveIsrc("2026-11-01")),
    );
    expect(new Set(reservations).size).toBe(8);
    const track = await addTrack({
      title: "QA owned master",
      primaryArtist: "QA Artist",
      featuredArtists: [],
      releaseDate: "2026-01-01",
      isrc: reservations[0],
      fileName: "qa.wav",
      format: "WAV",
      mimeType: "audio/wav",
      sizeBytes: 44,
      durationSec: 0.375,
      storedName: null,
    });
    expect(
      (
        await pool.query(
          "SELECT duration_seconds FROM east_sound.tracks WHERE tenant_id=$1 AND external_key=$2",
          [tenant, track.id],
        )
      ).rows[0].duration_seconds,
    ).toBe(0.375);
    await appendCapturedSpins([
      spin("qa-before-delete", {
        trackId: track.id,
        title: track.title,
        primaryArtist: track.primaryArtist,
        isrc: track.isrc,
      }),
    ]);
    expect((await deleteTrack(track.id)).deleted).toBe(true);
    expect((await readTracks()).some((row) => row.id === track.id)).toBe(false);
    expect((await readCapturedSpins())[0].trackId).toBe(track.id);
  });
  it("uses shared database leases and fenced retries for the existing scheduled PDF/email digest endpoint", async () => {
    const claims = await Promise.all(
      Array.from({ length: 6 }, () => claimDelivery("qa-digest", "email")),
    );
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await finishDelivery("qa-digest", retry, 1)).toBe("retry");
    expect(await claimDelivery("qa-digest", "email")).toBeNull();
    await pool.query(
      "UPDATE east_sound.scheduled_delivery_attempts SET next_attempt_at=clock_timestamp()-interval '1 second'",
    );
    expect((await claimDelivery("qa-digest", "email"))?.attempts).toBe(2);
    expect(await finishDelivery("qa-digest", accepted, 1)).toBeUndefined();
    expect(await finishDelivery("qa-digest", accepted, 2)).toBe("accepted");
  });
  it("never falls back to or overwrites the file catalogue when PostgreSQL is selected", async () => {
    const jsonDir = path.join(directory, "unrelated-json");
    await mkdir(jsonDir, { recursive: true });
    await writeFile(
      path.join(jsonDir, "tracks.json"),
      "private-unrelated-content",
    );
    expect(await readTracks()).toHaveLength(12);
    expect(await readFile(path.join(jsonDir, "tracks.json"), "utf8")).toBe(
      "private-unrelated-content",
    );
    vi.stubEnv("EAST_SOUND_TENANT_ID", randomUUID());
    expect(await readTracks()).toEqual([]);
    expect(await readFile(path.join(jsonDir, "tracks.json"), "utf8")).toBe(
      "private-unrelated-content",
    );
  });

  it("executes custom-threshold jobs through the existing safe provider adapter without a simulated send", async () => {
    await configure();
    await pool.query(
      "UPDATE east_sound.notification_rules SET trigger_type='custom_threshold',custom_threshold=2",
    );
    await pool.query(
      "UPDATE east_sound.notification_rules SET activated_at=clock_timestamp()-interval '30 days'",
    );
    await appendCapturedSpins([spin("qa-custom-one"), spin("qa-custom-two")]);
    expect((await counts()).jobs).toBe(1);
    expect(await processPostgresOutbox(pool, tenant)).toMatchObject({
      attempted: 1,
      accepted: 1,
    });
    expect(transport.alert).toHaveBeenCalledOnce();
    expect(transport.alert.mock.calls[0][0]).toMatchObject({
      source: "captured",
      trigger: "custom_threshold",
      ordinal: 2,
      milestone: 2,
    });
    expect(transport.alert.mock.calls[0][0].message).toContain(
      "Custom threshold: 2",
    );
  });
  it("preserves WhatsApp, real email and webhook routing in persisted rules (provider calls mocked)", async () => {
    const config = optedInPreferences({
      triggers: ["first"],
      channels: ["whatsapp", "email", "webhook"],
    });
    config.webhooks = [
      {
        id: "qa-hook",
        label: "QA relay",
        kind: "json",
        url: "https://relay.example.com/airplay",
        enabled: true,
      },
    ];
    vi.stubEnv("RESEND_API_KEY", "qa-only");
    vi.stubEnv("EAST_SOUND_EMAIL_FROM", "qa-sender@example.com");
    vi.stubEnv(
      "EAST_SOUND_WEBHOOK_ALLOWLIST",
      JSON.stringify([config.webhooks[0].url]),
    );
    vi.stubEnv("EAST_SOUND_WEBHOOK_SECRET", "s".repeat(40));
    await syncPostgresRules(config, user, await readTracks());
    await pool.query(
      "UPDATE east_sound.notification_rules SET activated_at=clock_timestamp()-interval '30 days'",
    );
    await appendCapturedSpins([spin("qa-three-channels")]);
    expect(await processPostgresOutbox(pool, tenant)).toMatchObject({
      attempted: 3,
      accepted: 3,
    });
    expect(
      new Set(transport.alert.mock.calls.map((call) => call[0].channel)),
    ).toEqual(new Set(["whatsapp", "email", "webhook"]));
    const whatsapp = transport.alert.mock.calls.find(
      (call) => call[0].channel === "whatsapp",
    )!;
    expect(whatsapp[1].whatsapp).toMatchObject({
      phone: "+256772123456",
      consent: true,
    });
    const email = transport.alert.mock.calls.find(
      (call) => call[0].channel === "email",
    )!;
    expect(email[1].email).toMatchObject({
      address: "qa-recipient@example.com",
      consent: true,
    });
    const webhook = transport.alert.mock.calls.find(
      (call) => call[0].channel === "webhook",
    )!;
    expect(webhook[2]).toMatchObject({
      url: "https://relay.example.com/airplay",
      kind: "json",
      enabled: true,
    });
  });
  it("evaluates prime-time boundaries in EAT, not the server timezone", async () => {
    await configure(["prime"]);
    const day = eatDate(new Date(Date.now() - 86400000).toISOString());
    const times = [
      "06:00:00",
      "09:59:59",
      "10:00:00",
      "16:00:00",
      "19:59:59",
      "20:00:00",
    ];
    await appendCapturedSpins(
      times.map((time, index) =>
        spin("qa-eat-" + index, {
          detectedAt: new Date(day + "T" + time + "+03:00").toISOString(),
        }),
      ),
    );
    expect((await counts()).jobs).toBe(4);
    expect(
      (
        await pool.query(
          "SELECT dedupe_key FROM east_sound.notification_outbox ORDER BY dedupe_key",
        )
      ).rows.map((row) => row.dedupe_key),
    ).toEqual([
      "prime_time:qa-eat-0",
      "prime_time:qa-eat-1",
      "prime_time:qa-eat-3",
      "prime_time:qa-eat-4",
    ]);
  });
  it("rolls back a valid prefix when any capture violates a database invariant", async () => {
    await configure();
    await expect(
      appendCapturedSpins([
        spin("qa-valid-prefix"),
        spin("qa-future", {
          detectedAt: new Date(Date.now() + 3600000).toISOString(),
        }),
      ]),
    ).rejects.toBeTruthy();
    expect(await counts()).toEqual({ logs: 0, keys: 0, jobs: 0 });
    const station = (
      await pool.query(
        "SELECT id FROM east_sound.stations WHERE tenant_id=$1 AND external_key='capital-kla'",
        [tenant],
      )
    ).rows[0].id;
    await expect(
      pool.query(
        `INSERT INTO east_sound.airplay_logs(tenant_id,provider_event_id,station_id,played_at,duration_played,confidence_score,audio_snippet_url,audio_snippet_sha256)
      VALUES($1,'qa-missing-clip-duration',$2,clock_timestamp()-interval '1 minute',1,98,'https://evidence.example.com/clip.wav',$3)`,
        [tenant, station, "a".repeat(64)],
      ),
    ).rejects.toBeTruthy();
    expect(await counts()).toEqual({ logs: 0, keys: 0, jobs: 0 });
  });
  it("protects rule registration/status and persistent dispatch with server-scoped authentication", async () => {
    const rules = await import("@/app/api/notifications/rules/route");
    const dispatch = await import("@/app/api/notifications/dispatch/route");
    const headers = {
      authorization: "Bearer " + process.env.EAST_SOUND_NOTIFICATION_TOKEN,
      "content-type": "application/json",
    };
    expect(
      (
        await rules.GET(
          new Request("https://app.example.com/api/notifications/rules"),
        )
      ).status,
    ).toBe(401);
    const config = optedInPreferences({ triggers: ["first"] });
    expect(
      (
        await rules.POST(
          new Request("https://app.example.com/api/notifications/rules", {
            method: "POST",
            headers,
            body: JSON.stringify({
              config,
              user_id: randomUUID(),
              tenant_id: randomUUID(),
            }),
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await pool.query(
          "SELECT user_id,tenant_id FROM east_sound.notification_rules",
        )
      ).rows,
    ).toEqual([{ user_id: user, tenant_id: tenant }]);
    await pool.query(
      "UPDATE east_sound.notification_rules SET activated_at=clock_timestamp()-interval '30 days'",
    );
    await appendCapturedSpins([spin("qa-http-persistent")]);
    const result = await dispatch.POST(
      new Request("https://app.example.com/api/notifications/dispatch", {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "instant" }),
      }),
    );
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ attempted: 1, accepted: 1 });
    const status = await rules.GET(
      new Request("https://app.example.com/api/notifications/rules", {
        headers,
      }),
    );
    const json = await status.json();
    expect(json.outbox).toEqual({ sent: "1" });
    expect(JSON.stringify(json)).not.toContain("+256");
  });
  it("refuses live dispatch without explicit enable and never consumes attempts for an unconfigured channel", async () => {
    await configure();
    await appendCapturedSpins([spin("qa-live-gate")]);
    vi.stubEnv("EAST_SOUND_LIVE_NOTIFICATIONS", "false");
    await expect(processPostgresOutbox(pool, tenant)).rejects.toThrow(
      /disabled/,
    );
    vi.stubEnv("EAST_SOUND_LIVE_NOTIFICATIONS", "true");
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EAST_SOUND_WEBHOOK_ALLOWLIST", "[]");
    await expect(processPostgresOutbox(pool, tenant)).rejects.toThrow(
      /Configure at least one/,
    );
    expect(
      (
        await pool.query(
          "SELECT status,attempts FROM east_sound.notification_outbox",
        )
      ).rows,
    ).toEqual([{ status: "pending", attempts: 0 }]);
  });
  it("fails closed during a database outage rather than reading or rewriting JSON", async () => {
    const folder = path.join(directory, "unrelated-json");
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, "tracks.json"), "do-not-replace");
    await closePostgresPool();
    vi.stubEnv("DATABASE_URL", "postgresql://postgres:qa@127.0.0.1:1/postgres");
    try {
      await expect(readTracks()).rejects.toBeTruthy();
      expect(await readFile(path.join(folder, "tracks.json"), "utf8")).toBe(
        "do-not-replace",
      );
    } finally {
      await closePostgresPool();
      vi.stubEnv("DATABASE_URL", connection);
    }
    expect(await readTracks()).toHaveLength(12);
  });

  it("returns HTTP 409 for changed reuse of an immutable provider capture ID", async () => {
    const api = await import("@/app/api/playout/route");
    vi.stubEnv("EAST_SOUND_INGEST_TOKEN", "qa-ingest-" + randomUUID());
    const record = spin("qa-http-conflict");
    const request = (duration: number) =>
      new Request("https://app.example.com/api/playout", {
        method: "POST",
        headers: {
          authorization: "Bearer " + process.env.EAST_SOUND_INGEST_TOKEN,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          records: [{ ...record, durationSec: duration }],
        }),
      });
    expect((await api.POST(request(record.durationSec))).status).toBe(201);
    const duplicate = await api.POST(request(record.durationSec));
    expect(await duplicate.json()).toEqual({ inserted: 0, duplicates: 1 });
    expect((await api.POST(request(record.durationSec + 1))).status).toBe(409);
    expect((await counts()).logs).toBe(1);
  });
  it("does not let legacy instant HTTP configuration create a second dispatch path", async () => {
    await configure();
    await appendCapturedSpins([spin("qa-no-double-send")]);
    const api = await import("@/app/api/notifications/dispatch/route");
    const response = await api.POST(
      new Request("https://app.example.com/api/notifications/dispatch", {
        method: "POST",
        headers: {
          authorization: "Bearer " + process.env.EAST_SOUND_NOTIFICATION_TOKEN,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "instant",
          config: optedInPreferences(),
        }),
      }),
    );
    expect(response.status).toBe(422);
    expect(transport.alert).not.toHaveBeenCalled();
    expect(
      (
        await pool.query(
          "SELECT attempts,status FROM east_sound.notification_outbox",
        )
      ).rows,
    ).toEqual([{ attempts: 0, status: "pending" }]);
  });
  it("counts out-of-scope FM history before evaluating a station-filtered milestone", async () => {
    const config = optedInPreferences({
      triggers: ["milestone"],
      milestones: [2],
      stationId: "galaxy-kla",
    });
    await syncPostgresRules(config, user, await readTracks());
    await pool.query(
      "UPDATE east_sound.notification_rules SET activated_at=clock_timestamp()-interval '30 days'",
    );
    await appendCapturedSpins([spin("qa-outside-station")]);
    await appendCapturedSpins([
      spin("qa-inside-station", { stationId: "galaxy-kla" }),
    ]);
    expect((await counts()).jobs).toBe(1);
    expect(
      (
        await pool.query(
          "SELECT payload->>'ordinal' AS ordinal,payload->>'stationId' AS station FROM east_sound.notification_outbox",
        )
      ).rows,
    ).toEqual([{ ordinal: "2", station: "galaxy-kla" }]);
  });
  it("uses a new server generation for an edited activation marker, never a backdated browser activation", async () => {
    const config = await configure();
    const original = (
      await pool.query("SELECT generation FROM east_sound.notification_rules")
    ).rows[0].generation;
    config.subscriptions[0].activatedAt = new Date(
      Date.now() - 7 * 86400000,
    ).toISOString();
    expect(
      (await syncPostgresRules(config, user, await readTracks())).unchanged,
    ).toBe(false);
    const changed = (
      await pool.query(
        "SELECT generation,activated_at FROM east_sound.notification_rules",
      )
    ).rows[0];
    expect(changed.generation).not.toBe(original);
    expect(changed.activated_at.getTime()).toBeGreaterThan(Date.now() - 5000);
    await appendCapturedSpins([spin("qa-no-browser-backdate")]);
    expect((await counts()).jobs).toBe(0);
  });
  it("handles permanent provider failures and stores bounded provider identifiers without losing accepted results", async () => {
    await configure();
    await appendCapturedSpins([spin("qa-permanent")]);
    const claim = (
      await claimPostgresNotifications(pool, tenant, ["whatsapp"])
    )[0];
    expect(
      await finishPostgresNotification(pool, claim, {
        accepted: false,
        retryable: false,
        code: "provider_http_400",
      }),
    ).toBe("failed");
    expect(
      (
        await pool.query(
          "SELECT processed_at FROM east_sound.notification_outbox",
        )
      ).rows[0].processed_at,
    ).toBeInstanceOf(Date);
    // Change this managed principal to a second-spin milestone, with no real provider call.
    const config = optedInPreferences({
      triggers: ["milestone"],
      milestones: [2],
    });
    await syncPostgresRules(config, user, await readTracks());
    await pool.query(
      "UPDATE east_sound.notification_rules SET activated_at=clock_timestamp()-interval '30 days'",
    );
    await appendCapturedSpins([spin("qa-accepted-big-id")]);
    const next = (
      await claimPostgresNotifications(pool, tenant, ["whatsapp"])
    )[0];
    expect(
      await finishPostgresNotification(pool, next, {
        ...accepted,
        providerId: "a".repeat(600),
      }),
    ).toBe("sent");
    expect(
      (
        await pool.query(
          "SELECT provider_id FROM east_sound.notification_outbox WHERE id=$1",
          [next.id],
        )
      ).rows[0].provider_id,
    ).toBeNull();
  });

  it("persists real accounts and hashed sessions with tenant separation and immediate disabled/revoked-session rejection", async () => {
    const auth = await import("@/lib/auth-core"),
      security = await import("@/lib/security-store");
    const actor = await testActor("artist", "same-address@example.com");
    expect((await auth.sessionForToken(actor.token))?.user.id).toBe(
      actor.user.id,
    );
    const raw = await pool.query(
      "SELECT token_hash FROM east_sound.auth_sessions WHERE user_id=$1",
      [actor.user.id],
    );
    expect(raw.rows[0].token_hash).toBe(auth.tokenHash(actor.token));
    expect(raw.rows[0].token_hash).not.toBe(actor.token);
    const otherTenant = randomUUID();
    await seedPostgres(pool, otherTenant);
    vi.stubEnv("EAST_SOUND_TENANT_ID", otherTenant);
    expect(await auth.sessionForToken(actor.token)).toBeNull();
    expect(await security.findAccount(actor.user.id, true)).toBeNull();
    const other = await testActor("artist", actor.user.email);
    expect(other.user.id).not.toBe(actor.user.id);
    vi.stubEnv("EAST_SOUND_TENANT_ID", tenant);
    await pool.query(
      "UPDATE east_sound.auth_users SET disabled=true WHERE id=$1",
      [actor.user.id],
    );
    expect(await auth.sessionForToken(actor.token)).toBeNull();
    await pool.query(
      "UPDATE east_sound.auth_users SET disabled=false WHERE id=$1",
      [actor.user.id],
    );
    await security.revokeSession(auth.tokenHash(actor.token));
    expect(await auth.sessionForToken(actor.token)).toBeNull();
  });

  it("serializes account documents under concurrent co-signers and enforces composite tenant-owner foreign keys", async () => {
    const actor = await testActor(),
      security = await import("@/lib/security-store");
    await Promise.all(
      Array.from({ length: 24 }, () =>
        security.mutateAccountDocument<number>(
          actor.user.id,
          "qa-counter",
          "same-document",
          (n) => (n ?? 0) + 1,
        ),
      ),
    );
    expect(
      await security.readAccountDocument(
        actor.user.id,
        "qa-counter",
        "same-document",
      ),
    ).toBe(24);
    const secondTenant = randomUUID();
    await seedPostgres(pool, secondTenant);
    vi.stubEnv("EAST_SOUND_TENANT_ID", secondTenant);
    expect(
      await security.readAccountDocument(
        actor.user.id,
        "qa-counter",
        "same-document",
      ),
    ).toBeNull();
    await expect(
      security.writeAccountDocument(actor.user.id, "qa-counter", 999),
    ).rejects.toMatchObject({ code: "23503" });
    vi.stubEnv("EAST_SOUND_TENANT_ID", tenant);
    expect(
      await security.readAccountDocument(
        actor.user.id,
        "qa-counter",
        "same-document",
      ),
    ).toBe(24);
  });

  it("persists owner-bound masters/preferences, encrypts hook secrets and automatically queues only that account's new captures", async () => {
    vi.stubEnv("EAST_SOUND_SECRET_KEY", "ab".repeat(32));
    const owner = await testActor(),
      other = await testActor(),
      tracksApi = await import("@/app/api/tracks/route"),
      prefs = await import("@/lib/account-notifications");
    const first = await deliveryFixture(owner, "UG-ESD-26-08101"),
      second = await deliveryFixture(other, "UG-ESD-26-08102");
    const deliveredA = await tracksApi.POST(
        owner.request("/api/tracks", { method: "POST", body: first.form() }),
      ),
      deliveredB = await tracksApi.POST(
        other.request("/api/tracks", { method: "POST", body: second.form() }),
      );
    expect(deliveredA.status).toBe(201);
    expect(deliveredB.status).toBe(201);
    const a = (await deliveredA.json()).track,
      b = (await deliveredB.json()).track;
    const config = defaultNotificationPreferences(),
      secret = "qa-postgres-encrypted-only-endpoint-secret";
    config.whatsapp = {
      ...config.whatsapp,
      phone: "+256772000000",
      consent: true,
    };
    config.webhooks = [
      {
        id: "label",
        label: "QA",
        kind: "json",
        url: "https://hooks.example.com/airplay",
        enabled: true,
        secret,
      },
    ];
    config.subscriptions = [
      {
        id: "all-owned",
        name: "Owned catalogue",
        trackId: "all",
        stationId: "all",
        region: "All",
        channels: ["whatsapp", "webhook"],
        triggers: ["first"],
        milestones: [],
        enabled: true,
        createdAt: "2000-01-01T00:00:00.000Z",
      },
    ];
    const saved = await prefs.saveAccountPreferences(owner.user, config);
    expect(JSON.stringify(saved)).not.toContain(secret);
    expect(saved.webhooks[0].secretConfigured).toBe(true);
    const stored = await pool.query(
      "SELECT value::text FROM east_sound.account_documents WHERE owner_id=$1 AND kind='notification-preferences'",
      [owner.user.id],
    );
    expect(stored.rows[0].value).not.toContain(secret);
    expect(stored.rows[0].value).toContain("v1.");
    await appendCapturedSpins([
      spin("other-private-capture", {
        trackId: b.id,
        isrc: b.isrc,
        detectedAt: new Date().toISOString(),
      }),
    ]);
    expect((await counts()).jobs).toBe(0);
    await appendCapturedSpins([
      spin("owned-private-capture", {
        trackId: a.id,
        isrc: a.isrc,
        detectedAt: new Date().toISOString(),
      }),
    ]);
    expect((await counts()).jobs).toBe(2);
    const outbox = await import("@/app/api/notifications/outbox/route");
    expect(
      (
        await (
          await outbox.GET(owner.request("/api/notifications/outbox"))
        ).json()
      ).jobs,
    ).toHaveLength(2);
    expect(
      (
        await (
          await outbox.GET(other.request("/api/notifications/outbox"))
        ).json()
      ).jobs,
    ).toEqual([]);
    const captured = await import("@/app/api/playout/route");
    expect(
      (
        await (
          await captured.GET(
            owner.request("/api/playout?userId=" + other.user.id + "&role=cmo"),
          )
        ).json()
      ).records.map((r: { id: string }) => r.id),
    ).toEqual(["owned-private-capture"]);
    expect(transport.alert).not.toHaveBeenCalled();
  });

  it("commits a CMO review and audit atomically, handles retries idempotently and refuses audit rollback gaps", async () => {
    const cmo = await testActor("cmo"),
      service = await import("@/lib/rights-reviews"),
      security = await import("@/lib/security-store"),
      reference = (await readTracks())[0];
    const input = {
      requestId: randomUUID(),
      trackId: reference.id,
      decision: "needs-correction",
      note: "Obtain independent approvals before treating public credits as owned rights.",
    };
    const results = await Promise.all([
      service.recordRightsReview(cmo.user, input),
      service.recordRightsReview(cmo.user, input),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(await service.listRightsReviews()).toHaveLength(1);
    expect(
      (await security.readSecurityAudit()).filter(
        (r) => r.action === "rights.review_recorded",
      ),
    ).toHaveLength(1);
    await expect(
      security.mutateAccountDocument(
        cmo.user.id,
        "qa-audit-rollback",
        "bad",
        () => ({ shouldNot: "commit" }),
        {
          actorId: cmo.user.id,
          action: "x".repeat(81),
          objectKey: "bad",
          detail: {},
        },
      ),
    ).rejects.toMatchObject({ code: "22001" });
    expect(
      await security.readAccountDocument(
        cmo.user.id,
        "qa-audit-rollback",
        "bad",
      ),
    ).toBeNull();
  });

  it("provisions an assigned broadcaster through the actual trusted account CLI without logging passwords", async () => {
    const run = promisify(execFile),
      email = "qa-cli-manager@example.com",
      password = "Only a temporary CLI provisioning password!";
    const result = await run(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "scripts/account.ts",
        "--role",
        "broadcaster",
        "--email",
        email,
        "--name",
        "QA Manager",
        "--stations",
        "cbs-kla",
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          EAST_SOUND_ACCOUNT_PASSWORD: password,
          DOTENV_CONFIG_QUIET: "true",
        },
        timeout: 30000,
      },
    );
    expect(result.stdout).not.toContain(password);
    expect(JSON.parse(result.stdout)).toMatchObject({
      created: true,
      role: "broadcaster",
      stationIds: ["cbs-kla"],
    });
    const auth = await import("@/lib/auth-core"),
      account = await auth.loginAccount(email, password);
    expect(account.role).toBe("broadcaster");
    expect(account.stationIds).toEqual(["cbs-kla"]);
  });

  it("runs the actual migration, seed and one-batch worker CLIs with server-only module conditions", async () => {
    const run = promisify(execFile);
    const options = {
      cwd: process.cwd(),
      env: { ...process.env, DOTENV_CONFIG_QUIET: "true" },
      timeout: 30000,
    };
    const node = ["--conditions=react-server", "--import", "tsx"];
    const migration = await run(
      process.execPath,
      [...node, "scripts/database.ts", "migrate"],
      options,
    );
    expect(migration.stdout).toContain('"migrationsApplied":[]');
    const seed = await run(
      process.execPath,
      [...node, "scripts/database.ts", "seed"],
      options,
    );
    expect(seed.stdout).toContain('"referencesInserted":0');
    expect((await counts()).jobs).toBe(0);
    const worker = await run(
      process.execPath,
      [...node, "scripts/notification-worker.ts", "--once"],
      options,
    );
    expect(worker.stdout).toContain("notification worker started");
    expect(worker.stdout).not.toContain("qa-no-provider-calls");
    expect((await counts()).jobs).toBe(0);
  });
});
