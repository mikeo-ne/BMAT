#!/usr/bin/env node
/**
 * Ask a deployment how wired-up it is.
 *
 *   node scripts/health.mjs                          # localhost:3000
 *   node scripts/health.mjs https://bmat-rho.vercel.app
 *   NEXT_PUBLIC_SITE_URL=... npm run health
 *
 * Exits 0 only when every blocking check passes, so CI or a cron can use it.
 */
const target = process.argv[2] ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const MARK = { ok: "✓", warn: "!", fail: "✗", skip: "·" };

let report;
try {
  const res = await fetch(new URL("/api/health", target), { headers: { "cache-control": "no-cache" } });
  report = await res.json();
} catch (err) {
  console.error(`Could not reach ${target}: ${err instanceof Error ? err.message : err}`);
  process.exit(2);
}

console.log(`\n${target}  —  ${report.summary}`);
if (report.project) console.log(`project: ${report.project}  ·  mode: ${report.mode}`);
console.log("");
for (const check of report.checks) {
  console.log(`  ${MARK[check.state] ?? "?"} ${check.label.padEnd(32)} ${check.detail}`);
  if (check.fix && check.state !== "ok") console.log(`      → ${check.fix}`);
}
console.log("");
process.exit(report.ready ? 0 : 1);
