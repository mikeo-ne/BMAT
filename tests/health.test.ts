import { describe, expect, it, vi } from "vitest";
import { buildReadiness, humanAge, projectHost, summarize, type FetchResult, type HealthInput } from "@/lib/health";

/**
 * /setup and /api/health are how an operator answers "did my env vars take
 * effect?" without guessing. The probe must never cry wolf: a demo deployment
 * is a valid state, and only real breakage may be reported as failing.
 */
const URL_ = "https://abcdefghijkl.supabase.co";
const KEY = "anon-key-not-a-secret";
const NOW = new Date("2026-11-04T12:00:00Z");

type Route = { match: string; status?: number; body?: unknown; throws?: string };

const input = (routes: Route[], overrides: Partial<HealthInput> = {}): HealthInput => ({
  supabaseUrl: URL_,
  anonKey: KEY,
  siteUrl: "https://eastsound.vercel.app",
  now: () => NOW,
  fetch: async (url): Promise<FetchResult> => {
    const route = routes.find((r) => url.includes(r.match));
    if (!route) throw new Error(`unexpected request: ${url}`);
    if (route.throws) throw new Error(route.throws);
    return { status: route.status ?? 200, body: route.body ?? null };
  },
  ...overrides,
});

const HEALTHY: Route[] = [
  { match: "/auth/v1/health", body: { name: "GoTrue", version: "2.1" } },
  { match: "profiles?select=id", body: [{ id: "u1" }] },
  { match: "rpc/public_ingest_health", body: { stations: 14, monitored: 7, stream_ready: 12, last_heartbeat: "2026-11-04T11:59:00Z", last_detection: "2026-11-04T11:58:00Z" } },
];
const withDetection = (at: string | null, heartbeat: string | null = "2026-11-04T11:59:00Z"): Route[] => [
  ...HEALTHY.filter((r) => !r.match.includes("public_ingest_health")),
  { match: "rpc/public_ingest_health", body: { stations: 14, monitored: 7, stream_ready: 12, last_heartbeat: heartbeat, last_detection: at } },
];

const byId = (r: Awaited<ReturnType<typeof buildReadiness>>, id: string) => r.checks.find((c) => c.id === id)!;

