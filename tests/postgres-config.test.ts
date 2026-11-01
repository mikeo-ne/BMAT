import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  createPostgresPool,
  postgresStorageEnabled,
  requiredUuid,
} from "@/lib/postgres/pool";

afterEach(() => vi.unstubAllEnvs());
describe("explicit PostgreSQL configuration boundaries", () => {
  it("defaults to files, selects PostgreSQL explicitly and refuses an unknown backend", () => {
    vi.stubEnv("EAST_SOUND_STATIC_EXPORT", "0");
    vi.stubEnv("EAST_SOUND_STORAGE_BACKEND", undefined);
    expect(postgresStorageEnabled()).toBe(false);
    vi.stubEnv("EAST_SOUND_STORAGE_BACKEND", "postgres");
    expect(postgresStorageEnabled()).toBe(true);
    vi.stubEnv("EAST_SOUND_STORAGE_BACKEND", "postgre");
    expect(() => postgresStorageEnabled()).toThrow(/Unsupported/);
  });
  it("always forces public file mode in a static export, without needing credentials", () => {
    vi.stubEnv("EAST_SOUND_STATIC_EXPORT", "1");
    vi.stubEnv("EAST_SOUND_STORAGE_BACKEND", "postgres");
    vi.stubEnv("DATABASE_URL", undefined);
    expect(postgresStorageEnabled()).toBe(false);
  });
  it.each([
    "",
    "not-a-uuid",
    "00000000-0000-0000-0000-000000000000",
    "user_123",
    "123e4567-e89b-12d3-a456-426614174000\n",
  ])("rejects a missing/malformed/nil principal %j", (value) => {
    vi.stubEnv("EAST_SOUND_NOTIFICATION_USER_ID", value);
    expect(() => requiredUuid("EAST_SOUND_NOTIFICATION_USER_ID")).toThrow(
      /non-nil UUID/,
    );
  });
  it("accepts a real UUID representation without inventing a principal", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    vi.stubEnv("EAST_SOUND_TENANT_ID", id);
    expect(requiredUuid("EAST_SOUND_TENANT_ID")).toBe(id);
  });
  it.each([
    "",
    "?sslmode=disable",
    "?sslmode=require",
    "?sslmode=prefer",
    "?sslmode=verify-ca",
  ])(
    "refuses remote PostgreSQL without full certificate/hostname verification %s",
    (suffix) => {
      expect(() =>
        createPostgresPool(
          "postgresql://user:never-log-this@remote.example.com/db" + suffix,
        ),
      ).toThrow(/sslmode=verify-full/);
    },
  );
  it.each(["localhost", "127.0.0.1", "[::1]"])(
    "permits loopback development without opening a connection at import/creation time (%s)",
    async (host) => {
      const pool = createPostgresPool(`postgresql://qa:qa@${host}:1/postgres`);
      expect(pool.totalCount).toBe(0);
      await pool.end();
    },
  );
  it("accepts verified remote TLS configuration lazily without connecting to it", async () => {
    const pool = createPostgresPool(
      "postgresql://qa:qa@remote.example.com/db?sslmode=verify-full",
    );
    expect(pool.totalCount).toBe(0);
    await pool.end();
  });
  it("sanitizes invalid connection configuration instead of exposing URL credentials", () => {
    vi.stubEnv("DATABASE_URL", undefined);
    expect(() => createPostgresPool()).toThrow(/Configure DATABASE_URL/);
    expect(() => createPostgresPool("not-a-url")).toThrow(
      "Use a valid PostgreSQL DATABASE_URL.",
    );
    expect(() =>
      createPostgresPool("https://qa:never-log-this@remote.example.com/db"),
    ).toThrow("Use a PostgreSQL DATABASE_URL.");
  });
});
