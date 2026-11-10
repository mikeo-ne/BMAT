import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Push sending spends nothing per message but can fail loudly in the wrong
 * direction: sending to someone else's device, or claiming success when every
 * provider rejected. These tests pin the contract.
 */
const h = vi.hoisted(() => ({
  subs: [] as { id: string; endpoint: string; p256dh: string; auth: string; profile_id: string }[],
  selectError: null as { message: string } | null,
  sent: [] as { endpoint: string; payload: string }[],
  rejected: new Map<string, number>(),
  deleted: [] as string[],
  failureBumps: [] as string[][],
  vapid: [] as string[],
}));

vi.mock("@/lib/supabase/config", () => ({
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_ANON_KEY: "anon",
  SITE_URL: "https://eastsound.vercel.app",
  isSupabaseConfigured: true,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => {
      const result = { data: h.subs, error: h.selectError };
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "limit", "eq"]) chain[m] = () => chain;
      chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej);
      chain.delete = () => ({
        in: (_col: string, ids: string[]) => {
          h.deleted.push(...ids);
          return Promise.resolve({ data: null, error: null });
        },
      });
      void table;
      return chain;
    },
    rpc: (_name: string, args: { p_ids: string[] }) => {
      h.failureBumps.push(args.p_ids);
      return Promise.resolve({ data: null, error: null });
    },
  }),
}));

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: (_subject: string, pub: string) => h.vapid.push(pub),
    sendNotification: async (sub: { endpoint: string }, payload: string) => {
      const status = h.rejected.get(sub.endpoint);
      if (status) throw Object.assign(new Error("push rejected"), { statusCode: status });
      h.sent.push({ endpoint: sub.endpoint, payload });
    },
  },
}));

const { POST, GET } = await import("@/app/api/push/send/route");

const call = (body: unknown, token = "cron-secret") =>
  new Request("https://eastsound.vercel.app/api/push/send", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  h.subs = [
    { id: "s1", endpoint: "https://push.example/one", p256dh: "k1", auth: "a1", profile_id: "user-1" },
    { id: "s2", endpoint: "https://push.example/two", p256dh: "k2", auth: "a2", profile_id: "user-2" },
  ];
  h.selectError = null;
  h.sent = [];
  h.rejected = new Map();
  h.deleted = [];
  h.failureBumps = [];
  h.vapid = [];
  vi.stubEnv("CRON_SECRET", "cron-secret");
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "public-key");
  vi.stubEnv("VAPID_PRIVATE_KEY", "private-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
});

afterEach(() => vi.unstubAllEnvs());

describe("configuration gates", () => {
  it("refuses to run without CRON_SECRET", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await POST(call({ title: "t", body: "b" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/switched off/);
  });

  it("rejects a wrong secret", async () => {
    const res = await POST(call({ title: "t", body: "b" }, "nope"));
    expect(res.status).toBe(401);
  });

  it("says so plainly when VAPID keys are missing", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    const res = await POST(call({ title: "t", body: "b" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/VAPID keys are not set/);
  });

  it("requires a title and body", async () => {
    const res = await POST(call({ title: "only a title" }));
    expect(res.status).toBe(400);
  });
});

describe("sending", () => {
  it("sends the payload to every subscription", async () => {
    const res = await POST(call({ title: "First spin", body: "Kampala Nights on Capital FM", url: "/dashboard" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ subscriptions: 2, sent: 2, removed: 0, failed: 0 });
    expect(h.sent).toHaveLength(2);
    expect(JSON.parse(h.sent[0].payload)).toMatchObject({ title: "First spin", url: "/dashboard" });
    expect(h.vapid).toEqual(["public-key"]);
  });

  it("removes subscriptions the browser has dropped (404/410)", async () => {
    h.rejected.set("https://push.example/two", 410);
    const res = await POST(call({ title: "t", body: "b" }));
    const body = await res.json();
    expect(body).toMatchObject({ sent: 1, removed: 1, failed: 0 });
    expect(h.deleted).toEqual(["s2"]);
  });

  it("counts other provider failures and records them on the device row", async () => {
    h.rejected.set("https://push.example/one", 500);
    const res = await POST(call({ title: "t", body: "b" }));
    const body = await res.json();
    expect(body).toMatchObject({ sent: 1, removed: 0, failed: 1 });
    expect(h.failureBumps[0]).toEqual(["s1"]);
  });

  it("surfaces a subscription read failure instead of reporting a silent success", async () => {
    h.selectError = { message: "permission denied" };
    const res = await POST(call({ title: "t", body: "b" }));
    expect(res.status).toBe(500);
    expect((await res.json()).detail).toContain("permission denied");
  });
});

describe("GET", () => {
  it("describes the endpoint and whether this deployment can send", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body).toMatchObject({ endpoint: "/api/push/send", method: "POST", configured: true });
  });
});
