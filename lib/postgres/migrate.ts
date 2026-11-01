import "server-only";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Pool } from "pg";
import { inTransaction } from "@/lib/postgres/pool";

/** Explicit operator action only. Schema changes never run from page renders or uploads. */
export async function migratePostgres(
  pool: Pool,
  directory = path.join(process.cwd(), "db/migrations"),
): Promise<string[]> {
  const files = (await readdir(directory))
    .filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name))
    .sort();
  return inTransaction(pool, async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(1950421, 0)");
    await client.query(`CREATE TABLE IF NOT EXISTS public.east_sound_schema_migrations (
      name text PRIMARY KEY, sha256 varchar(64) NOT NULL, applied_at timestamptz NOT NULL DEFAULT clock_timestamp())`);
    const applied = await client.query<{ name: string; sha256: string }>(
      "SELECT name, sha256 FROM public.east_sound_schema_migrations ORDER BY name",
    );
    if (applied.rows.some((row) => !files.includes(row.name)))
      throw new Error("Database contains an unknown East Sound migration.");
    const completed: string[] = [];
    for (const name of files) {
      const sql = await readFile(path.join(directory, name), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previous = applied.rows.find((row) => row.name === name);
      if (previous) {
        if (previous.sha256 !== checksum)
          throw new Error(
            "An applied migration changed; restore it and add a new migration instead.",
          );
        continue;
      }
      await client.query(sql);
      await client.query(
        "INSERT INTO public.east_sound_schema_migrations(name, sha256) VALUES ($1, $2)",
        [name, checksum],
      );
      completed.push(name);
    }
    return completed;
  });
}
