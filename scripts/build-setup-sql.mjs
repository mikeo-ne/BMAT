#!/usr/bin/env node
/** Regenerate supabase/setup.sql from the numbered migrations. */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildSetupSql, MIGRATIONS } from "./setup-sql.mjs";

const out = join(import.meta.dirname, "..", "supabase", "setup.sql");
writeFileSync(out, buildSetupSql(join(import.meta.dirname, "..")), "utf8");
console.log(`wrote supabase/setup.sql (${MIGRATIONS.length} migrations)`);
