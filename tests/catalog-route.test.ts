import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ user: true, role: "artist", admitted: true, gateError: false, rpcCalls: 0 }));
vi.mock("@/lib/supabase/config", () => ({ SUPABASE_URL: "https://project.supabase.co", SUPABASE_ANON_KEY: "anon" }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({
  auth: { getUser: async () => ({ data: { user: h.user ? { id: "u1" } : null }, error: null }) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: h.role } }) }) }) }),
  rpc: async () => { h.rpcCalls++; return { data: h.admitted, error: h.gateError ? { message: "missing" } : null }; },
}) }));
const { POST } = await import("@/app/api/songs/musicbrainz/route");
const req = (body: unknown, token = "token") => new Request("https://eastsound.test/api/songs/musicbrainz", {
  method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
});
beforeEach(() => {
  Object.assign(h, { user: true, role: "artist", admitted: true, gateError: false, rpcCalls: 0 });
  vi.stubEnv("MUSICBRAINZ_ENABLED", "true"); vi.stubEnv("MUSICBRAINZ_USER_AGENT", "EastSound/1 (ops@example.org)");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("MusicBrainz onboarding route", () => {
  it("blocks anonymous, expired and other roles before provider calls", async () => {
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    expect((await POST(req({ isrc: "UGA2F2100082" }, ""))).status).toBe(401);
    h.user = false; expect((await POST(req({ isrc: "UGA2F2100082" }))).status).toBe(401);
    h.user = true; h.role = "broadcaster"; expect((await POST(req({ isrc: "UGA2F2100082" }))).status).toBe(403);
    expect(f).not.toHaveBeenCalled(); expect(h.rpcCalls).toBe(0);
  });
  it("is disabled by default and rejects invalid input before consuming a slot", async () => {
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    vi.stubEnv("MUSICBRAINZ_ENABLED", "false");
    expect((await POST(req({ isrc: "UGA2F2100082" }))).status).toBe(503);
    vi.stubEnv("MUSICBRAINZ_ENABLED", "true");
    expect((await POST(req({ isrc: "invalid" }))).status).toBe(400);
    expect(h.rpcCalls).toBe(0); expect(f).not.toHaveBeenCalled();
  });
  it("fails closed when the distributed gate fails or is busy", async () => {
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    h.gateError = true; expect((await POST(req({ isrc: "UGA2F2100082" }))).status).toBe(503);
    h.gateError = false; h.admitted = false; expect((await POST(req({ isrc: "UGA2F2100082" }))).status).toBe(429);
    expect(f).not.toHaveBeenCalled();
  });
  it("returns suggestions, no writes, and keeps the response private", async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ recordings: [{ id: "1", title: "Song", "artist-credit": [{ name: "Artist" }] }] }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    const res = await POST(req({ isrc: "UG-A2F-21-00082" }));
    expect(res.status).toBe(200); expect(res.headers.get("cache-control")).toBe("no-store");
    expect((await res.json()).candidates).toMatchObject([{ title: "Song", artistName: "Artist", isrc: "UGA2F2100082" }]);
    expect(h.rpcCalls).toBe(1); expect(f).toHaveBeenCalledTimes(1);
  });
});