describe("buildReadiness", () => {
  it("reports demo mode as a valid, non-crashing state", async () => {
    const report = await buildReadiness(input([], { supabaseUrl: "", anonKey: "" }));
    expect(report.mode).toBe("demo");
    expect(report.ready).toBe(false);
    expect(byId(report, "env").state).toBe("fail");
    expect(byId(report, "env").fix).toMatch(/NEXT_PUBLIC_SUPABASE_URL/);
    for (const id of ["auth", "schema", "stations", "ingest"]) {
      expect(byId(report, id).state).toBe("skip");
    }
  });

  it("passes every check on a healthy live deployment", async () => {
    const report = await buildReadiness(input(HEALTHY));
    expect(report.mode).toBe("live");
    expect(report.ready).toBe(true);
    expect(report.project).toBe("abcdefghijkl.supabase.co");
    expect(report.checks.filter((c) => c.state === "fail")).toHaveLength(0);
    expect(byId(report, "stations").detail).toBe("14 stations in the panel, 12 with a stream URL.");
    expect(byId(report, "ingest").detail).toMatch(/Last detection/);
  });

  it("repeats the worker's own reason when streams cannot be read", async () => {
    const report = await buildReadiness(
      input([
        { match: "/auth/v1/health", body: { name: "GoTrue" } },
        { match: "profiles?select=id", body: [{ id: "u1" }] },
        {
          match: "rpc/public_ingest_health",
          body: {
            stations: 28, monitored: 25, stream_ready: 26, stream_errors: 25,
            sample_error: "Server returned 403 Forbidden (access denied)",
            worker_build: "9e216e4", last_heartbeat: "2026-11-04T11:59:00Z", last_detection: null,
          },
        },
      ]),
    );
    const check = byId(report, "stations");
    expect(check.state).toBe("ok");
    expect(check.detail).toContain("25 of them report a stream error");
    expect(check.fix).toContain("403 Forbidden");
    expect(check.fix).toMatch(/from Uganda or Kenya/);
    expect(report.ready).toBe(true);
  });

  it("does not blame missing masters when the streams are unreadable", async () => {
    const report = await buildReadiness(
      input([
        { match: "/auth/v1/health", body: { name: "GoTrue" } },
        { match: "profiles?select=id", body: [{ id: "u1" }] },
        {
          match: "rpc/public_ingest_health",
          body: {
            stations: 28, monitored: 25, stream_ready: 26, stream_errors: 25,
            sample_error: "Server returned 403 Forbidden (access denied)",
            worker_build: "9e216e4", last_heartbeat: "2026-11-04T11:59:00Z", last_detection: null,
          },
        },
      ]),
    );
    const ingest = byId(report, "ingest");
    expect(ingest.state).toBe("warn");
    expect(ingest.detail).toMatch(/cannot read 25 stations/);
    expect(ingest.fix).toContain("403 Forbidden");
    expect(ingest.fix).not.toMatch(/Upload songs/);
    // "Did my deploy land?" — the heartbeat carries the commit.
    expect(ingest.detail).toContain("worker build 9e216e4");
  });

  it("calls out a project whose migrations were never run", async () => {
    const report = await buildReadiness(
      input([
        { match: "/auth/v1/health", body: {} },
        { match: "profiles?select=id", status: 404, body: { message: "relation \"public.profiles\" does not exist", code: "42P01" } },
        { match: "rpc/public_ingest_health", status: 404, body: { message: "Could not find the function public.public_ingest_health", code: "PGRST202" } },
      ]),
    );
    const schema = byId(report, "schema");
    expect(schema.state).toBe("fail");
    expect(schema.detail).toContain("42P01");
    expect(schema.fix).toMatch(/0001_rbac_schema\.sql/);
    expect(report.ready).toBe(false);
  });

  it("distinguishes an unreachable project from a wrong key", async () => {
    const unreachable = await buildReadiness(
      input([{ match: "/auth/v1/health", throws: "getaddrinfo ENOTFOUND" }]),
    );
    expect(byId(unreachable, "auth").state).toBe("fail");
    expect(byId(unreachable, "auth").detail).toContain("ENOTFOUND");

    const badKey = await buildReadiness(
      input([{ match: "/auth/v1/health", status: 401, body: { message: "Invalid API key" } }]),
    );
    expect(byId(badKey, "auth").state).toBe("fail");
    expect(byId(badKey, "auth").detail).toContain("Invalid API key");
    expect(byId(badKey, "auth").fix).toMatch(/anon key/);
  });

  it("warns when the station panel is empty", async () => {
    const report = await buildReadiness(
      input([
        { match: "/auth/v1/health", body: {} },
        { match: "profiles?select=id", body: [] },
        { match: "rpc/public_ingest_health", body: { stations: 0, monitored: 0, last_heartbeat: null, last_detection: null } },
      ]),
    );
    expect(byId(report, "stations").state).toBe("warn");
    expect(byId(report, "stations").detail).toMatch(/No stations/);
    expect(report.ready).toBe(true); // warnings must not fail the deployment
  });

  it("warns when detections stop arriving", async () => {
    const fresh = await buildReadiness(
      input(withDetection("2026-11-04T11:50:00Z")),
    );
    expect(byId(fresh, "ingest").state).toBe("ok");
    expect(byId(fresh, "ingest").detail).toBe("Last detection 10 minutes ago.");

    // Worker up, matching nothing: the fix is masters, not hosting.
    const quiet = await buildReadiness(
      input(withDetection("2026-11-02T09:00:00Z", "2026-11-04T11:59:00Z")),
    );
    expect(byId(quiet, "ingest").state).toBe("warn");
    expect(byId(quiet, "ingest").detail).toMatch(/worker is up, but the last detection was 2 days ago/);
    expect(byId(quiet, "ingest").fix).toMatch(/Upload songs/);
    expect(quiet.ready).toBe(true);
  });

  it("says the worker is stopped when the heartbeat goes quiet", async () => {
    // Status columns can say "online" forever; only the heartbeat knows.
    const stale = await buildReadiness(
      input(withDetection("2026-11-02T09:00:00Z", "2026-11-02T08:59:00Z")),
    );
    expect(byId(stale, "ingest").state).toBe("warn");
    expect(byId(stale, "ingest").detail).toBe(
      "The worker last reported 2 days ago — it is not running, so no station is being recorded.",
    );
    expect(byId(stale, "ingest").fix).toMatch(/always-on host/);
    expect(stale.ready).toBe(true);
  });

  it("reads the panel through the health function, not the RLS-protected tables", async () => {
    const seen: string[] = [];
    const base = input(HEALTHY);
    await buildReadiness({ ...base, fetch: (u, h) => { seen.push(u); return base.fetch(u, h); } });
    expect(seen.some((u) => u.includes("rpc/public_ingest_health"))).toBe(true);
    expect(seen.some((u) => /stations\?|detections\?/.test(u))).toBe(false);
  });

  it("tells the operator to install the health function when it is missing", async () => {
    const report = await buildReadiness(
      input([
        ...HEALTHY.filter((r) => !r.match.includes("public_ingest_health")),
        { match: "rpc/public_ingest_health", status: 404, body: { message: "Could not find the function public.public_ingest_health without parameters", code: "PGRST202" } },
      ]),
    );
    for (const id of ["stations", "ingest"]) {
      expect(byId(report, id).state).toBe("warn");
      expect(byId(report, id).fix).toMatch(/0006_public_ingest_health\.sql/);
    }
    expect(report.ready).toBe(true);
  });

  it("warns, rather than claiming success, when no detection has ever arrived", async () => {
    const report = await buildReadiness(input(withDetection(null)));
    expect(byId(report, "ingest").state).toBe("warn");
    expect(byId(report, "ingest").detail).toMatch(/worker is up; no plays recorded yet/i);
    expect(byId(report, "ingest").fix).toMatch(/Upload songs/);

    // Never started at all: a different fix (hosting, not masters).
    const never = await buildReadiness(input(withDetection(null, null)));
    expect(byId(never, "ingest").detail).toMatch(/never reported/);
    expect(byId(never, "ingest").fix).toMatch(/always-on host/);

    // Up, but no station enabled: don't send the operator hunting for masters.
    const idle = await buildReadiness(input([
      ...HEALTHY.filter((r) => !r.match.includes("public_ingest_health")),
      { match: "rpc/public_ingest_health", body: { stations: 14, monitored: 0, stream_ready: 12, last_heartbeat: "2026-11-04T11:59:00Z", last_detection: null } },
    ]));
    expect(byId(idle, "ingest").state).toBe("warn");
    expect(byId(idle, "ingest").fix).toMatch(/Enable at least one station/);
  });

  it("flags a non-HTTPS project URL and a missing site URL", async () => {
    const report = await buildReadiness(
      input(HEALTHY, { supabaseUrl: "http://localhost:54321", siteUrl: "" }),
    );
    expect(byId(report, "url").state).toBe("fail");
    expect(byId(report, "site-url").state).toBe("warn");
  });

  it("never echoes the anon key back", async () => {
    const report = await buildReadiness(input(HEALTHY));
    expect(JSON.stringify(report)).not.toContain(KEY);
  });
});

