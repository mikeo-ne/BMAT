import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { lock } from "proper-lockfile";
import {
  postgresPool,
  postgresStorageEnabled,
  postgresTenant,
} from "@/lib/postgres/pool";
import { referenceStorageOnly } from "@/lib/runtime-storage";
import type { SessionUser } from "@/lib/auth-types";

export interface Account extends SessionUser {
  passwordHash: string;
  disabled: boolean;
  createdAt: string;
}
export interface StoredSession {
  tokenHash: string;
  userId: string;
  csrfToken: string;
  expiresAt: string;
}
interface Rate {
  key: string;
  attempts: number;
  resetsAt: number;
}
interface Document {
  ownerId: string;
  kind: string;
  key: string;
  value: unknown;
  updatedAt: string;
}
interface State {
  version: 1;
  users: Account[];
  sessions: StoredSession[];
  rates: Rate[];
  documents: Document[];
  audit: unknown[];
}
let queue: Promise<unknown> = Promise.resolve();
const directory = () =>
  path.join(
    process.env.EAST_SOUND_DATA_DIR ?? path.join(process.cwd(), ".data"),
    "security",
  );
const file = () => path.join(directory(), "accounts.json");
export function authenticationAvailable() {
  return (
    process.env.EAST_SOUND_STATIC_EXPORT !== "1" && !referenceStorageOnly()
  );
}
async function fileState(): Promise<State> {
  if (!authenticationAvailable())
    throw new Error("Persistent authentication is not configured.");
  try {
    const value: State = JSON.parse(await readFile(file(), "utf8"));
    if (
      value.version !== 1 ||
      ![
        value.users,
        value.sessions,
        value.rates,
        value.documents,
        value.audit,
      ].every(Array.isArray)
    )
      throw new Error("Invalid security store. No reset was performed.");
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return {
      version: 1,
      users: [],
      sessions: [],
      rates: [],
      documents: [],
      audit: [],
    };
  }
}
/** Shared by the web process, local worker and provisioning CLI on one durable host.
 * An atomic, heartbeat-maintained directory lock prevents a second process from
 * replacing another process's accounts, approvals or notification leases. Use
 * PostgreSQL for multiple hosts; never put this store on an ephemeral volume.
 */
async function mutate<T>(fn: (state: State) => T | Promise<T>): Promise<T> {
  const next = queue.then(async () => {
    if (!authenticationAvailable())
      throw new Error("Persistent authentication is not configured.");
    await mkdir(directory(), { recursive: true, mode: 0o700 });
    let compromised: Error | null = null;
    const release = await lock(file(), {
      realpath: false,
      stale: 30_000,
      update: 5_000,
      retries: { retries: 60, factor: 1.1, minTimeout: 20, maxTimeout: 250 },
      onCompromised: (error) => {
        compromised = error;
      },
    });
    const temporary = file() + "." + randomUUID() + ".tmp";
    try {
      const state = await fileState();
      const result = await fn(state);
      if (compromised) throw compromised;
      await writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
      if (compromised) throw compromised;
      await rename(temporary, file());
      return result;
    } finally {
      await rm(temporary, { force: true });
      await release();
    }
  });
  queue = next.catch(() => undefined);
  return next;
}
function account(row: Record<string, unknown>): Account {
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.display_name),
    role: row.role as Account["role"],
    stationIds: row.station_keys as string[],
    passwordHash: String(row.password_hash),
    disabled: row.disabled === true,
    mock: row.mock === true,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}
