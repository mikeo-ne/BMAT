/**
 * Readiness probe for the live deployment.
 *
 * The app is fully wired to Supabase, but only switches on when a project is
 * attached through env vars. That switch is invisible from the outside: the
 * marketing site looks identical in both modes, so "did my env vars take
 * effect?" is otherwise answered by sign-in failing in a confusing way.
 *
 * Every check here is answerable with the anon key alone (no service role) and
 * never returns row contents — only booleans, counts and ages.
 */

export type CheckState = "ok" | "warn" | "fail" | "skip";

export type ReadinessCheck = {
  id: string;
  label: string;
  state: CheckState;
  detail: string;
  /** What the operator should do when this check is not green. */
  fix?: string;
};

export type Readiness = {
  mode: "demo" | "live";
  /** Masked host of the attached project, safe to display. */
  project: string;
  generatedAt: string;
  /** No failing check: the app will serve real data. */
  ready: boolean;
  checks: ReadinessCheck[];
};

export type FetchResult = { status: number; body: unknown };
export type Headers = Record<string, string>;
export type Fetcher = (url: string, headers: Headers) => Promise<FetchResult>;

export type HealthInput = {
  supabaseUrl: string;
  anonKey: string;
  siteUrl: string;
  fetch: Fetcher;
  /** Detections older than this mean the worker is not running. */
  staleAfterMs?: number;
  now?: () => Date;
};

export const STALE_AFTER_MS = 30 * 60 * 1000;

export function projectHost(url: string): string {
  try {
    return new URL(url).host || "";
  } catch {
    return "";
  }
}