describe("humanAge", () => {
  it.each([
    [0, "just now"],
    [45_000, "just now"],
    [60_000, "1 minute ago"],
    [5 * 60_000, "5 minutes ago"],
    [3 * 3_600_000, "3 hours ago"],
    [2 * 86_400_000, "2 days ago"],
  ])("formats %i ms as %s", (ms, expected) => {
    expect(humanAge(ms)).toBe(expected);
  });

  it("handles nonsense input", () => {
    expect(humanAge(Number.NaN)).toBe("unknown");
    expect(humanAge(-1)).toBe("unknown");
  });
});

describe("summarize", () => {
  it("describes each state in one line", async () => {
    const demo = await buildReadiness(input([], { supabaseUrl: "", anonKey: "" }));
    expect(summarize(demo)).toMatch(/Demo mode/);

    const healthy = await buildReadiness(input(HEALTHY));
    expect(summarize(healthy)).toBe("Live and healthy.");

    const warn = await buildReadiness(
      input(withDetection(null)),
    );
    expect(summarize(warn)).toBe("Live, with 1 warning.");

    const broken = await buildReadiness(input([{ match: "/auth/v1/health", status: 500, body: {} }]));
    expect(summarize(broken)).toMatch(/^Not ready/);
  });
});

describe("projectHost", () => {
  it("masks everything but the host", () => {
    expect(projectHost("https://abcdefghijkl.supabase.co/auth?x=1")).toBe("abcdefghijkl.supabase.co");
    expect(projectHost("")).toBe("");
    expect(projectHost("not a url")).toBe("");
  });
});

describe("httpFetcher", () => {
  it("parses JSON and tolerates empty or non-JSON bodies", async () => {
    const { httpFetcher } = await import("@/lib/health");
    const realFetch = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (url: string) => {
      calls.push(String(url));
      const body = String(url).includes("empty") ? "" : String(url).includes("html") ? "<html>" : '{"ok":true}';
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch;
    try {
      expect(await httpFetcher("https://x.test/json", {})).toEqual({ status: 200, body: { ok: true } });
      expect(await httpFetcher("https://x.test/empty", {})).toEqual({ status: 200, body: null });
      expect(await httpFetcher("https://x.test/html", {})).toEqual({ status: 200, body: "<html>" });
      expect(calls).toHaveLength(3);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
