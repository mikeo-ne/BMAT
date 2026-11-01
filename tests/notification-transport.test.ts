import { EventEmitter } from "node:events";
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAirplayDigest } from "@/lib/notification-digests";
import { notificationCandidates } from "@/lib/notifications";
import {
  CAPTURE_NOW,
  capturedSpin,
  optedInPreferences,
  REFERENCE_CATALOGUE,
} from "@/tests/fixtures/captured";
vi.mock("server-only", () => ({}));
const wire = vi.hoisted(() => ({
  dns: vi.fn(),
  request: vi.fn(),
  status: 200,
  body: "{}",
  hang: false,
  sent: [] as string[],
}));
vi.mock("node:dns/promises", () => ({ lookup: wire.dns }));
vi.mock("node:https", () => ({ request: wire.request }));
import {
  notificationProviderReadiness,
  publicIp,
  secureJsonPost,
  sendAlert,
  sendDigest,
  signWebhook,
  verifyWebhookSignature,
} from "@/lib/notification-transport";
const secret = "qa-webhook-signing-secret-" + "s".repeat(32);
const URL = "https://hooks.example.com/airplay";
const env = [
  "EAST_SOUND_STATIC_EXPORT",
  "EAST_SOUND_LIVE_NOTIFICATIONS",
  "EAST_SOUND_NOTIFICATION_TOKEN",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_GRAPH_VERSION",
  "WHATSAPP_TEMPLATE_NAME",
  "WHATSAPP_TEMPLATE_LANGUAGE",
  "RESEND_API_KEY",
  "EAST_SOUND_EMAIL_FROM",
  "EAST_SOUND_WEBHOOK_ALLOWLIST",
  "EAST_SOUND_WEBHOOK_SECRET",
];
beforeEach(() => {
  for (const key of env) vi.stubEnv(key, "");
  wire.status = 200;
  wire.body = JSON.stringify({ messages: [{ id: "qa-provider-id" }] });
  wire.hang = false;
  wire.sent = [];
  wire.dns.mockReset().mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
  wire.request
    .mockReset()
    .mockImplementation(
      (
        _url: unknown,
        _options: unknown,
        callback: (response: EventEmitter) => void,
      ) => {
        const request = new EventEmitter();
        return Object.assign(request, {
          setTimeout: vi.fn(),
          destroy: (error: Error) => {
            request.emit("error", error);
            request.emit("close");
          },
          end: (body: string) => {
            wire.sent.push(body);
            if (wire.hang) return;
            queueMicrotask(() => {
              let destroyed = false;
              const response = Object.assign(new EventEmitter(), {
                statusCode: wire.status,
                destroy: (error: Error) => {
                  destroyed = true;
                  response.emit("error", error);
                  request.emit("close");
                },
              });
              callback(response);
              response.emit("data", Buffer.from(wire.body));
              if (!destroyed) response.emit("end");
              request.emit("close");
            });
          },
        });
      },
    );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
function enableProviders() {
  for (const [key, value] of Object.entries({
    EAST_SOUND_LIVE_NOTIFICATIONS: "true",
    EAST_SOUND_NOTIFICATION_TOKEN: "t".repeat(32),
    WHATSAPP_ACCESS_TOKEN: "qa-access-token",
    WHATSAPP_PHONE_NUMBER_ID: "123456",
    WHATSAPP_GRAPH_VERSION: "v99.0",
    WHATSAPP_TEMPLATE_NAME: "qa_airplay_alert",
    RESEND_API_KEY: "qa-resend-key",
    EAST_SOUND_EMAIL_FROM: "alerts@example.com",
    EAST_SOUND_WEBHOOK_ALLOWLIST: JSON.stringify([URL]),
    EAST_SOUND_WEBHOOK_SECRET: secret,
  }))
    vi.stubEnv(key, value);
}
function event(channel: "whatsapp" | "email" | "webhook" = "whatsapp") {
  const config = optedInPreferences({
    channels: [channel],
    triggers: ["first"],
  });
  if (channel === "webhook")
    config.webhooks = [
      {
        id: "qa-hook",
        label: "QA relay",
        kind: "json",
        url: URL,
        enabled: true,
      },
    ];
  return {
    config,
    event: notificationCandidates(
      [capturedSpin()],
      REFERENCE_CATALOGUE,
      config,
      CAPTURE_NOW,
    )[0],
  };
}

describe("DNS-pinned bounded HTTPS webhook transport", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "198.18.0.1",
    "203.0.113.1",
    "::1",
    "fe80::1",
    "fc00::1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
    "2001:0000::1",
    "2001::1",
    "2001:20::1",
    "2002:7f00:1::",
    "3fff::1",
  ])("blocks non-public/reserved IP %s", (ip) =>
    expect(publicIp(ip)).toBe(false),
  );
  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "104.16.0.1",
    "2606:4700:4700::1111",
    "2001:4860:4860::8888",
  ])("permits globally addressed IP %s", (ip) =>
    expect(publicIp(ip)).toBe(true),
  );
  it("rejects an entire DNS answer if even one returned address is private", async () => {
    wire.dns.mockResolvedValue([
      { address: "8.8.8.8", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);
    await expect(secureJsonPost(URL, {})).rejects.toThrow(
      "blocked_destination",
    );
    expect(wire.request).not.toHaveBeenCalled();
  });
  it("pins the validated connection rather than resolving the hostname again", async () => {
    expect(await secureJsonPost(URL, { event: "test" })).toMatchObject({
      status: 200,
    });
    expect(wire.dns).toHaveBeenCalledTimes(1);
    const options = wire.request.mock.calls[0][1] as {
      family: number;
      lookup: (
        host: string,
        options: object,
        callback: (error: unknown, address: string, family: number) => void,
      ) => void;
    };
    const callback = vi.fn();
    options.lookup("hooks.example.com", {}, callback);
    expect(options.family).toBe(4);
    expect(callback).toHaveBeenCalledWith(null, "8.8.8.8", 4);
  });
  it("never follows a provider redirect", async () => {
    wire.status = 302;
    expect(await secureJsonPost(URL, {})).toMatchObject({ status: 302 });
    expect(wire.request).toHaveBeenCalledTimes(1);
  });
  it("bounds request and response sizes", async () => {
    await expect(
      secureJsonPost(URL, { body: "x".repeat(2 * 1024 * 1024) }),
    ).rejects.toThrow("payload_too_large");
    wire.body = "x".repeat(65537);
    await expect(secureJsonPost(URL, {})).rejects.toThrow("response_too_large");
  });
  it("has a hard eight-second deadline even when the request never finishes", async () => {
    vi.useFakeTimers();
    wire.hang = true;
    const result = expect(secureJsonPost(URL, {})).rejects.toThrow(
      "provider_timeout",
    );
    await vi.runAllTimersAsync();
    await result;
  });
});

