import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const hooks = vi.hoisted(() => ({
  after: vi.fn(),
  postgres: vi.fn(),
  file: vi.fn(),
  cleanup: vi.fn(),
}));
vi.mock("next/server", () => ({ after: hooks.after }));
vi.mock("@/lib/postgres/outbox", () => ({
  processPostgresOutbox: hooks.postgres,
}));
vi.mock("@/lib/file-notification-queue", () => ({
  processFileOutbox: hooks.file,
}));
vi.mock("@/lib/cloud-masters", () => ({ cleanupMasterUploads: hooks.cleanup }));
import {
  notificationExecutionReadiness,
  dispatchAfterCaptureCommit,
  runNotificationBatch,
} from "@/lib/notification-runtime";
import { GET } from "@/app/api/maintenance/route";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VERCEL", "0");
  vi.stubEnv("EAST_SOUND_STATIC_EXPORT", "0");
  vi.stubEnv("EAST_SOUND_STORAGE_BACKEND", "postgres");
  vi.stubEnv("EAST_SOUND_LIVE_NOTIFICATIONS", "true");
  vi.stubEnv("EAST_SOUND_WORKER_ENABLED", "1");
  vi.stubEnv("CRON_SECRET", "qa-cron-" + "c".repeat(40));
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "qa-not-a-provider-token");
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1234");
  vi.stubEnv("WHATSAPP_GRAPH_VERSION", "v26.0");
  vi.stubEnv("WHATSAPP_TEMPLATE_NAME", "qa_template");
  vi.stubEnv("RESEND_API_KEY", undefined);
  vi.stubEnv("EAST_SOUND_WEBHOOK_ALLOWLIST", "[]");
  hooks.postgres.mockResolvedValue({
    attempted: 1,
    accepted: 1,
    retry: 0,
    failed: 0,
  });
  hooks.file.mockResolvedValue({ attempted: 1 });
  hooks.cleanup.mockResolvedValue({ cleaned: 1, failed: 0 });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe("durable live notification execution", () => {
  it("reports only redacted readiness and distinguishes sending, worker and scheduler setup", () => {
    const result = notificationExecutionReadiness();
    expect(result.immediateDispatchReady).toBe(true);
    expect(result.scheduledRetriesConfigured).toBe(true);
    expect(result.providers).toEqual({
      whatsapp: true,
      email: false,
      webhook: false,
    });
    expect(JSON.stringify(result)).not.toContain("qa-not-a-provider-token");
    expect(JSON.stringify(result)).not.toContain(process.env.CRON_SECRET!);
    vi.stubEnv("EAST_SOUND_LIVE_NOTIFICATIONS", "false");
    expect(notificationExecutionReadiness().immediateDispatchReady).toBe(false);
  });
  it.each(["live", "worker", "provider"])(
    "does not schedule or claim jobs when %s setup is missing",
    async (missing) => {
      if (missing === "live")
        vi.stubEnv("EAST_SOUND_LIVE_NOTIFICATIONS", "false");
      if (missing === "worker") vi.stubEnv("EAST_SOUND_WORKER_ENABLED", "0");
      if (missing === "provider")
        vi.stubEnv("WHATSAPP_ACCESS_TOKEN", undefined);
      dispatchAfterCaptureCommit();
      expect(hooks.after).not.toHaveBeenCalled();
      expect(await runNotificationBatch()).toMatchObject({
        skipped: true,
        attempted: 0,
      });
      expect(hooks.postgres).not.toHaveBeenCalled();
    },
  );
  it("defers actual dispatch until the response lifecycle and uses the durable selected queue", async () => {
    dispatchAfterCaptureCommit();
    expect(hooks.postgres).not.toHaveBeenCalled();
    expect(hooks.after).toHaveBeenCalledTimes(1);
    await hooks.after.mock.calls[0][0]();
    expect(hooks.postgres).toHaveBeenCalledTimes(1);
    vi.stubEnv("EAST_SOUND_STORAGE_BACKEND", "file");
    await runNotificationBatch();
    expect(hooks.file).toHaveBeenCalledTimes(1);
  });
  it("keeps capture success independent from deferred registration/provider outages", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    hooks.after.mockImplementationOnce(() => {
      throw new Error("no request context");
    });
    expect(() => dispatchAfterCaptureCommit()).not.toThrow();
    hooks.postgres.mockRejectedValueOnce(new Error("private driver detail"));
    dispatchAfterCaptureCommit();
    await hooks.after.mock.calls[1][0]();
    expect(log.mock.calls.flat().join(" ")).not.toContain(
      "private driver detail",
    );
  });
  it("authenticates scheduled maintenance independently and never accepts missing/weak/bad secrets", async () => {
    expect(
      (await GET(new Request("https://app.example.com/api/maintenance")))
        .status,
    ).toBe(401);
    vi.stubEnv("CRON_SECRET", "weak");
    expect(
      (
        await GET(
          new Request("https://app.example.com/api/maintenance", {
            headers: { authorization: "Bearer weak" },
          }),
        )
      ).status,
    ).toBe(503);
    expect(hooks.cleanup).not.toHaveBeenCalled();
    expect(hooks.postgres).not.toHaveBeenCalled();
  });
  it("runs private orphan cleanup and leased dispatch only for an authenticated scheduler", async () => {
    const result = await GET(
      new Request("https://app.example.com/api/maintenance", {
        headers: { authorization: "Bearer " + process.env.CRON_SECRET },
      }),
    );
    expect(result.status).toBe(200);
    expect((await result.json()).uploads.cleaned).toBe(1);
    expect(hooks.postgres).toHaveBeenCalledTimes(1);
    expect(result.headers.get("cache-control")).toBe("no-store");
  }, 10000);
  it("still cleans orphans while live sends are disabled without claiming or sending notification jobs", async () => {
    vi.stubEnv("EAST_SOUND_LIVE_NOTIFICATIONS", "false");
    const result = await GET(
      new Request("https://app.example.com/api/maintenance", {
        headers: { authorization: "Bearer " + process.env.CRON_SECRET },
      }),
    );
    expect(result.status).toBe(200);
    expect(hooks.cleanup).toHaveBeenCalledTimes(1);
    expect(hooks.postgres).not.toHaveBeenCalled();
  }, 10000);
});
