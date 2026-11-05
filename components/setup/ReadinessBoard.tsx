import type { Readiness, ReadinessCheck } from "@/lib/health";
import { cx } from "@/lib/safe";

/**
 * The board is deliberately dumb: it renders a Readiness report and never
 * fetches. That keeps it testable and lets the /setup page stay a server
 * component with no client JavaScript.
 */
const TONE: Record<ReadinessCheck["state"], { label: string; dot: string; ring: string }> = {
  ok: { label: "Ready", dot: "bg-emerald-400", ring: "border-emerald-400/25" },
  warn: { label: "Attention", dot: "bg-amber-400", ring: "border-amber-400/25" },
  fail: { label: "Blocking", dot: "bg-rose-500", ring: "border-rose-500/25" },
  skip: { label: "Waiting", dot: "bg-slate-600", ring: "border-slate-800" },
};

const STEPS = [
  {
    title: "Install the schema",
    cmd: "supabase/setup.sql",
    note: "Supabase → SQL Editor → paste the whole file → Run. It installs every migration in order (tables, storage buckets, RLS policies). Already set up? Run only the migrations you haven't applied yet from supabase/migrations/.",
  },
  {
    title: "Point the site at the project",
    cmd: "NEXT_PUBLIC_SUPABASE_URL · NEXT_PUBLIC_SUPABASE_ANON_KEY · NEXT_PUBLIC_SITE_URL",
    note: "Vercel → Settings → Environment Variables, then redeploy — env changes only apply to a new build.",
  },
  {
    title: "Allow the login round-trip",
    cmd: "Site URL + /auth/callback and /auth/reset in Supabase → Authentication → URL Configuration",
    note: "Without this, confirmation and recovery emails land on the wrong host.",
  },
  {
    title: "Start the ingestor",
    cmd: "python -m eastsound_ingest --stations stations.csv run",
    note: "Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, on an always-on host, never in Vercel.",
  },
];

export function ReadinessBoard({ report }: { report: Readiness }) {
  const live = report.mode === "live";
  return (
    <div className="space-y-8">
      <section className={cx("glass border p-6 sm:p-7", live && report.ready ? "border-emerald-400/30" : "border-slate-800")}>
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={cx(
              "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold",
              live && report.ready ? "bg-emerald-400/10 text-emerald-300" : live ? "bg-amber-400/10 text-amber-200" : "bg-slate-800 text-slate-300",
            )}
          >
            <span className={cx("h-1.5 w-1.5 rounded-full", live && report.ready ? "bg-emerald-400" : live ? "bg-amber-400" : "bg-slate-500")} />
            {live ? (report.ready ? "Live" : "Live, needs attention") : "Demo mode"}
          </span>
          {report.project && <span className="font-mono text-xs text-slate-500">{report.project}</span>}
          <span className="ml-auto text-xs text-slate-500">
            checked {new Date(report.generatedAt).toISOString().replace("T", " ").slice(0, 19)} UTC
          </span>
        </div>
        <h1 className="mt-4 text-2xl font-bold text-white sm:text-3xl">
          {live ? (report.ready ? "This deployment is serving live data." : "Almost live — fix the blocking checks below.") : "This deployment is running on sample data."}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          {live
            ? "Sign-ups hit Supabase Auth, dashboards read their own rows through RLS, and detections come from the ingest worker."
            : "Everything you see is seeded. Attach a Supabase project and this page turns into the live health report."}
        </p>
      </section>

      <section aria-label="Readiness checks" className="grid gap-3">
        {report.checks.map((c) => {
          const tone = TONE[c.state];
          return (
            <article key={c.id} className={cx("glass flex gap-4 border p-4 sm:p-5", tone.ring)}>
              <span aria-hidden className={cx("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", tone.dot)} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 className="font-semibold text-white">{c.label}</h2>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tone.label}</span>
                </div>
                <p className="mt-1 text-sm text-slate-400">{c.detail}</p>
                {c.fix && c.state !== "ok" && (
                  <p className="mt-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
                    <span className="font-semibold text-slate-200">Fix: </span>
                    {c.fix}
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </section>

      <section aria-label="Go-live steps" className="space-y-3">
        <h2 className="text-lg font-bold text-white">Go-live steps</h2>
        {STEPS.map((s, i) => (
          <article key={s.title} className="glass border border-slate-800 p-4 sm:p-5">
            <h3 className="flex items-center gap-2 font-semibold text-white">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-400/10 text-xs font-bold text-emerald-300">{i + 1}</span>
              {s.title}
            </h3>
            <code className="mt-2 block overflow-x-auto rounded-lg bg-slate-950/80 px-3 py-2 text-xs text-emerald-300">{s.cmd}</code>
            <p className="mt-2 text-sm text-slate-400">{s.note}</p>
          </article>
        ))}
      </section>

      <p className="text-xs text-slate-500">
        Machine-readable version: <code className="text-slate-400">/api/health</code> — 200 when every blocking check passes, 503 otherwise.
      </p>
    </div>
  );
}
