import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  claimDelivery,
  finishDelivery,
  readDeliveryAttempts,
} from "@/lib/notification-outbox";
let directory: string;
const NOW = new Date("2026-11-01T12:00:00Z");
const later = (ms: number) => new Date(NOW.getTime() + ms);
const accepted = {
  accepted: true,
  retryable: false,
  code: "provider_accepted",
};
const unavailable = {
  accepted: false,
  retryable: true,
  code: "provider_unreachable",
};
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "east-sound-outbox-"));
  vi.stubEnv("EAST_SOUND_DATA_DIR", directory);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

describe("single-process private notification outbox", () => {
  it("claims a concurrent ID once and never retries an accepted send", async () => {
    const claims = await Promise.all(
      Array.from({ length: 10 }, () => claimDelivery("one", "whatsapp", NOW)),
    );
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await finishDelivery("one", accepted, 1, NOW)).toBe("accepted");
    expect(await claimDelivery("one", "whatsapp", later(86400000))).toBeNull();
    expect((await readDeliveryAttempts())[0]).toMatchObject({
      attempts: 1,
      status: "accepted",
    });
  });
  it("backs off 60/120 seconds and permanently fails at the third attempt", async () => {
    await claimDelivery("retry", "email", NOW);
    expect(await finishDelivery("retry", unavailable, 1, NOW)).toBe("retry");
    expect(await claimDelivery("retry", "email", later(59000))).toBeNull();
    expect(
      (await claimDelivery("retry", "email", later(60000)))?.attempts,
    ).toBe(2);
    await finishDelivery("retry", unavailable, 2, later(60000));
    expect(await claimDelivery("retry", "email", later(179000))).toBeNull();
    expect(
      (await claimDelivery("retry", "email", later(180000)))?.attempts,
    ).toBe(3);
    expect(await finishDelivery("retry", unavailable, 3, later(180000))).toBe(
      "failed",
    );
    expect(await claimDelivery("retry", "email", later(999999))).toBeNull();
  });
  it("recovers an expired 120-second lease and rejects the former owner's completion", async () => {
    await claimDelivery("lease", "webhook", NOW);
    expect(await claimDelivery("lease", "webhook", later(119000))).toBeNull();
    expect(
      (await claimDelivery("lease", "webhook", later(120000)))?.attempts,
    ).toBe(2);
    expect(
      await finishDelivery("lease", accepted, 1, later(121000)),
    ).toBeUndefined();
    expect((await readDeliveryAttempts())[0].status).toBe("attempting");
    expect(await finishDelivery("lease", accepted, 2, later(121000))).toBe(
      "accepted",
    );
  });
  it("does not overwrite an already finished attempt", async () => {
    await claimDelivery("finished", "whatsapp", NOW);
    await finishDelivery("finished", accepted, 1, NOW);
    expect(
      await finishDelivery("finished", unavailable, 1, later(1000)),
    ).toBeUndefined();
    expect((await readDeliveryAttempts())[0].status).toBe("accepted");
  });
  it("stores IDs, status and bounded error codes, not recipients, payloads, URLs or provider secrets", async () => {
    await claimDelivery("privacy", "whatsapp", NOW);
    await finishDelivery(
      "privacy",
      {
        ...accepted,
        providerId: "private-provider-reference",
        code: "unsafe code https://secret.example.com",
      },
      1,
      NOW,
    );
    const raw = await readFile(
      path.join(directory, "notification-attempts.json"),
      "utf8",
    );
    expect(raw).not.toContain("private-provider-reference");
    expect(raw).not.toContain("secret.example.com");
    expect(raw).not.toContain("recipient");
    expect(raw).not.toContain("message");
    expect((await readDeliveryAttempts())[0].code).toBe("provider_result");
  });
  it("retains deduplication for 30 days, with documented finite retention", async () => {
    await claimDelivery("retained", "email", NOW);
    await finishDelivery("retained", accepted, 1, NOW);
    expect(
      await claimDelivery("retained", "email", later(29 * 86400000)),
    ).toBeNull();
    expect(
      (await claimDelivery("retained", "email", later(31 * 86400000)))
        ?.attempts,
    ).toBe(1);
  });
  it.each([
    "not-json",
    JSON.stringify([{ id: "bad", status: "accepted", attempts: -1 }]),
    JSON.stringify([
      {
        id: "bad",
        channel: "email",
        status: "unexpected",
        attempts: 1,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
    ]),
  ])("does not reset corrupt attempt data", async (raw) => {
    const file = path.join(directory, "notification-attempts.json");
    await writeFile(file, raw);
    await expect(claimDelivery("new", "email", NOW)).rejects.toThrow();
    expect(await readFile(file, "utf8")).toBe(raw);
  });
});
