import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { openSecret, sealSecret } from "@/lib/secret-vault";
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "east-sound-secret-"));
  vi.stubEnv("EAST_SOUND_DATA_DIR", directory);
  vi.stubEnv("EAST_SOUND_STORAGE_BACKEND", "file");
  vi.stubEnv("EAST_SOUND_SECRET_KEY", "");
  vi.stubEnv("VERCEL", "0");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
describe("write-only endpoint credential vault", () => {
  it("uses a private durable local key, including explicit VERCEL=0, and random authenticated nonces", async () => {
    const secret = "Synthetic test credential, never a provider token";
    const a = await sealSecret(secret),
      b = await sealSecret(secret);
    expect(a).not.toBe(b);
    expect(a).not.toContain(secret);
    expect(await openSecret(a)).toBe(secret);
    expect(await openSecret(b)).toBe(secret);
    const filename = path.join(directory, "security/notification.key");
    expect((await readFile(filename)).byteLength).toBe(32);
    expect((await stat(filename)).mode & 0o777).toBe(0o600);
  });
  it.each(["hex", "base64"] as const)(
    "round-trips an explicitly configured 32-byte %s key without creating a local key",
    async (encoding) => {
      vi.stubEnv("EAST_SOUND_SECRET_KEY", randomBytes(32).toString(encoding));
      vi.stubEnv("EAST_SOUND_STORAGE_BACKEND", "postgres");
      const sealed = await sealSecret(
        "Per-endpoint signing key used only by tests",
      );
      expect(await openSecret(sealed)).toBe(
        "Per-endpoint signing key used only by tests",
      );
      await expect(
        stat(path.join(directory, "security/notification.key")),
      ).rejects.toMatchObject({ code: "ENOENT" });
    },
  );
  it("rejects ciphertext, tag or runtime-key tampering instead of returning unauthenticated plaintext", async () => {
    vi.stubEnv("EAST_SOUND_SECRET_KEY", randomBytes(32).toString("hex"));
    const sealed = await sealSecret(
      "Synthetic strong endpoint key for vault tests",
    );
    const parts = sealed.split(".");
    for (const index of [1, 2, 3]) {
      const changed = [...parts];
      changed[index] =
        (changed[index][0] === "0" ? "1" : "0") + changed[index].slice(1);
      await expect(openSecret(changed.join("."))).rejects.toThrow();
    }
    vi.stubEnv("EAST_SOUND_SECRET_KEY", randomBytes(32).toString("hex"));
    await expect(openSecret(sealed)).rejects.toThrow();
  });
  it("fails closed for invalid keys and for cloud/PostgreSQL use without a configured key", async () => {
    vi.stubEnv("EAST_SOUND_SECRET_KEY", "not-a-32-byte-key");
    await expect(sealSecret("Synthetic test secret")).rejects.toThrow(
      /32 random bytes/,
    );
    vi.stubEnv("EAST_SOUND_SECRET_KEY", "");
    vi.stubEnv("VERCEL", "1");
    await expect(sealSecret("Synthetic test secret")).rejects.toThrow(
      /Configure EAST_SOUND_SECRET_KEY/,
    );
    vi.stubEnv("VERCEL", "0");
    vi.stubEnv("EAST_SOUND_STORAGE_BACKEND", "postgres");
    await expect(sealSecret("Synthetic test secret")).rejects.toThrow(
      /Configure EAST_SOUND_SECRET_KEY/,
    );
  });
});
