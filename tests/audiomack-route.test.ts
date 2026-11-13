import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ role: "artist", allowed: true, gateError: false, rpc: 0, official: 0, legacy: 0 }));
vi.mock("@/lib/supabase/config", () => ({ SUPABASE_URL: "https://project.supabase.co", SUPABASE_ANON_KEY: "anon" }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({
  auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: h.role } }) }) }) }),
  rpc: async () => { h.rpc++; return { data: h.allowed, error: h.gateError ? {} : null }; },
}) }));
vi.mock("@/lib/links/resolve", () => ({ resolveLink: async (url: string) => { h.legacy++; return { url, ok: false, error: "legacy" }; } }));
vi.mock("@/lib/catalog/audiomack", () => ({ audiomackPath: (url: string) => url.includes("/song/") ? "/valid" : null,
  resolveAudiomack: async (url: string) => { h.official++; return { url, ok: true, platform: "Audiomack API", songs: [] }; } }));
const { POST } = await import("@/app/api/songs/from-links/route");
const req = (url: string, token = "good") => new Request("https://example.test/api/songs/from-links", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ urls: [url] }) });
const url = "https://audiomack.com/azawi/song/slow-dancing";
beforeEach(() => { Object.assign(h, { role: "artist", allowed: true, gateError: false, rpc: 0, official: 0, legacy: 0 }); vi.stubEnv("AUDIOMACK_API_ENABLED", "false"); vi.stubEnv("AUDIOMACK_CONSUMER_KEY", "key"); vi.stubEnv("AUDIOMACK_CONSUMER_SECRET", "secret"); });
afterEach(() => vi.unstubAllEnvs());

describe("Audiomack official API routing", () => {
  it("keeps the existing resolver while the official integration is disabled", async () => {
    await POST(req(url)); expect(h.legacy).toBe(1); expect(h.official).toBe(0); expect(h.rpc).toBe(0);
  });
  it("requires an artist or label and blocks before making a lookup", async () => {
    vi.stubEnv("AUDIOMACK_API_ENABLED", "true"); h.role = "venue";
    expect((await POST(req(url))).status).toBe(403); expect(h.official).toBe(0); expect(h.rpc).toBe(0);
  });
  it("fails closed when credentials or the rate gate are missing, with no scraping fallback", async () => {
    vi.stubEnv("AUDIOMACK_API_ENABLED", "true"); vi.stubEnv("AUDIOMACK_CONSUMER_SECRET", "");
    let result = await (await POST(req(url))).json();
    expect(result.results[0].error).toMatch(/isn't configured/); expect(h.official).toBe(0); expect(h.legacy).toBe(0);
    vi.stubEnv("AUDIOMACK_CONSUMER_SECRET", "secret"); h.gateError = true;
    result = await (await POST(req(url))).json(); expect(result.results[0].error).toMatch(/temporarily unavailable/);
    h.gateError = false; h.allowed = false;
    result = await (await POST(req(url))).json(); expect(result.results[0].error).toMatch(/wait/);
    expect(h.official).toBe(0); expect(h.legacy).toBe(0);
  });
  it("routes approved and admitted requests to the official provider", async () => {
    vi.stubEnv("AUDIOMACK_API_ENABLED", "true");
    const res = await POST(req(url)); expect(res.status).toBe(200); expect(res.headers.get("cache-control")).toBe("no-store");
    expect((await res.json()).results[0].platform).toBe("Audiomack API"); expect(h.rpc).toBe(1); expect(h.official).toBe(1); expect(h.legacy).toBe(0);
  });
});
