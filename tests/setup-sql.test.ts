import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs builder shared with the npm script
import { buildSetupSql, MIGRATIONS } from "../scripts/setup-sql.mjs";

/**
 * supabase/setup.sql is the file a human pastes into the SQL Editor at 1am.
 * If it drifts from the migrations, someone silently creates an old schema —
 * so it is generated, committed, and pinned here.
 */
const ROOT = join(import.meta.dirname, "..");
const sql = readFileSync(join(ROOT, "supabase", "setup.sql"), "utf8");

describe("supabase/setup.sql", () => {
  it("is exactly what the generator produces", () => {
    expect(sql).toBe(buildSetupSql(ROOT));
  });

  it("applies the migrations in order, once each", () => {
    expect(MIGRATIONS.map(([file]: [string, string]) => file)).toEqual([
      "0001_rbac_schema.sql",
      "0002_stream_ingest.sql",
      "0003_dashboards_live.sql",
      "0004_realtime.sql",
      "0005_alerts.sql",
      "0006_public_ingest_health.sql",
      "0007_brand_mentions.sql",
      "0008_masters_upload.sql",
    ]);
    const positions = MIGRATIONS.map(([file]: [string, string]) => sql.indexOf(file));
    expect(positions.every((p: number) => p > -1)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("runs as one transaction so a failure leaves nothing half-built", () => {
    expect(sql.trimStart()).toMatch(/^--[\s\S]*?\nbegin;/);
    expect(sql.trimEnd().endsWith("commit;")).toBe(true);
    expect(sql.match(/^begin;$/gm)).toHaveLength(1);
    expect(sql.match(/^commit;$/gm)).toHaveLength(1);
  });

  it("contains every statement from every migration", () => {
    for (const [file] of MIGRATIONS as [string, string][]) {
      const body = readFileSync(join(ROOT, "supabase", "migrations", file), "utf8").trimEnd();
      expect(sql).toContain(body);
    }
  });

  it("carries what the app needs: roles, bucket and the RLS helper", () => {
    expect(sql).toContain("create type public.app_role as enum");
    expect(sql).toContain("insert into storage.buckets");
    expect(sql).toContain("function public.my_role()");
    expect(sql).toMatch(/create policy/i);
    // the CMO-only evidence policy must survive the 0003 rewrite
    expect(sql).toContain("bucket_id = 'evidence'");
  });

  it("has no psql-only meta commands that the SQL Editor rejects", () => {
    expect(sql).not.toMatch(/^\s*\\/m);
    expect(sql).not.toMatch(/^\s*\\set/m);
    expect(sql).not.toMatch(/^\s*\\i/m);
  });
});
