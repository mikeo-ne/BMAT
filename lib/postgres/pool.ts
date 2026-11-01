import "server-only";
import { Pool, type PoolClient } from "pg";

export function postgresStorageEnabled(): boolean {
  if (process.env.EAST_SOUND_STATIC_EXPORT === "1") return false;
  const backend = process.env.EAST_SOUND_STORAGE_BACKEND ?? "file";
  if (backend !== "file" && backend !== "postgres")
    throw new Error("Unsupported storage backend.");
  return backend === "postgres";
}
export function requiredUuid(key: string): string {
  const value = process.env[key] ?? "";
  if (
    value.length !== 36 ||
    !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value) ||
    /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(value)
  )
    throw new Error(`Configure ${key} as a non-nil UUID.`);
  return value;
}
export const postgresTenant = () => requiredUuid("EAST_SOUND_TENANT_ID");
export function createPostgresPool(
  connectionString = process.env.DATABASE_URL,
): Pool {
  if (!connectionString)
    throw new Error("Configure DATABASE_URL before selecting PostgreSQL.");
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("Use a valid PostgreSQL DATABASE_URL.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("Use a PostgreSQL DATABASE_URL.");
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (!local && url.searchParams.get("sslmode") !== "verify-full")
    throw new Error(
      "Remote PostgreSQL connections require sslmode=verify-full.",
    );
  const pool = new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 30000,
    lock_timeout: 10000,
    application_name: "east-sound",
  });
  // Never print connection strings, provider payloads, destinations or driver error messages.
  pool.on("error", () =>
    console.error("PostgreSQL background connection unavailable."),
  );
  return pool;
}
const globalPool = globalThis as typeof globalThis & {
  eastSoundPostgresPool?: Pool;
};
export function postgresPool(): Pool {
  if (!postgresStorageEnabled())
    throw new Error("PostgreSQL storage is not enabled.");
  postgresTenant();
  return (globalPool.eastSoundPostgresPool ??= createPostgresPool());
}
export async function closePostgresPool(): Promise<void> {
  const pool = globalPool.eastSoundPostgresPool;
  delete globalPool.eastSoundPostgresPool;
  await pool?.end();
}
export async function inTransaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
