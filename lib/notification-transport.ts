import "server-only";
import { referenceStorageOnly } from "@/lib/runtime-storage";
import { createHmac, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import { publicHttpsUrl } from "@/lib/public-url";
import {
  validEmail,
  channelReady,
  type NotificationEvent,
  type NotificationPreferences,
  type WebhookDestination,
  notificationWebhookPayload,
} from "@/lib/notifications";
import type { ProviderReadiness } from "@/lib/notifications";
import {
  digestText,
  renderDigestPdf,
  type AirplayDigest,
} from "@/lib/notification-digests";

export function publicIp(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0)
    );
  }
  if (isIP(address) !== 6) return false;
  const [first, second] = address
    .split(":")
    .map((part) => parseInt(part || "0", 16));
  return (
    first >= 0x2000 &&
    first <= 0x3fff &&
    first !== 0x2002 &&
    first !== 0x3fff &&
    !(first === 0x2001 && (second < 0x200 || second === 0xdb8))
  );
}
export function signWebhook(
  body: string,
  timestamp: string,
  secret: string,
): string {
  return `v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}
export function verifyWebhookSignature(
  body: string,
  timestamp: string,
  signature: string,
  secret: string,
  now = new Date(),
): boolean {
  if (
    secret.length < 32 ||
    !/^\d{10,11}$/.test(timestamp) ||
    Math.abs(now.getTime() / 1000 - Number(timestamp)) > 300 ||
    !/^v1=[a-f0-9]{64}$/.test(signature)
  )
    return false;
  return timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(signWebhook(body, timestamp, secret)),
  );
}
export interface TransportResult {
  accepted: boolean;
  retryable: boolean;
  code: string;
  providerId?: string;
}

/** DNS is resolved once, ALL returned addresses checked, then the connection is pinned to an approved IP. */
export async function secureJsonPost(
  address: string,
  data: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; data: unknown }> {
  const url = publicHttpsUrl(address);
  if (!url) throw new Error("blocked_destination");
  const deadline = Date.now() + 8000;
  let dnsTimer: ReturnType<typeof setTimeout> | undefined;
  let resolved: { address: string; family: number }[];
  try {
    resolved = await Promise.race([
      lookup(url.hostname, { all: true, verbatim: true }),
      new Promise<never>((_resolve, reject) => {
        dnsTimer = setTimeout(
          () => reject(new Error("provider_timeout")),
          8000,
        );
      }),
    ]);
  } finally {
    clearTimeout(dnsTimer);
  }
  if (!resolved.length || resolved.some((entry) => !publicIp(entry.address)))
    throw new Error("blocked_destination");
  const pinned = resolved.find((entry) => entry.family === 4) ?? resolved[0];
  const body = JSON.stringify(data);
  if (Buffer.byteLength(body) > 2 * 1024 * 1024)
    throw new Error("payload_too_large");
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      url,
      {
        method: "POST",
        family: pinned.family,
        lookup: (_host, _options, callback) =>
          callback(null, pinned.address, pinned.family),
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(Buffer.byteLength(body)),
          ...headers,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 65536) {
            response.destroy(new Error("response_too_large"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("aborted", () => reject(new Error("provider_unreachable")));
        response.on("end", () => {
          let parsed: unknown = null;
          try {
            parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          } catch {}
          resolve({ status: response.statusCode ?? 502, data: parsed });
        });
      },
    );
    const timer = setTimeout(
      () => req.destroy(new Error("provider_timeout")),
      Math.max(1, deadline - Date.now()),
    );
    req.setTimeout(Math.max(1, deadline - Date.now()), () =>
      req.destroy(new Error("provider_timeout")),
    );
    req.on("error", reject);
    req.on("close", () => clearTimeout(timer));
    req.end(body);
  });
}
function webhookAllowlist(): string[] {
  try {
    const values: unknown = JSON.parse(
      process.env.EAST_SOUND_WEBHOOK_ALLOWLIST ?? "[]",
    );
    return Array.isArray(values)
      ? values.filter(
          (value): value is string =>
            typeof value === "string" && !!publicHttpsUrl(value),
        )
      : [];
  } catch {
    return [];
  }
}
export function notificationProviderReadiness(): ProviderReadiness {
  if (referenceStorageOnly())
    return {
      whatsapp: false,
      email: false,
      webhook: false,
      worker: false,
      liveEnabled: false,
    };
  return {
    whatsapp:
      !!process.env.WHATSAPP_ACCESS_TOKEN &&
      /^\d+$/.test(process.env.WHATSAPP_PHONE_NUMBER_ID ?? "") &&
      /^v\d{1,3}\.\d{1,2}$/.test(process.env.WHATSAPP_GRAPH_VERSION ?? "") &&
      /^[a-z0-9_]+$/.test(process.env.WHATSAPP_TEMPLATE_NAME ?? ""),
    email:
      !!process.env.RESEND_API_KEY &&
      validEmail(process.env.EAST_SOUND_EMAIL_FROM ?? ""),
    webhook:
      webhookAllowlist().length > 0 &&
      ((process.env.EAST_SOUND_WEBHOOK_SECRET?.length ?? 0) >= 32 ||
        !!process.env.EAST_SOUND_SECRET_KEY),
    liveEnabled: process.env.EAST_SOUND_LIVE_NOTIFICATIONS === "true",
    worker:
      process.env.EAST_SOUND_WORKER_ENABLED === "1" ||
      (process.env.EAST_SOUND_NOTIFICATION_TOKEN?.length ?? 0) >= 32,
  };
}
function statusResult(response: {
  status: number;
  data: unknown;
}): TransportResult {
  const accepted = response.status >= 200 && response.status < 300;
  let providerId: string | undefined;
  if (accepted && response.data && typeof response.data === "object") {
    const value = response.data as {
      id?: unknown;
      messages?: { id?: unknown }[];
    };
    const id = value.id ?? value.messages?.[0]?.id;
    if (typeof id === "string" && id.length < 512) providerId = id;
  }
  return {
    accepted,
    retryable: response.status === 429 || response.status >= 500,
    code: accepted ? "provider_accepted" : `provider_http_${response.status}`,
    ...(providerId ? { providerId } : {}),
  };
}
async function attempt(
  operation: () => Promise<{ status: number; data: unknown }>,
): Promise<TransportResult> {
  try {
    return statusResult(await operation());
  } catch (error) {
    const blocked =
      error instanceof Error &&
      ["blocked_destination", "payload_too_large"].includes(error.message);
    return {
      accepted: false,
      retryable: !blocked,
      code: blocked ? "blocked_destination" : "provider_unreachable",
    };
  }
}
export async function sendAlert(
  event: NotificationEvent,
  config: NotificationPreferences,
  webhook?: WebhookDestination,
): Promise<TransportResult> {
  if (!channelReady(config, event.channel))
    return { accepted: false, retryable: false, code: "recipient_not_ready" };
  if (event.source !== "captured")
    return {
      accepted: false,
      retryable: false,
      code: "simulator_not_dispatchable",
    };
  const readiness = notificationProviderReadiness();
  if (!readiness.liveEnabled || !readiness[event.channel])
    return {
      accepted: false,
      retryable: false,
      code: "provider_not_configured",
    };
  if (event.channel === "whatsapp")
    return attempt(() =>
      secureJsonPost(
        `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: "whatsapp",
          to: config.whatsapp.phone.replace(/^\+/, ""),
          type: "template",
          template: {
            name: process.env.WHATSAPP_TEMPLATE_NAME,
            language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? "en" },
            components: [
              {
                type: "body",
                parameters: [{ type: "text", text: event.message }],
              },
            ],
          },
        },
        {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          "Idempotency-Key": event.id,
        },
      ),
    );
  if (event.channel === "email")
    return sendEmail(
      config.email.address,
      `Airplay: ${event.title} on ${event.station}`,
      event.message,
      event.id,
    );
  if (
    !webhook ||
    !webhook.enabled ||
    ((webhook.secret ?? process.env.EAST_SOUND_WEBHOOK_SECRET)?.length ?? 0) <
      32 ||
    !config.webhooks.some(
      (hook) =>
        hook.id === webhook.id && hook.url === webhook.url && hook.enabled,
    ) ||
    !webhookAllowlist().includes(webhook.url)
  )
    return {
      accepted: false,
      retryable: false,
      code: "destination_not_allowlisted",
    };
  const payload =
    webhook.kind === "discord"
      ? { content: event.message, allowed_mentions: { parse: [] } }
      : webhook.kind === "telegram"
        ? { text: event.message, disable_web_page_preview: true }
        : notificationWebhookPayload(event);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify(payload);
  return attempt(() =>
    secureJsonPost(webhook.url, payload, {
      "X-East-Sound-Timestamp": timestamp,
      "X-East-Sound-Signature": signWebhook(
        body,
        timestamp,
        webhook.secret ?? process.env.EAST_SOUND_WEBHOOK_SECRET!,
      ),
      "Idempotency-Key": `${event.id}:${encodeURIComponent(webhook.id)}`,
    }),
  );
}
export function sendEmail(
  to: string,
  subject: string,
  text: string,
  key: string,
  attachment?: { filename: string; content: string },
): Promise<TransportResult> {
  if (
    !notificationProviderReadiness().liveEnabled ||
    !notificationProviderReadiness().email ||
    !validEmail(to)
  )
    return Promise.resolve({
      accepted: false,
      retryable: false,
      code: "provider_not_configured",
    });
  return attempt(() =>
    secureJsonPost(
      "https://api.resend.com/emails",
      {
        from: `East Sound <${process.env.EAST_SOUND_EMAIL_FROM}>`,
        to: [to],
        subject: subject.replace(/[\r\n]/g, " ").slice(0, 180),
        text,
        ...(attachment ? { attachments: [attachment] } : {}),
      },
      {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Idempotency-Key": key,
      },
    ),
  );
}
export async function sendDigest(
  digest: AirplayDigest,
  config: NotificationPreferences,
  key: string,
): Promise<TransportResult> {
  if (!notificationProviderReadiness().liveEnabled)
    return {
      accepted: false,
      retryable: false,
      code: "live_dispatch_disabled",
    };
  if (!channelReady(config, "email"))
    return { accepted: false, retryable: false, code: "recipient_not_ready" };
  const pdf = await renderDigestPdf(digest);
  return sendEmail(
    config.email.address,
    `East Sound ${digest.kind} airplay digest | ${digest.endDay}`,
    digestText(digest),
    key,
    {
      filename: `east-sound-${digest.kind}-${digest.endDay}.pdf`,
      content: Buffer.from(pdf).toString("base64"),
    },
  );
}
