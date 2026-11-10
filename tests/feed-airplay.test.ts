import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `/api/feed/airplay` must never widen what an account can read. It runs with
 * the caller's own token, so these tests pin down the contract: no token, no
 * rows; bad month, clear error; and the emitted CSV is exactly the documented
 * columns.
 */
const h = vi.hoisted(() => ({
  user: { id: "user-1", email: "cmo@example.com" } as { id: string; email: string } | null,
  authError: null as { message: string } | null,
  rows: [] as unknown[],
  queryError: null as { message: string } | null,
  calls: [] as { method: string; args: unknown[] }[],
}));

vi.mock("@/lib/supabase/config", () => ({
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_ANON_KEY: "anon-key",
  SITE_URL: "https://eastsound.vercel.app",
  isSupabaseConfigured: true,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "gte", "lte", "ilike", "order", "limit"]) {
      chain[method] = (...args: unknown[]) => {
        h.calls.push({ method, args });
        return chain;
      };
    }
    chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve({ data: h.rows, error: h.queryError }).then(resolve, reject);
    return {
      auth: { getUser: () => Promise.resolve({ data: { user: h.user }, error: h.authError }) },
      from: (table: string) => {
        h.calls.push({ method: "from", args: [table] });
        return chain;
      },
    };
  },
}));

const { GET } = await import("@/app/api/feed/airplay/route");

const req = (qs = "", token: string | null = "good-token") =>
  new Request(`https://eastsound.vercel.app/api/feed/airplay${qs}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

const sampleRow = {
  detected_at: "2026-11-02T05:14:00+00:00",
  source: "stream",
  confidence: 91.5,
  duration_sec: 198,
  evidence_path: "2026/11/02/capital.wav",
  matched_title: null,
  matched_artist: null,
  stations: { name: "Capital FM", region: "Central" },
  recordings: { title: 'Kampala, "Nights"', artist_name: "Nalu Akello", isrc: "UGABC2600001" },
};

beforeEach(() => {
  h.user = { id: "user-1", email: "cmo@example.com" };
  h.authError = null;
  h.rows = [sampleRow];
  h.queryError = null;
  h.calls = [];
});

describe("authorisation", () => {
  it("refuses a request with no bearer token and says how to send one", async () => {
    const res = await GET(req("", null));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("Bearer");
    const body = await res.json();
    expect(body.error).toMatch(/Missing bearer token/);
    expect(h.calls.some((c) => c.method === "from")).toBe(false);
  });

  it("refuses an expired or invalid token", async () => {
    h.user = null;
    h.authError = { message: "invalid JWT" };
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(h.calls.some((c) => c.method === "from")).toBe(false);
  });

  it("validates the month before touching the database", async () => {
    const res = await GET(req("?month=November"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/2026-11/);
    expect(h.calls.some((c) => c.method === "from")).toBe(false);
  });
});

describe("query shape", () => {
  it("scopes to the requested month in Kampala time and orders oldest first", async () => {
    await GET(req("?month=2026-11"));
    const gte = h.calls.find((c) => c.method === "gte");
    const lte = h.calls.find((c) => c.method === "lte");
    const order = h.calls.find((c) => c.method === "order");
    expect(gte?.args).toEqual(["detected_at", "2026-11-01T00:00:00+03:00"]);
    expect(lte?.args).toEqual(["detected_at", "2026-11-30T23:59:59.999+03:00"]);
    expect(order?.args).toEqual(["detected_at", { ascending: true }]);
  });

  it("filters by station slug only when one is given", async () => {
    await GET(req("?station=capital-fm"));
    expect(h.calls.find((c) => c.method === "ilike")?.args).toEqual(["stations.slug", "capital-fm"]);

    h.calls = [];
    await GET(req());
    expect(h.calls.some((c) => c.method === "ilike")).toBe(false);
  });

  it("clamps the limit", async () => {
    await GET(req("?limit=999999"));
    expect(h.calls.find((c) => c.method === "limit")?.args).toEqual([50_000]);
  });
});

describe("output", () => {
  it("returns JSON with the feed metadata and flattened rows", async () => {
    const res = await GET(req("?month=2026-11"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.meta).toMatchObject({ month: "2026-11", rows: 1, source: "https://eastsound.vercel.app" });
    expect(body.rows[0]).toMatchObject({ station: "Capital FM", region: "Central", title: 'Kampala, "Nights"', isrc: "UGABC2600001" });
  });

  it("returns a CSV with a BOM, CRLF rows and a downloadable filename", async () => {
    const res = await GET(req("?month=2026-11&format=csv"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain('filename="east-sound-airplay-2026-11.csv"');
    // `res.text()` decodes UTF-8 and drops the BOM — read the bytes instead.
    const bytes = new Uint8Array(await res.clone().arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    const text = await res.text();
    const lines = text.replace(/^\uFEFF/, "").trimEnd().split("\r\n");
    expect(lines[0]).toBe("detected_at,station,region,source,title,artist,isrc,confidence,duration_sec,evidence_path");
    expect(lines[1]).toContain('"Kampala, ""Nights"""');
    expect(res.headers.get("x-feed-rows")).toBe("1");
  });

  it("reports a failed query instead of an empty success", async () => {
    h.queryError = { message: "permission denied" };
    const res = await GET(req());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Feed query failed/);
    expect(body.detail).toContain("permission denied");
  });

  it("returns an empty, well-formed feed when the month has no plays", async () => {
    h.rows = [];
    const res = await GET(req("?month=2026-11&format=csv"));
    const text = await res.text();
    expect(text.replace(/^\uFEFF/, "").trimEnd().split("\r\n")).toHaveLength(1);
    expect(res.headers.get("x-feed-rows")).toBe("0");
  });
});
