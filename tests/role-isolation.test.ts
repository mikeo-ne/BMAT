import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CATALOGUE } from "@/lib/data/label";
import { TOP100 } from "@/lib/data/cmo";
import { CHARTS } from "@/lib/data/public";

/**
 * "Absolute data isolation" is the product's headline promise, enforced in
 * three layers at runtime (middleware → RoleGuard → RLS). This suite pins the
 * fourth, cheapest layer: a role's dashboard may only import its own data
 * modules, so a refactor cannot quietly wire one tenant's rows into another
 * tenant's screen.
 */
const ROOT = join(import.meta.dirname, "..");
const ROLES = ["cmo", "label", "artist", "broadcaster", "venue"] as const;

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });

const roleLibImports = (source: string) =>
  [...source.matchAll(/from\s+"@\/lib\/(data|db)\/([a-z-]+)"/g)].map((m) => `${m[1]}/${m[2]}`);

describe("role data isolation", () => {
  it.each(ROLES)("%s dashboards only reach their own data modules", (role) => {
    const files = walk(join(ROOT, "components", "dashboards", role));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const imports = roleLibImports(readFileSync(file, "utf8"));
      expect(imports.length, `${file} imports no role data module`).toBeGreaterThan(0);
      for (const imported of imports) {
        const [kind, name] = imported.split("/");
        // core/shared/live are role-agnostic plumbing, not tenant data.
        const shared = kind === "db" && ["core", "shared", "live"].includes(name);
        expect(shared || name === role, `${file} must not import ${imported}`).toBe(true);
      }
    }
  });

  it.each(ROLES)("lib/db/%s never imports another role's fetchers", (role) => {
    const source = readFileSync(join(ROOT, "lib", "db", `${role}.ts`), "utf8");
    for (const imported of roleLibImports(source)) {
      const name = imported.split("/")[1];
      expect(["core", "shared", "live", role], `lib/db/${role}.ts must not import ${imported}`).toContain(name);
    }
  });

  it("keeps the public chart free of tenant-only fields", () => {
    const rows = Object.values(CHARTS).flat();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      for (const forbidden of ["whatsapp", "email", "orgId", "revenue", "label_org_id", "taxId"]) {
        expect(row, `public chart row leaks ${forbidden}`).not.toHaveProperty(forbidden);
      }
    }
  });

  it("keeps the national top 100 chart free of owner contact details", () => {
    expect(TOP100).toHaveLength(100);
    for (const row of TOP100) {
      expect(Object.keys(row).sort()).toEqual(["owner", "rank", "spins", "stations", "title"]);
    }
  });

  it("holds catalogue identifiers to ISRC / UPC shape", () => {
    expect(CATALOGUE.length).toBeGreaterThan(0);
    for (const item of CATALOGUE) {
      if (item.isrc) expect(item.isrc, item.title).toMatch(/^[A-Z]{2}-[A-Z0-9]{3}-\d{2}-\d{5}$/);
      if (item.upc) expect(item.upc, item.title).toMatch(/^\d{12,13}$/);
    }
  });
});
