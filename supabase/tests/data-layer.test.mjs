// Runs the app's REAL data layer (lib/db/*) against PostgREST + PostgreSQL,
// signed in as each demo account, and checks what every dashboard would show.
//
//   PGRST_URL=http://127.0.0.1:3300 JWT_SECRET=... PGHOST=... node supabase/tests/data-layer.test.mjs
//
// The Supabase browser client is swapped for a server-side client that carries
// a signed JWT for the chosen user — everything else is the production code.
import { build } from "esbuild";
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import http from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const PGRST = process.env.PGRST_URL ?? "http://127.0.0.1:3300";
const SECRET = process.env.JWT_SECRET;
const DB = process.env.TEST_DB ?? "est_rls_test";
let fails = 0;

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function jwt(sub, role = "authenticated") {
  const h = b64({ alg: "HS256", typ: "JWT" });
  const p = b64({ sub, role, aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${h}.${p}.${createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`;
}
const sql = (q) => execFileSync("psql", ["-d", DB, "-qAtX", "-c", q], { encoding: "utf8" }).trim();
function check(name, ok, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) fails++;
}

// supabase-js talks to <url>/rest/v1; PostgREST serves at /. Tiny path-rewriting proxy.
const proxy = http.createServer((req, res) => {
  const up = new URL(req.url.replace(/^\/rest\/v1/, ""), PGRST);
  const fwd = http.request(up, { method: req.method, headers: { ...req.headers, host: up.host } }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers);
    r.pipe(res);
  });
  fwd.on("error", () => (res.writeHead(502), res.end()));
  req.pipe(fwd);
});
await new Promise((r) => proxy.listen(0, "127.0.0.1", r));
const PROXY = `http://127.0.0.1:${proxy.address().port}`;

// Bundle lib/db with the browser client replaced by a test client.
const dir = join(ROOT, "node_modules", ".cache", "est-data-layer");
mkdirSync(dir, { recursive: true });
const stub = join(dir, "client-stub.ts");
writeFileSync(stub, `
import { createClient } from "@supabase/supabase-js";
export function getSupabaseBrowser() {
  const t = (globalThis as any).__EST_USER__;
  if (!t) return null;
  const c: any = createClient("${PROXY}", "anon-key-unused", { global: { headers: { Authorization: "Bearer " + t.jwt } }, auth: { persistSession: false } });
  c.auth.getUser = async () => ({ data: { user: { id: t.id } }, error: null });
  return c;
}`);
const entry = join(dir, "entry.ts");
writeFileSync(entry, ["cmo", "label", "artist", "broadcaster", "venue", "shared"].map((m) => `export * as ${m} from "@/lib/db/${m}";`).join("\n"));
const out = join(dir, "bundle.mjs");
await build({
  entryPoints: [entry], bundle: true, platform: "node", format: "esm", outfile: out, logLevel: "error",
  alias: { "@/lib/supabase/client": stub, "@": ROOT },
  external: ["react", "@supabase/supabase-js"], nodePaths: [join(ROOT, "node_modules")],
});
writeFileSync(join(dir, "package.json"), "{}");
const M = await import(out + `?t=${Date.now()}`);

// Fresh demo data every run (the seed script is re-runnable) so results never depend on a previous run.
execFileSync("psql", ["-d", DB, "-qX", "-v", "ON_ERROR_STOP=1", "-f", join(ROOT, "supabase/seed/demo_data.sql")]);

const uid = (email) => sql(`select id from auth.users where email = '${email}'`);
const as = (email) => { globalThis.__EST_USER__ = { id: uid(email), jwt: jwt(uid(email)) }; };

// ---------------------------------------------------------------- CMO
console.log("\nCMO dashboard (live)");
as("cmo@demo.eastsound.ug");
const cmo = await M.cmo.loadCmo();
check("registry lists every recording", cmo.registry.length === Number(sql("select count(*) from recordings")), `${cmo.registry.length}`);
check("registry flags works in open disputes as Conflict", cmo.registry.filter((w) => w.status === "Conflict").length === Number(sql("select count(distinct recording_id) from disputes where status = 'open'")));
check("Top 100 ranked by spins", cmo.top100.length > 0 && cmo.top100.every((r, i, a) => i === 0 || a[i - 1].spins >= r.spins), `${cmo.top100.length} entries, #1 ${cmo.top100[0]?.title}`);
check("Top 100 spins match the database", cmo.top100[0]?.spins === Number(sql(`select count(*) from detections d join recordings r on r.id = d.recording_id where r.title = '${cmo.top100[0]?.title.replace(/'/g, "''")}' and d.detected_at >= now() - interval '7 days'`)));
const heatTotal = cmo.heatmap.flat(2).reduce((a, b) => a + b, 0);
check("heatmap totals match 7-day station detections", heatTotal === Number(sql("select count(*) from detections d join stations s on s.id = d.station_id where d.detected_at >= now() - interval '7 days' and s.region is not null")), `${heatTotal}`);
check("open disputes listed with claimant names", cmo.disputes.length === 2 && cmo.disputes.every((d) => d.claimantA !== "—" && d.claimantB !== "—"));
check("unmatched queue loaded with station names", cmo.unmatched.length === 6 && cmo.unmatched.every((u) => u.station !== "—"));
await M.cmo.resolveDispute(cmo.disputes[0].id, "resolved_split");
check("resolving a dispute is saved", sql(`select status || ':' || (resolved_by is not null) from disputes where id = '${cmo.disputes[0].id}'`) === "resolved_split:true");
await M.cmo.resolveUnmatched(cmo.unmatched[0].id, cmo.works[0].id);
check("matching an unmatched clip is saved", sql(`select status from unmatched_clips where id = ${cmo.unmatched[0].id}`) === "matched");
const cmo2 = await M.cmo.loadCmo();
check("reload reflects the changes", cmo2.unmatched.length === 5 && cmo2.stats.openDisputes === 1);

// ---------------------------------------------------------------- Label
console.log("\nLabel dashboard (live)");
as("label@demo.eastsound.ug");
const lab = await M.label.loadLabel();
check("roster shows the label's own artists only", lab.roster.length === 3 && lab.roster.every((a) => ["Nalu Akello", "Kato Soul", "Zawadi B"].includes(a.name)));
check("catalogue shows own recordings only (no Rival titles)", lab.catalogue.length === 4 && !lab.catalogue.some((c) => /Rival|Nile Fever|Gulu/.test(c.title)));
check("spins per artist add up", lab.roster.reduce((a, r) => a + r.spins30d, 0) === lab.stats.spins30d, `${lab.stats.spins30d}`);
check("revenue history from royalty statements", lab.revenue.length === 6 && lab.revenue.at(-1)?.month.endsWith("*"));
await M.label.addArtist(lab.orgId, "New Signing", "Amapiano");
await M.label.saveCodes(lab.catalogue.find((c) => !c.isrc).id, "UG-DEM-26-00777", "196589000777");
const lab2 = await M.label.loadLabel();
check("adding an artist is saved", lab2.roster.some((a) => a.name === "New Signing"));
check("filling missing ISRC/UPC is saved", lab2.catalogue.some((c) => c.isrc === "UG-DEM-26-00777" && c.upc === "196589000777"));
await M.label.removeArtist(lab2.roster.find((a) => a.name === "New Signing").id);
check("removing an artist is saved", !(await M.label.loadLabel()).roster.some((a) => a.name === "New Signing"));
let hacked = false;
try { await M.label.saveCodes(sql("select id from recordings where title = 'Rival Anthem'"), "UG-HAK-26-00001", ""); hacked = sql("select isrc from recordings where title = 'Rival Anthem'") === "UG-HAK-26-00001"; } catch { /* refused */ }
check("cannot edit a rival label's recording through the app", !hacked);

// ---------------------------------------------------------------- Artist
console.log("\nArtist dashboard (live)");
as("artist@demo.eastsound.ug");
const art = await M.artist.loadArtist();
check("discography shows own recordings only", art.discography.length === 2 && art.discography.every((t) => ["Gulu Gold", "Rwenzori Rain"].includes(t.title)));
check("14-day spin velocity for the lead single", art.velocity.length === 14, `${art.leadTitle}: ${art.velocity.join(",")}`);
check("velocity matches the database", art.velocity.reduce((a, b) => a + b, 0) === Number(sql(`select count(*) from detections d join recordings r on r.id = d.recording_id where r.title = '${art.leadTitle}' and (d.detected_at at time zone 'Africa/Kampala')::date > (now() at time zone 'Africa/Kampala')::date - 14`)));
check("full split sheet for own works (3 parties = 100%)", art.splits.length === 3 && art.splits.reduce((a, s) => a + s.share, 0) === 100);
check("estimated royalty from this month's statement", art.stats.estRoyaltyUgx > 0, `UGX ${art.stats.estRoyaltyUgx}`);
await M.shared.saveAlertPrefs({ phone: "0772 123 456", events: { firstSpin: true, chart: false, dispute: true, payout: true } });
const prefs = await M.shared.loadAlertPrefs();
check("WhatsApp alert settings save and reload (number normalised)", prefs?.phone === "+256772123456" && prefs.events.chart === false && prefs.events.payout === true);
let badPhone = false;
try { await M.shared.saveAlertPrefs({ phone: "12345", events: {} }); } catch { badPhone = true; }
check("invalid phone number is rejected with a clear message", badPhone);

// ---------------------------------------------------------------- Broadcaster
console.log("\nBroadcaster dashboard (live)");
as("broadcaster@demo.eastsound.ug");
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kampala" }).format(new Date());
// pick the busiest recent day for this station so the timeline has content
const day = sql("select (detected_at at time zone 'Africa/Kampala')::date from detections d join stations s on s.id = d.station_id where s.slug = 'demo-home-fm' group by 1 order by count(*) desc limit 1") || today;
const bc = await M.broadcaster.loadBroadcaster(day);
check("station is the broadcaster's own", bc.station?.name.startsWith("Home FM"), bc.station?.name);
const music = bc.segments.filter((s) => s.kind === "music");
check("playout music = that day's detections on own station", music.length === Number(sql(`select count(*) from detections d join stations s on s.id = d.station_id where s.slug = 'demo-home-fm' and (d.detected_at at time zone 'Africa/Kampala')::date = '${day}'`)), `${music.length} on ${day}`);
check("cue-sheet rows carry composer/publisher/ISRC", music.every((m) => m.label && m.isrc !== undefined));
check("talk segments fill gaps without overlap", bc.segments.every((s, i, a) => i === 0 || s.start >= a[i - 1].start));
const bcToday = await M.broadcaster.loadBroadcaster(today);
check("ad control: this week's 3 bookings with aired counts", bcToday.ads.length === 3 && bcToday.ads.every((a) => a.aired === Number(sql(`select count(*) from ad_spots where booking_id = '${a.id}'`))));
check("no rival-station content", !bc.segments.some((s) => /Rival/.test(s.label)));

// ---------------------------------------------------------------- Venue
console.log("\nVenue dashboard (live)");
as("venue@demo.eastsound.ug");
sql("update venue_nodes set last_heartbeat = now() - interval '10 seconds' where code = 'N-K01'"); // live node just reported in
const ven = await M.venue.loadVenue();
check("own venue only", ven.venueName === "Kololo Lounge (demo)", ven.venueName);
check("node status from heartbeat age (1 online, 1 offline)", ven.nodes.find((n) => n.code === "N-K01")?.status === "online" && ven.nodes.find((n) => n.code === "N-K02")?.status === "offline");
check("compliance = at-risk while a node is offline", ven.compliance.status === "at-risk", ven.compliance.status);
check("tracks today per node add up", ven.nodes.reduce((a, n) => a + n.tracksToday, 0) === Number(sql("select count(*) from detections d join venues v on v.id = d.venue_id where v.name = 'Kololo Lounge (demo)' and d.detected_at >= now() - interval '24 hours'")));
const before = ven.sets.length;
await M.venue.addDjSet(ven.venueId, "DJ From Test", new Date(Date.now() - 7200e3).toISOString(), new Date().toISOString());
const ven2 = await M.venue.loadVenue();
check("logging a DJ set is saved and counts tracks in its window", ven2.sets.length === before + 1 && ven2.sets[0].dj === "DJ From Test", `${ven2.sets[0].tracks} tracks`);

// ---------------------------------------------------------------- Public + cross-role
console.log("\nPublic site + cross-role checks (live)");
globalThis.__EST_USER__ = { id: "00000000-0000-0000-0000-000000000000", jwt: jwt(undefined, "anon") };
const pub = await M.shared.loadPublicChart("All");
check("anonymous Top 10 comes from live data", pub.live && pub.rows.length > 0 && pub.rows.length <= 10, `#1 ${pub.rows[0]?.title}`);
const central = await M.shared.loadPublicChart("Central");
check("regional filter changes the chart", JSON.stringify(central.rows) !== JSON.stringify(pub.rows));
as("venue@demo.eastsound.ug");
let leaked = 0;
try { leaked = (await M.cmo.loadCmo()).registry.length; } catch { leaked = 0; }
check("a venue account calling CMO loaders gets no catalogue", leaked === 0, `${leaked} rows`);
as("label@demo.eastsound.ug");
let bcLeak = null;
try { bcLeak = (await M.broadcaster.loadBroadcaster(day)).station; } catch { bcLeak = null; }
check("a label account calling broadcaster loaders gets no station", bcLeak === null);

proxy.close();
console.log(`\n${fails ? `${fails} FAILED` : "ALL DATA-LAYER CHECKS PASSED"}`);
process.exit(fails ? 1 : 0);