describe("signed, replay-bounded webhook payloads", () => {
  it("signs the exact timestamp and raw UTF-8 JSON with HMAC SHA-256", () => {
    const body = JSON.stringify({ message: "🔥 SALO on Capital FM" });
    const timestamp = String(Math.floor(CAPTURE_NOW.getTime() / 1000));
    expect(signWebhook(body, timestamp, secret)).toBe(
      `v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`,
    );
    expect(
      verifyWebhookSignature(
        body,
        timestamp,
        signWebhook(body, timestamp, secret),
        secret,
        CAPTURE_NOW,
      ),
    ).toBe(true);
    expect(
      verifyWebhookSignature(
        body + " ",
        timestamp,
        signWebhook(body, timestamp, secret),
        secret,
        CAPTURE_NOW,
      ),
    ).toBe(false);
    expect(
      verifyWebhookSignature(body, timestamp, "v1=short", secret, CAPTURE_NOW),
    ).toBe(false);
    expect(
      verifyWebhookSignature(
        body,
        timestamp,
        signWebhook(body, timestamp, secret),
        secret,
        new Date(CAPTURE_NOW.getTime() + 301000),
      ),
    ).toBe(false);
  });
});

describe("server-only provider adapters and defense-in-depth consent", () => {
  it("reports no provider bindings by default, and no bindings at all in a static export", () => {
    expect(notificationProviderReadiness()).toEqual({
      whatsapp: false,
      email: false,
      webhook: false,
      liveEnabled: false,
      worker: false,
    });
    enableProviders();
    expect(notificationProviderReadiness().whatsapp).toBe(true);
    vi.stubEnv("EAST_SOUND_STATIC_EXPORT", "1");
    expect(notificationProviderReadiness().liveEnabled).toBe(false);
    expect(notificationProviderReadiness().worker).toBe(false);
  });
  it("does not dispatch without global enable or recipient consent, even if called directly", async () => {
    enableProviders();
    const sample = event();
    sample.config.whatsapp.consent = false;
    expect(await sendAlert(sample.event, sample.config)).toMatchObject({
      accepted: false,
      code: "recipient_not_ready",
    });
    sample.config.whatsapp.consent = true;
    vi.stubEnv("EAST_SOUND_LIVE_NOTIFICATIONS", "false");
    expect(await sendAlert(sample.event, sample.config)).toMatchObject({
      accepted: false,
      code: "provider_not_configured",
    });
    expect(wire.request).not.toHaveBeenCalled();
  });
  it("cannot dispatch a simulated phone preview", async () => {
    enableProviders();
    const sample = event();
    expect(
      await sendAlert({ ...sample.event, source: "simulator" }, sample.config),
    ).toMatchObject({ accepted: false, code: "simulator_not_dispatchable" });
    expect(wire.request).not.toHaveBeenCalled();
  });
  it("uses a preapproved Meta template and strips the phone's plus sign only on the server", async () => {
    enableProviders();
    const sample = event();
    expect(await sendAlert(sample.event, sample.config)).toMatchObject({
      accepted: true,
      providerId: "qa-provider-id",
    });
    const [url, options] = wire.request.mock.calls[0];
    expect(String(url)).toBe(
      "https://graph.facebook.com/v99.0/123456/messages",
    );
    expect(options.headers.Authorization).toBe("Bearer qa-access-token");
    expect(options.headers["Idempotency-Key"]).toBe(sample.event.id);
    expect(JSON.parse(wire.sent[0])).toMatchObject({
      messaging_product: "whatsapp",
      to: "256772123456",
      type: "template",
      template: {
        name: "qa_airplay_alert",
        components: [
          {
            type: "body",
            parameters: [{ type: "text", text: sample.event.message }],
          },
        ],
      },
    });
  });
  it("requires an enabled exact-allowlisted webhook, and signs its payload", async () => {
    enableProviders();
    const sample = event("webhook");
    const hook = sample.config.webhooks[0];
    expect(
      await sendAlert(sample.event, sample.config, {
        ...hook,
        url: `${URL}/changed`,
      }),
    ).toMatchObject({ code: "destination_not_allowlisted" });
    expect(await sendAlert(sample.event, sample.config, hook)).toMatchObject({
      accepted: true,
    });
    const options = wire.request.mock.calls[0][1];
    expect(options.headers["X-East-Sound-Signature"]).toMatch(
      /^v1=[a-f0-9]{64}$/,
    );
    expect(options.headers["X-East-Sound-Timestamp"]).toMatch(/^\d+$/);
    expect(options.headers["X-East-Sound-Signature"]).toBe(
      signWebhook(
        wire.sent[0],
        options.headers["X-East-Sound-Timestamp"],
        secret,
      ),
    );
  });
  it("classifies rate limits as retryable, but authorization failures as permanent", async () => {
    enableProviders();
    const sample = event();
    wire.status = 429;
    expect(await sendAlert(sample.event, sample.config)).toMatchObject({
      accepted: false,
      retryable: true,
    });
    wire.status = 401;
    expect(await sendAlert(sample.event, sample.config)).toMatchObject({
      accepted: false,
      retryable: false,
    });
  });
  it("rechecks consent before building or sending an email digest", async () => {
    enableProviders();
    const config = optedInPreferences();
    config.email.consent = false;
    const digest = buildAirplayDigest(
      [],
      REFERENCE_CATALOGUE,
      "daily",
      CAPTURE_NOW,
    );
    expect(await sendDigest(digest, config, "digest-qa")).toMatchObject({
      accepted: false,
      code: "recipient_not_ready",
    });
    expect(wire.request).not.toHaveBeenCalled();
    config.email.consent = true;
    expect(await sendDigest(digest, config, "digest-qa")).toMatchObject({
      accepted: true,
    });
    expect(String(wire.request.mock.calls[0][0])).toBe(
      "https://api.resend.com/emails",
    );
    const payload = JSON.parse(wire.sent[0]);
    expect(payload.to).toEqual([config.email.address]);
    expect(
      Buffer.from(payload.attachments[0].content, "base64")
        .subarray(0, 5)
        .toString(),
    ).toBe("%PDF-");
  });
});
