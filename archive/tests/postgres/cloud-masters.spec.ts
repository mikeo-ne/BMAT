import { createHmac, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:net";
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
const storage = vi.hoisted(() => ({
  probe: vi.fn(),
  verify: vi.fn(),
  remove: vi.fn(),
  response: vi.fn(),
}));
vi.mock("@/lib/private-blob", async (original) => ({
  ...(await original<typeof import("@/lib/private-blob")>()),
  assertPrivateBlobStore: storage.probe,
  verifyPrivateMaster: storage.verify,
  removePrivateBlob: storage.remove,
  privateMasterResponse: storage.response,
}));
import { createPostgresPool, closePostgresPool } from "@/lib/postgres/pool";
import { migratePostgres } from "@/lib/postgres/migrate";
import { seedPostgres } from "@/lib/postgres/catalogue";
import { HttpError } from "@/lib/auth-core";
import { testActor } from "@/tests/fixtures/auth";
import { deliveryFixture } from "@/tests/fixtures/master";
import {
  prepareMasterUpload,
  completeMasterUpload,
  masterUploadTokenPolicy,
  MASTER_UPLOAD_KIND,
  cleanupMasterUploads,
  cancelMasterUpload,
} from "@/lib/cloud-masters";
import type { MasterUploadIntent } from "@/lib/cloud-masters";
import {
  readAccountDocument,
  mutateAccountDocument,
} from "@/lib/security-store";
import { ownerAgreement, cancelAgreement } from "@/lib/release-agreements";
import { readTracks, deleteTrack } from "@/lib/store";
import { POST as uploadToken } from "@/app/api/master-uploads/token/route";
import { POST as prepareRoute } from "@/app/api/master-uploads/route";
import { POST as completeRoute } from "@/app/api/master-uploads/[id]/route";
import { GET as audioRoute } from "@/app/api/tracks/[id]/route";
import { POST as legacyUpload } from "@/app/api/tracks/route";

let database: EmbeddedPostgres,
  pool: Pool,
  directory: string,
  connection: string,
  tenant: string;
beforeAll(async () => {
  await mkdir(".data/qa", { recursive: true });
  directory = await mkdtemp(
    path.join(process.cwd(), ".data/qa/pg-cloud-masters-"),
  );
  const listener = createServer();
  await new Promise<void>((resolve) =>
    listener.listen(0, "127.0.0.1", resolve),
  );
  const port = (listener.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) =>
    listener.close((error) => (error ? reject(error) : resolve())),
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
  await closePostgresPool();
  await pool?.end();
  await database?.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  await pool.query("TRUNCATE east_sound.tenants CASCADE");
  tenant = randomUUID();
  vi.stubEnv("EAST_SOUND_STORAGE_BACKEND", "postgres");
  vi.stubEnv("DATABASE_URL", connection);
  vi.stubEnv("EAST_SOUND_TENANT_ID", tenant);
  vi.stubEnv("EAST_SOUND_DATA_DIR", path.join(directory, "unused-files"));
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("EAST_SOUND_STATIC_EXPORT", "0");
  vi.stubEnv("EAST_SOUND_MASTER_STORAGE", "vercel-blob");
  vi.stubEnv(
    "BLOB_READ_WRITE_TOKEN",
    "vercel_blob_rw_teststore_" + "q".repeat(40),
  );
  vi.stubEnv("EAST_SOUND_APP_ORIGIN", "https://app.example.com");
  vi.stubEnv("EAST_SOUND_LIVE_NOTIFICATIONS", "false");
  vi.stubEnv("EAST_SOUND_WORKER_ENABLED", "0");
  vi.stubEnv("EAST_SOUND_SECRET_KEY", "ab".repeat(32));
  storage.probe.mockReset().mockResolvedValue(undefined);
  storage.verify.mockReset().mockResolvedValue("verified-etag");
  storage.remove.mockReset().mockResolvedValue(undefined);
  storage.response.mockReset().mockResolvedValue(new Response("qa-audio"));
  await seedPostgres(pool, tenant);
});
async function fixture(approved = true) {
  const actor = await testActor();
  const master = await deliveryFixture(actor, "UG-ESD-26-00420", approved);
  const input = {
    metadata: master.metadata,
    fingerprint: master.signature,
    agreementId: master.agreement.id,
    fileName: "qa-master.wav",
    sizeBytes: master.bytes.length,
    publicCharts: false,
  };
  return { actor, master, input };
}
async function prepared() {
  const f = await fixture();
  const result = await prepareMasterUpload(f.actor.user, f.input);
  if (!result.upload)
    throw new Error("Expected a fresh isolated upload intent.");
  return { ...f, id: result.upload.id, pathname: result.upload.pathname };
}
const doc = (owner: string, id: string) =>
  readAccountDocument<MasterUploadIntent>(owner, MASTER_UPLOAD_KIND, id);
async function expire(owner: string, id: string) {
  await pool.query(
    "UPDATE east_sound.account_documents SET value=jsonb_set(value,'{expiresAt}',to_jsonb((clock_timestamp()-interval '2 days')::text)),updated_at=clock_timestamp()-interval '2 days' WHERE tenant_id=$1 AND owner_id=$2 AND kind=$3 AND document_key=$4",
    [tenant, owner, MASTER_UPLOAD_KIND, id],
  );
}

describe("private cloud masters with real PostgreSQL transaction and ownership boundaries", () => {
  it("requires every approved source-bound agreement before probing storage or issuing a ticket", async () => {
    const f = await fixture(false);
    await expect(
      prepareMasterUpload(f.actor.user, f.input),
    ).rejects.toMatchObject({ status: 422 });
    expect(storage.probe).not.toHaveBeenCalled();
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM east_sound.account_documents WHERE kind=$1",
          [MASTER_UPLOAD_KIND],
        )
      ).rows[0].n,
    ).toBe(0);
  });
  it("rejects changed signed metadata, invalid fingerprints and oversized files before object I/O", async () => {
    const f = await fixture();
    await expect(
      prepareMasterUpload(f.actor.user, {
        ...f.input,
        metadata: { ...f.input.metadata, title: "Changed after approval" },
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      prepareMasterUpload(f.actor.user, {
        ...f.input,
        fingerprint: { ...f.input.fingerprint, digest: "0".repeat(64) },
      }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      prepareMasterUpload(f.actor.user, {
        ...f.input,
        sizeBytes: 80 * 1024 * 1024 + 1,
      }),
    ).rejects.toMatchObject({ status: 413 });
    expect(storage.probe).not.toHaveBeenCalled();
  });
  it("binds an exact non-overwritable multipart token policy to the signed-in artist, intent, file and canonical callback", async () => {
    const f = await prepared();
    const policy = await masterUploadTokenPolicy(
      f.actor.user,
      f.pathname,
      f.id,
      true,
    );
    expect(policy).toMatchObject({
      maximumSizeInBytes: f.master.bytes.length,
      allowedContentTypes: ["audio/wav"],
      addRandomSuffix: false,
      allowOverwrite: false,
      callbackUrl: "https://app.example.com/api/master-uploads/token",
    });
    expect(policy.validUntil).toBeLessThanOrEqual(Date.now() + 15 * 60000);
    const other = await testActor();
    await expect(
      masterUploadTokenPolicy(other.user, f.pathname, f.id, true),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      masterUploadTokenPolicy(f.actor.user, f.pathname + "-other", f.id, true),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      masterUploadTokenPolicy(f.actor.user, f.pathname, f.id, false),
    ).rejects.toMatchObject({ status: 422 });
  });
  it("authenticates HTTP token generation with the session and CSRF, not a supplied owner ID", async () => {
    const f = await prepared();
    const body = {
      type: "blob.generate-client-token",
      payload: { pathname: f.pathname, multipart: true, clientPayload: f.id },
    };
    const request = f.actor.request("/api/master-uploads/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const response = await uploadToken(request);
    expect(response.status).toBe(200);
    expect((await response.json()).clientToken).toMatch(/^vercel_blob_client_/);
    expect(
      (
        await uploadToken(
          new Request("https://app.example.com/api/master-uploads/token", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }),
        )
      ).status,
    ).toBe(401);
    const noCsrf = f.actor.request("/api/master-uploads/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    noCsrf.headers.delete("x-east-sound-csrf");
    expect((await uploadToken(noCsrf)).status).toBe(403);
  });
  it("verifies actual SDK callback HMAC before recording a receipt, and never equates a callback with delivery", async () => {
    const f = await prepared();
    const body = {
      type: "blob.upload-completed",
      payload: {
        blob: {
          pathname: f.pathname,
          url: `https://teststore.private.blob.vercel-storage.com/${f.pathname}`,
          downloadUrl: "https://example.invalid/unused",
          contentType: "audio/wav",
          contentDisposition: "attachment",
          etag: "callback-etag",
        },
        tokenPayload: JSON.stringify({
          ownerId: f.actor.user.id,
          id: f.id,
          pathname: f.pathname,
        }),
      },
    };
    const callback = (signature: string) =>
      new Request("https://app.example.com/api/master-uploads/token", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-vercel-signature": signature,
        },
        body: JSON.stringify(body),
      });
    expect((await uploadToken(callback("0".repeat(64)))).status).toBe(403);
    expect(
      (await doc(f.actor.user.id, f.id))?.callbackReceived,
    ).toBeUndefined();
    const signature = createHmac("sha256", process.env.BLOB_READ_WRITE_TOKEN!)
      .update(JSON.stringify(body))
      .digest("hex");
    expect((await uploadToken(callback(signature))).status).toBe(200);
    expect(await doc(f.actor.user.id, f.id)).toMatchObject({
      callbackReceived: true,
      status: "pending",
    });
    expect(
      (await readTracks()).filter((t) => t.origin === "delivered"),
    ).toHaveLength(0);
  });
  it("commits the intent, rights contract, master and audit together and makes completion safely replayable", async () => {
    const f = await prepared();
    const first = await completeMasterUpload(f.actor.user, f.id),
      replay = await completeMasterUpload(f.actor.user, f.id);
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.track.id).toBe(first.track.id);
    expect(first.track.audio.blob).toBeUndefined();
    expect(JSON.stringify(first)).not.toContain(f.pathname);
    const stored = (await readTracks()).find((t) => t.id === first.track.id)!;
    expect(stored.audio.blob).toMatchObject({
      provider: "vercel-blob",
      uploadId: f.id,
      etag: "verified-etag",
    });
    expect(stored.ownership?.approvalMethod).toBe("authenticated-account");
    expect(await doc(f.actor.user.id, f.id)).toMatchObject({
      status: "complete",
      trackId: first.track.id,
    });
    expect(
      (await ownerAgreement(f.actor.user, f.master.agreement.id)).status,
    ).toBe("delivered");
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM east_sound.security_audit WHERE action='master.delivered'",
        )
      ).rows[0].n,
    ).toBe(1);
    expect(storage.verify).toHaveBeenCalledTimes(1);
    expect(storage.remove).not.toHaveBeenCalled();
    const repeatedPrepare = await prepareMasterUpload(f.actor.user, f.input);
    expect(repeatedPrepare.track?.id).toBe(first.track.id);
    expect(repeatedPrepare.upload).toBeUndefined();
  });
  it("serializes simultaneous completions so only one transaction consumes a signed release", async () => {
    const f = await prepared();
    const second = await prepareMasterUpload(f.actor.user, f.input);
    const outcomes = await Promise.allSettled([
      completeMasterUpload(f.actor.user, f.id),
      completeMasterUpload(f.actor.user, second.upload!.id),
    ]);
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(
      (await readTracks()).filter(
        (t) => t.agreementId === f.master.agreement.id,
      ),
    ).toHaveLength(1);
    expect(storage.remove).not.toHaveBeenCalled();
  });
  it("rolls back both catalogue and agreement when the audit insert fails and keeps private bytes retryable", async () => {
    const f = await prepared();
    await pool.query(
      "ALTER TABLE east_sound.security_audit ADD CONSTRAINT qa_cloud_audit_failure CHECK(action<>'master.delivered')",
    );
    try {
      await expect(
        completeMasterUpload(f.actor.user, f.id),
      ).rejects.toBeDefined();
      expect(
        (await readTracks()).filter(
          (t) => t.agreementId === f.master.agreement.id,
        ),
      ).toHaveLength(0);
      expect(
        (await ownerAgreement(f.actor.user, f.master.agreement.id)).status,
      ).toBe("pending");
      expect((await doc(f.actor.user.id, f.id))?.status).toBe("pending");
      expect(storage.remove).not.toHaveBeenCalled();
    } finally {
      await pool.query(
        "ALTER TABLE east_sound.security_audit DROP CONSTRAINT qa_cloud_audit_failure",
      );
    }
    expect(
      (await completeMasterUpload(f.actor.user, f.id)).track.id,
    ).toBeTruthy();
  });
  it("fences an expired/replaced verification lease instead of letting an old verifier commit or reset it", async () => {
    const f = await prepared();
    let unblock!: () => void;
    let started!: () => void;
    const ready = new Promise<void>((r) => {
      started = r;
    });
    const wait = new Promise<void>((r) => {
      unblock = r;
    });
    storage.verify.mockImplementationOnce(async () => {
      started();
      await wait;
      return "etag";
    });
    const pending = completeMasterUpload(f.actor.user, f.id);
    await ready;
    await expect(
      completeMasterUpload(f.actor.user, f.id),
    ).rejects.toMatchObject({ status: 409 });
    expect(storage.verify).toHaveBeenCalledTimes(1);
    const replacement = randomUUID();
    await mutateAccountDocument<MasterUploadIntent>(
      f.actor.user.id,
      MASTER_UPLOAD_KIND,
      f.id,
      (current) => ({
        ...current!,
        leaseId: replacement,
        leaseUntil: new Date(Date.now() + 60000).toISOString(),
      }),
    );
    unblock();
    await expect(pending).rejects.toMatchObject({ status: 409 });
    expect((await doc(f.actor.user.id, f.id))?.leaseId).toBe(replacement);
    expect(
      (await readTracks()).filter(
        (t) => t.agreementId === f.master.agreement.id,
      ),
    ).toHaveLength(0);
  });
  it("rechecks a revoked artist and a cancelled agreement after object hashing but before committing", async () => {
    const f = await prepared();
    storage.verify.mockImplementationOnce(async () => {
      await pool.query(
        "UPDATE east_sound.auth_users SET disabled=true WHERE id=$1",
        [f.actor.user.id],
      );
      return "etag";
    });
    await expect(
      completeMasterUpload(f.actor.user, f.id),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      (await readTracks()).filter(
        (t) => t.agreementId === f.master.agreement.id,
      ),
    ).toHaveLength(0);
    await pool.query(
      "UPDATE east_sound.auth_users SET disabled=false WHERE id=$1",
      [f.actor.user.id],
    );
    await cancelAgreement(f.actor.user, f.master.agreement.id);
    await expect(
      completeMasterUpload(f.actor.user, f.id),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("rejects cross-account completion/playback and blocks serverless multipart buffering", async () => {
    const f = await prepared();
    const other = await testActor();
    expect(
      (
        await completeRoute(
          other.request(`/api/master-uploads/${f.id}`, { method: "POST" }),
          { params: Promise.resolve({ id: f.id }) },
        )
      ).status,
    ).toBe(404);
    const done = await completeMasterUpload(f.actor.user, f.id);
    expect(
      (
        await audioRoute(other.request(`/api/tracks/${done.track.id}`), {
          params: Promise.resolve({ id: done.track.id }),
        })
      ).status,
    ).toBe(404);
    expect(storage.response).not.toHaveBeenCalled();
    expect(
      (
        await audioRoute(f.actor.request(`/api/tracks/${done.track.id}`), {
          params: Promise.resolve({ id: done.track.id }),
        })
      ).status,
    ).toBe(200);
    const request = f.actor.request("/api/tracks", {
      method: "POST",
      body: "should-not-be-buffered",
    });
    const parser = vi.spyOn(request, "formData");
    expect((await legacyUpload(request)).status).toBe(409);
    expect(parser).not.toHaveBeenCalled();
  });
  it("rejects guests and mock/privileged accounts before cloud preparation", async () => {
    const f = await fixture();
    expect(
      (
        await prepareRoute(
          new Request("https://app.example.com/api/master-uploads", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(f.input),
          }),
        )
      ).status,
    ).toBe(401);
    await expect(
      prepareMasterUpload({ ...f.actor.user, mock: true }, f.input),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      prepareMasterUpload({ ...f.actor.user, role: "cmo" }, f.input),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("cleans expired unreferenced uploads but never purges a retained soft-deleted master", async () => {
    const f = await prepared();
    await expire(f.actor.user.id, f.id);
    expect(await cleanupMasterUploads()).toEqual({ cleaned: 1, failed: 0 });
    expect(storage.remove).toHaveBeenCalledWith(f.pathname);
    expect((await doc(f.actor.user.id, f.id))?.status).toBe("cleaned");
    await expect(
      completeMasterUpload(f.actor.user, f.id),
    ).rejects.toMatchObject({ status: 409 });
    const next = await fixture();
    const intent = await prepareMasterUpload(next.actor.user, next.input);
    const done = await completeMasterUpload(next.actor.user, intent.upload!.id);
    await deleteTrack(done.track.id);
    await mutateAccountDocument<MasterUploadIntent>(
      next.actor.user.id,
      MASTER_UPLOAD_KIND,
      intent.upload!.id,
      (current) => ({ ...current!, status: "pending" }),
    );
    await expire(next.actor.user.id, intent.upload!.id);
    storage.remove.mockClear();
    expect(await cleanupMasterUploads()).toEqual({ cleaned: 0, failed: 0 });
    expect(storage.remove).not.toHaveBeenCalled();
    expect((await doc(next.actor.user.id, intent.upload!.id))?.status).toBe(
      "complete",
    );
  });
  it("cancels only an owner's uncommitted upload and never compensates delivery with object deletion", async () => {
    const f = await prepared();
    const other = await testActor();
    await expect(cancelMasterUpload(other.user, f.id)).rejects.toMatchObject({
      status: 404,
    });
    expect(await cancelMasterUpload(f.actor.user, f.id)).toEqual({
      cancelled: true,
    });
    expect(storage.remove).toHaveBeenCalledWith(f.pathname);
    const next = await fixture();
    const intent = await prepareMasterUpload(next.actor.user, next.input);
    await completeMasterUpload(next.actor.user, intent.upload!.id);
    storage.remove.mockClear();
    await expect(
      cancelMasterUpload(next.actor.user, intent.upload!.id),
    ).rejects.toMatchObject({ status: 409 });
    expect(storage.remove).not.toHaveBeenCalled();
  });
  it("abandons invalid immutable bytes rather than permitting unlimited paid verification retries", async () => {
    const f = await prepared();
    storage.verify.mockRejectedValueOnce(
      new HttpError(422, "source checksum changed"),
    );
    await expect(
      completeMasterUpload(f.actor.user, f.id),
    ).rejects.toMatchObject({ status: 422 });
    expect((await doc(f.actor.user.id, f.id))?.status).toBe("abandoned");
    await expect(
      completeMasterUpload(f.actor.user, f.id),
    ).rejects.toMatchObject({ status: 409 });
    expect(storage.verify).toHaveBeenCalledTimes(1);
  });
  it("never deletes an object using a corrupted cross-owner intent locator", async () => {
    const f = await prepared();
    await mutateAccountDocument<MasterUploadIntent>(
      f.actor.user.id,
      MASTER_UPLOAD_KIND,
      f.id,
      (current) => ({
        ...current!,
        pathname: `east-sound/${tenant}/masters/${randomUUID()}/${randomUUID()}.wav`,
      }),
    );
    await expect(cancelMasterUpload(f.actor.user, f.id)).rejects.toMatchObject({
      status: 409,
    });
    expect(storage.remove).not.toHaveBeenCalled();
  });
});
