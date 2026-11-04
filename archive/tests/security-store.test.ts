import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "east-sound-lock-"));
  vi.stubEnv("EAST_SOUND_DATA_DIR", directory);
  vi.stubEnv("EAST_SOUND_STORAGE_BACKEND", "file");
  vi.resetModules();
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
describe("durable file security transactions", () => {
  it("serializes separate provisioning/worker processes without losing another process's updates", async () => {
    const run = promisify(execFile),
      owner = randomUUID();
    await Promise.all(
      Array.from({ length: 4 }, () =>
        run(
          process.execPath,
          [
            "--conditions=react-server",
            "--import",
            "tsx",
            "tests/fixtures/security-increment.ts",
            owner,
          ],
          {
            cwd: process.cwd(),
            env: {
              ...process.env,
              EAST_SOUND_DATA_DIR: directory,
              EAST_SOUND_STORAGE_BACKEND: "file",
              VERCEL: "0",
              EAST_SOUND_STATIC_EXPORT: "0",
            },
            timeout: 30000,
          },
        ),
      ),
    );
    const store = await import("@/lib/security-store");
    expect(
      await store.readAccountDocument(owner, "test-counter", "shared"),
    ).toBe(80);
    expect(
      (await stat(path.join(directory, "security/accounts.json"))).mode & 0o777,
    ).toBe(0o600);
  }, 45000);
  it("commits an immutable review and audit together and leaves both unchanged after a rejected update", async () => {
    const store = await import("@/lib/security-store"),
      owner = randomUUID(),
      entry = {
        actorId: owner,
        action: "test.review",
        objectKey: "review",
        detail: {},
      };
    await store.mutateAccountDocument(
      owner,
      "test-review",
      "review",
      () => ({ immutable: true }),
      entry,
    );
    await expect(
      store.mutateAccountDocument(
        owner,
        "test-review",
        "review",
        () => {
          throw new Error("Conflict");
        },
        entry,
      ),
    ).rejects.toThrow("Conflict");
    expect(
      await store.readAccountDocument(owner, "test-review", "review"),
    ).toEqual({ immutable: true });
    expect(await store.readSecurityAudit()).toHaveLength(1);
  });
  it("fails closed on corrupt storage rather than resetting identities or replacing the corrupt file", async () => {
    const store = await import("@/lib/security-store"),
      owner = randomUUID();
    await store.writeAccountDocument(owner, "test-review", {});
    const filename = path.join(directory, "security/accounts.json");
    await writeFile(filename, "not valid JSON");
    await expect(
      store.writeAccountDocument(owner, "test-review", {}),
    ).rejects.toThrow();
    expect(await readFile(filename, "utf8")).toBe("not valid JSON");
  });
});