export function humanAge(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "unknown";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

const isHttps = (url: string) => {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
};

const rest = (base: string, path: string) => `${base.replace(/\/+$/, "")}/rest/v1/${path}`;

/** Supabase answers with `{message, code}` for a missing table or a bad key. */
const apiError = (body: unknown): string | null => {
  if (!body || typeof body !== "object") return null;
  const { message, code, error } = body as Record<string, unknown>;
  const text = typeof message === "string" ? message : typeof error === "string" ? error : "";
  if (!text) return null;
  return typeof code === "string" ? `${text} (${code})` : text;
};

async function attempt(
  fetcher: Fetcher,
  url: string,
  headers: Headers,
): Promise<{ res?: FetchResult; error?: string }> {
  try {
    return { res: await fetcher(url, headers) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "network error" };
  }
}

export async function buildReadiness(input: HealthInput): Promise<Readiness> {
  const now = input.now ?? (() => new Date());
  const staleAfter = input.staleAfterMs ?? STALE_AFTER_MS;
  const url = input.supabaseUrl.trim();
  const key = input.anonKey.trim();
  const siteUrl = input.siteUrl.trim();
  const configured = Boolean(url && key);
  const checks: ReadinessCheck[] = [];

  const headers: Headers = { apikey: key, Authorization: `Bearer ${key}` };

  checks.push(
    configured
      ? {
          id: "env",
          label: "Supabase project attached",
          state: "ok",
          detail: `Connected to ${projectHost(url) || "your project"}.`,
        }
      : {
          id: "env",
          label: "Supabase project attached",
          state: "fail",
          detail: "No project attached — the app is serving its seeded demo data.",
          fix:
            "Vercel → Settings → Environment Variables: add NEXT_PUBLIC_SUPABASE_URL and " +
            "NEXT_PUBLIC_SUPABASE_ANON_KEY, then redeploy (env changes need a new build).",
        },
  );

  checks.push(
    !url
      ? {
          id: "url",
          label: "Project URL is well formed",
          state: "skip",
          detail: "Nothing to check until NEXT_PUBLIC_SUPABASE_URL is set.",
        }
      : isHttps(url)
        ? { id: "url", label: "Project URL is well formed", state: "ok", detail: `https://${projectHost(url)}` }
        : {
            id: "url",
            label: "Project URL is well formed",
            state: "fail",
            detail: "The project URL is not HTTPS.",
            fix: "Copy the Project URL from Supabase → Project Settings → Data API; it starts with https://.",
          },
  );

  checks.push(
    !siteUrl
      ? {
          id: "site-url",
          label: "Public site URL set",
          state: "warn",
          detail: "NEXT_PUBLIC_SITE_URL is empty, so recovery links fall back to the request origin.",
          fix: "Add NEXT_PUBLIC_SITE_URL (e.g. https://eastsound.vercel.app) and match it to Supabase → Authentication → URL Configuration.",
        }
      : isHttps(siteUrl)
        ? { id: "site-url", label: "Public site URL set", state: "ok", detail: siteUrl }
        : {
            id: "site-url",
            label: "Public site URL set",
            state: "warn",
            detail: `${siteUrl} is not HTTPS — email links will look suspicious to mail providers.`,
          },
  );

  if (!configured) {
    for (const [id, label] of [
      ["auth", "Auth service reachable"],
      ["schema", "Database schema installed"],
      ["stations", "Station panel loaded"],
      ["ingest", "Ingest worker reporting"],
    ] as const) {
      checks.push({ id, label, state: "skip", detail: "Runs once a project is attached." });
    }
    return finish("demo", url, now(), checks);
  }

  // 1. Auth service.
  {
    const { res, error } = await attempt(input.fetch, `${url.replace(/\/+$/, "")}/auth/v1/health`, headers);
    checks.push(
      error
        ? {
            id: "auth",
            label: "Auth service reachable",
            state: "fail",
            detail: `Could not reach ${projectHost(url)}: ${error}`,
            fix: "Check the project URL and that the project is not paused in the Supabase dashboard.",
          }
        : res && res.status < 400
          ? {
              id: "auth",
              label: "Auth service reachable",
              state: "ok",
              detail: "Supabase Auth answered.",
            }
          : {
              id: "auth",
              label: "Auth service reachable",
              state: "fail",
              detail: `Auth returned HTTP ${res?.status ?? 0}${apiError(res?.body) ? `: ${apiError(res?.body)}` : ""}.`,
              fix: "Confirm the anon key belongs to this project (Settings → API keys).",
            },
    );
  }

  // 2. Schema — a missing table is the classic "forgot the migrations" state.
  {
    const { res, error } = await attempt(input.fetch, rest(url, "profiles?select=id&limit=1"), headers);
    const failure = error ?? apiError(res?.body);
    checks.push(
      failure
        ? {
            id: "schema",
            label: "Database schema installed",
            state: "fail",
            detail: `profiles is not readable: ${failure}`,
            fix: "In Supabase → SQL Editor run, in order: 0001_rbac_schema.sql, 0002_stream_ingest.sql, 0003_dashboards_live.sql.",
          }
        : {
            id: "schema",
            label: "Database schema installed",
            state: "ok",
            detail: "profiles, roles and RLS policies are in place.",
          },
    );
  }

  // 3 + 4. Station panel and ingest freshness.
  //
  // Row-level security hides every station and detection from the anon key,
  // so reading the tables directly would always report an empty panel. The
  // public_ingest_health() function (migration 0006) returns counts and
  // timestamps only.
  const { res: hRes, error: hError } = await attempt(input.fetch, rest(url, "rpc/public_ingest_health"), headers);
  const hFailure = hError ?? apiError(hRes?.body);
  const health = !hFailure && hRes?.body && typeof hRes.body === "object" && !Array.isArray(hRes.body)
    ? (hRes.body as { stations?: number; monitored?: number; last_detection?: string | null })
    : null;
  const missingFn = !health && /PGRST202|42883|could not find the function|does not exist/i.test(hFailure ?? "");

  if (!health) {
    const fix = missingFn
      ? "In Supabase → SQL Editor run supabase/migrations/0006_public_ingest_health.sql (or re-run supabase/setup.sql)."
      : "Run the migrations in supabase/setup.sql, then reload this page.";
    checks.push(
      {
        id: "stations",
        label: "Station panel loaded",
        state: "warn",
        detail: missingFn ? "The health function is not installed yet, so the panel can't be counted." : `Health check failed: ${hFailure ?? "unexpected response"}`,
        fix,
      },
      {
        id: "ingest",
        label: "Ingest worker reporting",
        state: "warn",
        detail: "Unknown until the health function answers.",
        fix,
      },
    );
    return finish("live", url, now(), checks);
  }

  const rows = Number(health.stations) || 0;
  const monitored = Number(health.monitored) || 0;
  checks.push(
    rows === 0
      ? {
          id: "stations",
          label: "Station panel loaded",
          state: "warn",
          detail: "No stations in the panel yet — nothing will be monitored.",
          fix: "Start the ingest worker: it registers every station in stations.csv on its first run.",
        }
      : {
          id: "stations",
          label: "Station panel loaded",
          state: "ok",
          detail: `${rows} station${rows === 1 ? "" : "s"} in the panel` + (monitored ? `, ${monitored} streaming.` : "."),
        },
  );

  const at = health.last_detection ? Date.parse(health.last_detection) : NaN;
  const age = now().getTime() - at;
  checks.push(
    !Number.isFinite(at)
      ? {
          id: "ingest",
          label: "Ingest worker reporting",
          state: "warn",
          detail: monitored > 0
            ? `The worker is listening to ${monitored} station${monitored === 1 ? "" : "s"}; no plays recorded yet.`
            : "No detections yet — the worker has not written anything.",
          fix: monitored > 0
            ? "Upload songs (label: Upload Songs · artist: My Songs). Plays appear once a monitored station plays one."
            : "Start the ingest worker with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, then upload at least one song.",
        }
      : age <= staleAfter
        ? {
            id: "ingest",
            label: "Ingest worker reporting",
            state: "ok",
            detail: `Last detection ${humanAge(age)}.`,
          }
        : {
            id: "ingest",
            label: "Ingest worker reporting",
            state: "warn",
            detail: `Last detection ${humanAge(age)} — the worker looks stopped.`,
            fix: "Check the worker host (Railway/Fly logs) and that stations.csv has enabled stations.",
          },
  );

  return finish("live", url, now(), checks);
}

function finish(mode: Readiness["mode"], url: string, at: Date, checks: ReadinessCheck[]): Readiness {
  return {
    mode,
    project: projectHost(url),
    generatedAt: at.toISOString(),
    ready: checks.every((c) => c.state !== "fail"),
    checks,
  };
}

/** Human summary for logs and the API response. */
export function summarize(report: Readiness): string {
  if (report.mode === "demo") return "Demo mode — no Supabase project attached.";
  const failed = report.checks.filter((c) => c.state === "fail").length;
  const warned = report.checks.filter((c) => c.state === "warn").length;
  if (failed) return `Not ready: ${failed} failing check${failed === 1 ? "" : "s"}.`;
  if (warned) return `Live, with ${warned} warning${warned === 1 ? "" : "s"}.`;
  return "Live and healthy.";
}

/** Real network fetcher for the API route and the /setup page (server only). */
export const httpFetcher: Fetcher = async (url, headers) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { headers, cache: "no-store", signal: controller.signal });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
};