export async function findAccount(
  emailOrId: string,
  byId = false,
): Promise<Account | null> {
  if (!authenticationAvailable()) return null;
  if (!postgresStorageEnabled())
    return (
      (await fileState()).users.find((u) =>
        byId ? u.id === emailOrId : u.email === emailOrId,
      ) ?? null
    );
  const result = await postgresPool().query(
    `SELECT * FROM east_sound.auth_users WHERE tenant_id=$1 AND ${byId ? "id" : "email"}=$2`,
    [postgresTenant(), emailOrId],
  );
  return result.rows[0] ? account(result.rows[0]) : null;
}
export async function insertAccount(user: Account): Promise<boolean> {
  if (!authenticationAvailable())
    throw new Error("Persistent authentication is not configured.");
  if (!postgresStorageEnabled())
    return mutate((state) => {
      if (state.users.some((u) => u.email === user.email || u.id === user.id))
        return false;
      state.users.push(user);
      return true;
    });
  const result = await postgresPool().query(
    `INSERT INTO east_sound.auth_users(id,tenant_id,email,display_name,role,station_keys,password_hash,disabled,mock)
    VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9) ON CONFLICT DO NOTHING`,
    [
      user.id,
      postgresTenant(),
      user.email,
      user.name,
      user.role,
      JSON.stringify(user.stationIds),
      user.passwordHash,
      user.disabled,
      user.mock,
    ],
  );
  return result.rowCount === 1;
}
export async function putSession(session: StoredSession) {
  if (!postgresStorageEnabled())
    return mutate((state) => {
      state.sessions = state.sessions.filter(
        (s) => Date.parse(s.expiresAt) > Date.now(),
      );
      state.sessions.push(session);
    });
  await postgresPool().query(
    "DELETE FROM east_sound.auth_sessions WHERE expires_at<=clock_timestamp()",
  );
  await postgresPool().query(
    "INSERT INTO east_sound.auth_sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,$4)",
    [session.tokenHash, session.userId, session.csrfToken, session.expiresAt],
  );
}
export async function findSession(hash: string): Promise<StoredSession | null> {
  if (!authenticationAvailable()) return null;
  if (!postgresStorageEnabled())
    return (
      (await fileState()).sessions.find(
        (s) => s.tokenHash === hash && Date.parse(s.expiresAt) > Date.now(),
      ) ?? null
    );
  const r = await postgresPool().query(
    "SELECT s.* FROM east_sound.auth_sessions s JOIN east_sound.auth_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>clock_timestamp() AND u.tenant_id=$2",
    [hash, postgresTenant()],
  );
  const row = r.rows[0];
  return row
    ? {
        tokenHash: row.token_hash,
        userId: row.user_id,
        csrfToken: row.csrf_token,
        expiresAt: new Date(row.expires_at).toISOString(),
      }
    : null;
}
export async function revokeSession(hash: string) {
  if (!postgresStorageEnabled())
    return mutate((state) => {
      state.sessions = state.sessions.filter((s) => s.tokenHash !== hash);
    });
  await postgresPool().query(
    "DELETE FROM east_sound.auth_sessions WHERE token_hash=$1",
    [hash],
  );
}
export async function takeRateLimit(
  key: string,
  limit = 10,
  windowMs = 900000,
): Promise<boolean> {
  if (!postgresStorageEnabled())
    return mutate((state) => {
      const now = Date.now();
      state.rates = state.rates.filter((r) => r.resetsAt > now);
      let row = state.rates.find((r) => r.key === key);
      if (!row) {
        row = { key, attempts: 0, resetsAt: now + windowMs };
        state.rates.push(row);
      }
      row.attempts++;
      return row.attempts <= limit;
    });
  const r = await postgresPool().query(
    `INSERT INTO east_sound.auth_rate_limits(tenant_id,key_hash,attempts,resets_at) VALUES($1,$2,1,clock_timestamp()+$3*interval '1 millisecond')
    ON CONFLICT(tenant_id,key_hash) DO UPDATE SET attempts=CASE WHEN east_sound.auth_rate_limits.resets_at<=clock_timestamp() THEN 1 ELSE east_sound.auth_rate_limits.attempts+1 END,
    resets_at=CASE WHEN east_sound.auth_rate_limits.resets_at<=clock_timestamp() THEN excluded.resets_at ELSE east_sound.auth_rate_limits.resets_at END RETURNING attempts`,
    [postgresTenant(), key, windowMs],
  );
  return Number(r.rows[0].attempts) <= limit;
}
export async function readAccountDocument<T>(
  ownerId: string,
  kind: string,
  key = "default",
): Promise<T | null> {
  if (!postgresStorageEnabled())
    return (
      ((await fileState()).documents.find(
        (d) => d.ownerId === ownerId && d.kind === kind && d.key === key,
      )?.value as T) ?? null
    );
  const r = await postgresPool().query(
    "SELECT value FROM east_sound.account_documents WHERE tenant_id=$1 AND owner_id=$2 AND kind=$3 AND document_key=$4",
    [postgresTenant(), ownerId, kind, key],
  );
  return r.rows[0]?.value ?? null;
}
export async function writeAccountDocument(
  ownerId: string,
  kind: string,
  value: unknown,
  key = "default",
) {
  if (!postgresStorageEnabled())
    return mutate((state) => {
      const at = state.documents.findIndex(
        (d) => d.ownerId === ownerId && d.kind === kind && d.key === key,
      );
      const doc = {
        ownerId,
        kind,
        key,
        value,
        updatedAt: new Date().toISOString(),
      };
      if (at < 0) state.documents.push(doc);
      else state.documents[at] = doc;
    });
  await postgresPool().query(
    `INSERT INTO east_sound.account_documents(tenant_id,owner_id,kind,document_key,value) VALUES($1,$2,$3,$4,$5::jsonb)
    ON CONFLICT(tenant_id,owner_id,kind,document_key) DO UPDATE SET value=excluded.value,updated_at=clock_timestamp()`,
    [postgresTenant(), ownerId, kind, key, JSON.stringify(value)],
  );
}
/** Internal service/CMO use only. Never expose this repository directly as an HTTP endpoint. */
export async function documentsOfKind<T>(
  kind: string,
): Promise<{ ownerId: string; key: string; value: T }[]> {
  if (!postgresStorageEnabled())
    return (await fileState()).documents
      .filter((d) => d.kind === kind)
      .map((d) => ({ ownerId: d.ownerId, key: d.key, value: d.value as T }));
  const r = await postgresPool().query(
    "SELECT owner_id,document_key,value FROM east_sound.account_documents WHERE tenant_id=$1 AND kind=$2",
    [postgresTenant(), kind],
  );
  return r.rows.map((row) => ({
    ownerId: row.owner_id,
    key: row.document_key,
    value: row.value,
  }));
}
export async function audit(
  actorId: string | null,
  action: string,
  objectKey: string,
  detail: Record<string, unknown> = {},
) {
  if (!postgresStorageEnabled())
    return mutate((state) => {
      state.audit.push({
        actorId,
        action,
        objectKey,
        detail,
        at: new Date().toISOString(),
      });
    });
  await postgresPool().query(
    "INSERT INTO east_sound.security_audit(tenant_id,actor_id,action,object_key,detail) VALUES($1,$2,$3,$4,$5::jsonb)",
    [postgresTenant(), actorId, action, objectKey, JSON.stringify(detail)],
  );
}

