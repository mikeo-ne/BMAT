import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testActor } from "@/tests/fixtures/auth";
vi.mock("server-only", () => ({}));
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "east-sound-auth-"));
  vi.stubEnv("EAST_SOUND_DATA_DIR", directory);
  vi.stubEnv("EAST_SOUND_STORAGE_BACKEND", "file");
  vi.resetModules();
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
const context = (action: string) => ({ params: Promise.resolve({ action }) });
const json = (
  action: string,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  new Request("https://app.example.com/api/auth/" + action, {
    method: "POST",
    headers: {
      origin: "https://app.example.com",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
describe("authoritative authentication and session security", () => {
  it("uses salted scrypt, constant-length session hashes and a private file instead of browser bearer storage", async () => {
    const actor = await testActor(),
      auth = await import("@/lib/auth");
    expect(
      await auth.verifyPassword(
        "Test only password with 26 characters!",
        actor.user.passwordHash,
      ),
    ).toBe(true);
    expect(await auth.verifyPassword("wrong", actor.user.passwordHash)).toBe(
      false,
    );
    expect(actor.user.passwordHash).toMatch(/^scrypt:32768:8:3:/);
    const filename = path.join(directory, "security/accounts.json"),
      raw = await readFile(filename, "utf8");
    expect(raw).not.toContain(actor.token);
    expect(raw).not.toContain("Test only password");
    expect((await stat(filename)).mode & 0o777).toBe(0o600);
    expect(
      (await auth.requestSession(actor.request("/api/auth/session")))?.user.id,
    ).toBe(actor.user.id);
  });
  it("registers master-schema roles, rejects invalid roles, and sets HttpOnly/Secure/SameSite session cookies", async () => {
    const route = await import("@/app/api/auth/[action]/route");
    // All five master roles are accepted at registration.
    const denied = await route.POST(
      json("register", {
        email: "rogue@example.com",
        password: "A test password long enough",
        name: "Rogue",
        role: "superadmin",
      }),
      context("register"),
    );
    expect(denied.status).toBe(422);
    const result = await route.POST(
      json("register", {
        email: "Artist@Example.com",
        password: "A test password long enough",
        name: "Real Artist",
        stationIds: ["cbs-kla"],
      }),
      context("register"),
    );
    expect(result.status).toBe(201);
    const cookie = result.headers.get("set-cookie")!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Secure/);
    const body = await result.json();
    expect(body.user).toMatchObject({
      role: "artist",
      email: "artist@example.com",
      stationIds: [],
    });
    expect(body).not.toHaveProperty("token");
    expect(body.user).not.toHaveProperty("passwordHash");
  });
  it("rejects weak passwords, malformed JSON, duplicate accounts and unsafe redirect destinations", async () => {
    const route = await import("@/app/api/auth/[action]/route");
    expect(
      (
        await route.POST(
          json("register", {
            email: "a@example.com",
            password: "short",
            name: "Test",
          }),
          context("register"),
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await route.POST(
          new Request("https://app.example.com/api/auth/login", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{",
          }),
          context("login"),
        )
      ).status,
    ).toBe(400);
    const actor = await testActor();
    const result = await route.POST(
      json("login", {
        email: actor.user.email,
        password: "Test only password with 26 characters!",
        next: "//evil.example.com",
      }),
      context("login"),
    );
    expect(result.status).toBe(200);
    expect((await result.json()).next).toBe("/dashboard/artist");
    expect(
      (
        await route.POST(
          json("register", {
            email: actor.user.email,
            password: "A test password long enough",
            name: "Duplicate",
          }),
          context("register"),
        )
      ).status,
    ).toBe(409);
  });
  it("requires both a current session and CSRF for writes, rejects cross-origin calls and invalidates logout immediately", async () => {
    const actor = await testActor(),
      tracks = await import("@/app/api/tracks/route"),
      route = await import("@/app/api/auth/[action]/route");
    expect(
      (
        await tracks.GET(
          new Request("https://app.example.com/api/tracks", {
            headers: {
              "x-user-id": actor.user.id,
              "x-role": "cmo",
              authorization: "Bearer invented-localStorage-token",
            },
          }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await tracks.PUT(
          actor.request("/api/tracks", {
            method: "PUT",
            headers: { "x-east-sound-csrf": "" },
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await tracks.PUT(
          actor.request("/api/tracks", {
            method: "PUT",
            headers: { origin: "https://evil.example.com" },
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await route.POST(
          actor.request("/api/auth/logout", { method: "POST" }),
          context("logout"),
        )
      ).status,
    ).toBe(200);
    expect((await tracks.GET(actor.request("/api/tracks"))).status).toBe(401);
  });
  it("rate-limits email/password guesses without exposing account existence", async () => {
    const auth = await import("@/lib/auth");
    for (let i = 0; i < 10; i++)
      await expect(
        auth.loginAccount("missing@example.com", "wrong"),
      ).rejects.toMatchObject({ status: 401 });
    await expect(
      auth.loginAccount("missing@example.com", "wrong"),
    ).rejects.toMatchObject({ status: 429 });
  });
  it("never enables development OAuth in production or a reference/static deployment", async () => {
    const auth = await import("@/lib/auth");
    vi.stubEnv("EAST_SOUND_MOCK_OAUTH", "1");
    vi.stubEnv("NODE_ENV", "test");
    expect(auth.mockOAuthEnabled()).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(auth.mockOAuthEnabled()).toBe(false);
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL", "1");
    expect(auth.mockOAuthEnabled()).toBe(false);
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("EAST_SOUND_STATIC_EXPORT", "1");
    expect(auth.mockOAuthEnabled()).toBe(false);
  });
  it("separates four assigned roles and rejects expired, duplicated and forged cookies", async () => {
    const actor = await testActor(),
      auth = await import("@/lib/auth"),
      store = await import("@/lib/security-store");
    expect(
      await auth.requestSession(
        new Request("https://app.example.com", {
          headers: {
            cookie: `east_sound_session=${actor.token}; east_sound_session=${actor.token}`,
          },
        }),
      ),
    ).toBeNull();
    expect(await auth.sessionForToken("a".repeat(64))).toBeNull();
    await store.revokeSession(auth.tokenHash(actor.token));
    await store.putSession({
      ...actor.session,
      expiresAt: new Date(0).toISOString(),
    });
    expect(await auth.sessionForToken(actor.token)).toBeNull();
  });
});

describe("request origin follows the addressed host, not the bind address", () => {
  it("resolves the expected origin from the Host header when Next binds 0.0.0.0", async () => {
    const auth = await import("@/lib/auth");
    // Next.js builds request.url from the bound interface; the browser
    // addresses the server by the Host header instead.
    const request = new Request("http://0.0.0.0:3000/api/auth/login", {
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "x-forwarded-proto": "http",
      },
    });
    expect(auth.requestOrigin(request)).toBe("http://localhost:3000");
    expect(() => auth.assertSameOrigin(request)).not.toThrow();
  });
  it("accepts the preview host and uses the forwarded protocol for https", async () => {
    const auth = await import("@/lib/auth");
    const preview = "https://3000-abc123.e2b.app";
    const request = new Request("http://0.0.0.0:3000/api/playout", {
      headers: {
        "x-forwarded-host": "3000-abc123.e2b.app",
        "x-forwarded-proto": "https",
        origin: preview,
      },
    });
    expect(auth.requestOrigin(request)).toBe(preview);
    expect(() => auth.assertSameOrigin(request)).not.toThrow();
  });
  it("still rejects a mismatched origin", async () => {
    const auth = await import("@/lib/auth");
    const request = new Request("http://0.0.0.0:3000/api/auth/login", {
      headers: {
        host: "localhost:3000",
        origin: "http://evil.example",
      },
    });
    expect(auth.requestOrigin(request)).toBe("http://localhost:3000");
    expect(() => auth.assertSameOrigin(request)).toThrow(/Cross-origin/);
  });
  it("keeps the configured EAST_SOUND_APP_ORIGIN override authoritative", async () => {
    const auth = await import("@/lib/auth");
    vi.stubEnv("EAST_SOUND_APP_ORIGIN", "https://fixed.example");
    const request = new Request("http://0.0.0.0:3000/api/auth/login", {
      headers: { host: "localhost:3000", origin: "https://fixed.example" },
    });
    expect(auth.requestOrigin(request)).toBe("https://fixed.example");
    expect(() => auth.assertSameOrigin(request)).not.toThrow();
    vi.unstubAllEnvs();
  });
  it("derives cookie Secure policy from the addressed host", async () => {
    const auth = await import("@/lib/auth");
    const expires = new Date(Date.now() + 3_600_000).toISOString();
    const localhostRequest = new Request("http://0.0.0.0:3000/api/auth/login", {
      headers: { host: "localhost:3000", "x-forwarded-proto": "http" },
    });
    const httpsRequest = new Request("http://0.0.0.0:3000/api/auth/login", {
      headers: {
        "x-forwarded-host": "3000-abc123.e2b.app",
        "x-forwarded-proto": "https",
      },
    });
    expect(auth.cookieHeader(localhostRequest, "a".repeat(64), expires)).not.toContain(
      "Secure",
    );
    expect(auth.cookieHeader(httpsRequest, "a".repeat(64), expires)).toContain(
      "Secure",
    );
  });
});
