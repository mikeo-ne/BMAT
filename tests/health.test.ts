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
  siteUrl: "https://bmat-rho.vercel.app",
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
  { match: "stations?select=slug", body: Array.from({ length: 14 }, (_, i) => ({ slug: `s${i}` })) },
  { match: "detections?select=detected_at", body: [{ detected_at: "2026-11-04T11:58:00Z" }] },
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
    expect(byId(report, "stations").detail).toBe("14 stations in the panel.");
    expect(byId(report, "ingest").detail).toMatch(/Last detection/);
  });

  it("calls out a project whose migrations were never run", async () => {
    const report = await buildReadiness(
      input([
        { match: "/auth/v1/health", body: {} },
        { match: "profiles?select=id", status: 404, body: { message: "relation \"public.profiles\" does not exist", code: "42P01" } },
        { match: "stations?select=slug", status: 404, body: { message: "relation does not exist", code: "42P01" } },
        { match: "detections?select=detected_at", status: 404, body: { message: "relation does not exist", code: "42P01" } },
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
        { match: "stations?select=slug", body: [] },
        { match: "detections?select=detected_at", body: [] },
      ]),
    );
    expect(byId(report, "stations").state).toBe("warn");
    expect(byId(report, "stations").detail).toMatch(/No stations/);
    expect(report.ready).toBe(true); // warnings must not fail the deployment
  });

  it("warns when detections stop arriving", async () => {
    const fresh = await buildReadiness(
      input([...HEALTHY.filter((r) => !r.match.includes("detections")), { match: "detections", body: [{ detected_at: "2026-11-04T11:50:00Z" }] }]),
    );
    expect(byId(fresh, "ingest").state).toBe("ok");
    expect(byId(fresh, "ingest").detail).toBe("Last detection 10 minutes ago.");

    const stale = await buildReadiness(
      input([...HEALTHY.filter((r) => !r.match.includes("detections")), { match: "detections", body: [{ detected_at: "2026-11-02T09:00:00Z" }] }]),
    );
    expect(byId(stale, "ingest").state).toBe("warn");
    expect(byId(stale, "ingest").detail).toContain("looks stopped");
    expect(stale.ready).toBe(true);
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
      input([...HEALTHY.filter((r) => !r.match.includes("detections")), { match: "detections", body: [] }]),
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