/** Serialize read/modify/write, including concurrent co-signers; never expose arbitrary owner IDs to a route. */
export async function mutateAccountDocument<T>(
  ownerId: string,
  kind: string,
  key: string,
  update: (existing: T | null) => T,
  auditEntry?: {
    actorId: string;
    action: string;
    objectKey: string;
    detail: Record<string, unknown>;
  },
): Promise<T> {
  if (!postgresStorageEnabled())
    return mutate((state) => {
      const index = state.documents.findIndex(
        (d) => d.ownerId === ownerId && d.kind === kind && d.key === key,
      );
      const previous = index < 0 ? null : (state.documents[index].value as T);
      const next = update(previous);
      if (auditEntry && next !== previous)
        state.audit.push({ ...auditEntry, at: new Date().toISOString() });
      const row = {
        ownerId,
        kind,
        key,
        value: next,
        updatedAt: new Date().toISOString(),
      };
      if (index < 0) state.documents.push(row);
      else state.documents[index] = row;
      return next;
    });
  const { inTransaction } = await import("@/lib/postgres/pool");
  return inTransaction(postgresPool(), async (client) => {
    // The advisory lock also serializes first writes, when no row exists yet.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      postgresTenant() + ":" + ownerId + ":" + kind + ":" + key,
    ]);
    const result = await client.query(
      "SELECT value FROM east_sound.account_documents WHERE tenant_id=$1 AND owner_id=$2 AND kind=$3 AND document_key=$4 FOR UPDATE",
      [postgresTenant(), ownerId, kind, key],
    );
    const previous = result.rows[0]?.value ?? null;
    const next = update(previous);
    if (auditEntry && next !== previous)
      await client.query(
        "INSERT INTO east_sound.security_audit(tenant_id,actor_id,action,object_key,detail) VALUES($1,$2,$3,$4,$5::jsonb)",
        [
          postgresTenant(),
          auditEntry.actorId,
          auditEntry.action,
          auditEntry.objectKey,
          JSON.stringify(auditEntry.detail),
        ],
      );
    await client.query(
      `INSERT INTO east_sound.account_documents(tenant_id,owner_id,kind,document_key,value) VALUES($1,$2,$3,$4,$5::jsonb)
      ON CONFLICT(tenant_id,owner_id,kind,document_key) DO UPDATE SET value=excluded.value,updated_at=clock_timestamp()`,
      [postgresTenant(), ownerId, kind, key, JSON.stringify(next)],
    );
    return next;
  });
}

/** Only the CMO-authorized route calls this global projection. No credentials/destinations are audited. */
export async function readSecurityAudit() {
  if (!postgresStorageEnabled())
    return (await fileState()).audit.slice(-200).reverse();
  const result = await postgresPool().query(
    `SELECT actor_id AS "actorId",action,object_key AS "objectKey",detail,occurred_at AS at FROM east_sound.security_audit WHERE tenant_id=$1 ORDER BY id DESC LIMIT 200`,
    [postgresTenant()],
  );
  return result.rows.map((row) => ({
    ...row,
    at: new Date(row.at).toISOString(),
  }));
}
