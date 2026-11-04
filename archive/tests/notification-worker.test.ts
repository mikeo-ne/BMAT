import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CAPTURE_NOW,
  capturedSpin,
  optedInPreferences,
} from "@/tests/fixtures/captured";
vi.mock("server-only", () => ({}));
const transport = vi.hoisted(() => ({
  readiness: vi.fn(),
  alert: vi.fn(),
  digest: vi.fn(),
}));
vi.mock("@/lib/notification-transport", () => ({
  notificationProviderReadiness: transport.readiness,
  sendAlert: transport.alert,
  sendDigest: transport.digest,
}));
let directory: string;
let route: typeof import("@/app/api/notifications/dispatch/route");
const TOKEN = "qa-notification-token-" + "y".repeat(32);
const ready = {
  whatsapp: true,
  email: true,
  webhook: true,
  liveEnabled: true,
  worker: true,
};
const accepted = {
  accepted: true,
  retryable: false,
  code: "provider_accepted",
};
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "east-sound-private-worker-"));
  vi.stubEnv("EAST_SOUND_DATA_DIR", directory);
  vi.stubEnv("EAST_SOUND_NOTIFICATION_TOKEN", TOKEN);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(CAPTURE_NOW);
  transport.readiness.mockReset().mockReturnValue(ready);
  transport.alert.mockReset().mockResolvedValue(accepted);
  transport.digest.mockReset().mockResolvedValue(accepted);
  vi.resetModules();
  route = await import("@/app/api/notifications/dispatch/route");
});
afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
const request = (body: unknown, token = TOKEN) =>
  new Request("https://app.example.com/api/notifications/dispatch", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
const tick = (ms = 1100) => vi.setSystemTime(Date.now() + ms);
const writeCaptures = (rows = [capturedSpin()]) =>
  writeFile(path.join(directory, "broadcasts.json"), JSON.stringify(rows));

describe("private, explicitly enabled notification worker", () => {
  it("requires a strong worker token and explicit global live enable", async () => {
    vi.stubEnv("EAST_SOUND_NOTIFICATION_TOKEN", "");
    expect((await route.POST(request({}))).status).toBe(503);
    vi.stubEnv("EAST_SOUND_NOTIFICATION_TOKEN", TOKEN);
    expect((await route.POST(request({}, "wrong"))).status).toBe(401);
    transport.readiness.mockReturnValue({ ...ready, liveEnabled: false });
    expect((await route.POST(request({}))).status).toBe(503);
    expect(transport.alert).not.toHaveBeenCalled();
  });
  it("rejects invalid configurations, actions and historical replay windows", async () => {
    expect(
      (await route.POST(request({ action: "instant", config: {} }))).status,
    ).toBe(422);
    tick();
    expect(
      (
        await route.POST(
          request({ action: ["instant"], config: optedInPreferences() }),
        )
      ).status,
    ).toBe(422);
    tick();
    expect(
      (
        await route.POST(
          request({
            action: "instant",
            config: optedInPreferences(),
            since: "2020-01-01T00:00:00Z",
          }),
        )
      ).status,
    ).toBe(422);
    expect(transport.alert).not.toHaveBeenCalled();
  });
  it("never dispatches events supplied in a request body instead of the trusted capture store", async () => {
    const response = await route.POST(
      request({
        action: "instant",
        config: optedInPreferences(),
        records: [capturedSpin()],
      }),
    );
    expect(await response.json()).toMatchObject({
      accepted: 0,
      attempted: 0,
      candidateJobs: 0,
    });
    expect(transport.alert).not.toHaveBeenCalled();
  });
  it("accepts a captured first-play job once and skips repeated scheduled invocations", async () => {
    await writeCaptures();
    const config = optedInPreferences({ triggers: ["first"] });
    expect(
      await (await route.POST(request({ action: "instant", config }))).json(),
    ).toMatchObject({ accepted: 1, retry: 0, attempted: 1 });
    tick();
    expect(
      await (await route.POST(request({ action: "instant", config }))).json(),
    ).toMatchObject({ accepted: 0, skipped: 1, attempted: 0 });
    expect(transport.alert).toHaveBeenCalledTimes(1);
    expect(transport.alert.mock.calls[0][0]).toMatchObject({
      source: "captured",
      trigger: "first",
    });
    const raw = await readFile(
      path.join(directory, "notification-attempts.json"),
      "utf8",
    );
    expect(raw).not.toContain(config.whatsapp.phone);
    expect(raw).not.toContain(config.email.address);
  });
  it("does not send historical first plays when enabling a new subscription", async () => {
    await writeCaptures();
    const config = optedInPreferences({ createdAt: CAPTURE_NOW.toISOString() });
    expect(
      await (await route.POST(request({ action: "instant", config }))).json(),
    ).toMatchObject({ accepted: 0, candidateJobs: 0 });
    expect(transport.alert).not.toHaveBeenCalled();
  });
  it("counts the final failed retry as failed, not another pending retry", async () => {
    await writeCaptures();
    transport.alert.mockResolvedValue({
      accepted: false,
      retryable: true,
      code: "provider_http_503",
    });
    const body = {
      action: "instant",
      config: optedInPreferences({ triggers: ["first"] }),
    };
    expect(await (await route.POST(request(body))).json()).toMatchObject({
      retry: 1,
      failed: 0,
    });
    tick(61000);
    expect(await (await route.POST(request(body))).json()).toMatchObject({
      retry: 1,
      failed: 0,
    });
    tick(121000);
    expect(await (await route.POST(request(body))).json()).toMatchObject({
      retry: 0,
      failed: 1,
    });
    const rows = JSON.parse(
      await readFile(
        path.join(directory, "notification-attempts.json"),
        "utf8",
      ),
    );
    expect(rows[0]).toMatchObject({ attempts: 3, status: "failed" });
  });
  it("claims at most 25 jobs and drains remaining jobs in the next authorized call", async () => {
    await writeCaptures(
      Array.from({ length: 30 }, (_, i) =>
        capturedSpin({
          id: `queue-${i}`,
          detectedAt: new Date(
            Date.parse("2026-11-01T13:00:00Z") + i * 1000,
          ).toISOString(),
        }),
      ),
    );
    const body = {
      action: "instant",
      config: optedInPreferences({ triggers: ["prime"] }),
    };
    expect(await (await route.POST(request(body))).json()).toMatchObject({
      accepted: 25,
      attempted: 25,
      candidateJobs: 30,
    });
    tick();
    expect(await (await route.POST(request(body))).json()).toMatchObject({
      accepted: 5,
      attempted: 5,
      skipped: 25,
    });
    expect(transport.alert).toHaveBeenCalledTimes(30);
  });
  it("limits authenticated worker calls to one per second", async () => {
    const body = { action: "instant", config: optedInPreferences() };
    expect((await route.POST(request(body))).status).toBe(200);
    expect((await route.POST(request(body))).status).toBe(429);
  });
  it("requires email opt-in even for a forced digest, and deduplicates the recipient/period", async () => {
    const config = optedInPreferences();
    config.email.consent = false;
    expect(
      (await route.POST(request({ action: "daily", config, force: true })))
        .status,
    ).toBe(422);
    expect(transport.digest).not.toHaveBeenCalled();
    tick();
    config.email.consent = true;
    expect(
      await (await route.POST(request({ action: "daily", config }))).json(),
    ).toMatchObject({ accepted: 1 });
    tick();
    expect(
      await (await route.POST(request({ action: "daily", config }))).json(),
    ).toMatchObject({ accepted: 0, skipped: 1 });
    expect(transport.digest).toHaveBeenCalledTimes(1);
    expect(transport.digest.mock.calls[0][0]).toMatchObject({
      kind: "daily",
      endDay: "2026-10-31",
    });
  });
  it("does not assume success or overwrite a corrupt capture store", async () => {
    await writeFile(path.join(directory, "broadcasts.json"), "corrupt");
    expect(
      (
        await route.POST(
          request({ action: "instant", config: optedInPreferences() }),
        )
      ).status,
    ).toBe(503);
    expect(
      await readFile(path.join(directory, "broadcasts.json"), "utf8"),
    ).toBe("corrupt");
    expect(transport.alert).not.toHaveBeenCalled();
  });
});
