/**
 * Delivery of one alert over WhatsApp Cloud API or email (Resend).
 *
 * Both providers are plain HTTPS POSTs, so this module needs no SDK and can be
 * exercised in tests with a fake `fetch`. WhatsApp wins when the person gave a
 * number and the platform is configured; otherwise we fall back to email.
 */
import { emailMessage, whatsappNumber, whatsappText, type Alert } from "./compose";

export type Channel = "whatsapp" | "email";

export type DeliveryEnv = {
  whatsappToken?: string;
  whatsappPhoneId?: string;
  resendKey?: string;
  mailFrom?: string;
  siteUrl?: string;
};

export type Contact = { email?: string | null; phone?: string | null };

export type HttpResult = { ok: boolean; status: number; body?: string };
export type HttpPost = (url: string, headers: Record<string, string>, payload: unknown) => Promise<HttpResult>;

export type DeliveryResult =
  | { ok: true; channel: Channel }
  | { ok: false; skipped?: string; error?: string };

export const WHATSAPP_API = "https://graph.facebook.com/v22.0";
export const RESEND_API = "https://api.resend.com/emails";

export function configuredChannels(env: DeliveryEnv): Channel[] {
  const out: Channel[] = [];
  if (env.whatsappToken && env.whatsappPhoneId) out.push("whatsapp");
  if (env.resendKey && env.mailFrom) out.push("email");
  return out;
}

/** Which channel would actually be used for this person, ignoring failures. */
export function pickChannel(contact: Contact, env: DeliveryEnv): Channel | "none" {
  if (whatsappNumber(contact.phone) && env.whatsappToken && env.whatsappPhoneId) return "whatsapp";
  if (contact.email && env.resendKey && env.mailFrom) return "email";
  return "none";
}

function describe(status: number, body?: string): string {
  const trimmed = (body ?? "").replace(/\s+/g, " ").slice(0, 200);
  return trimmed ? `HTTP ${status}: ${trimmed}` : `HTTP ${status}`;
}

export async function deliver(
  alert: Alert,
  contact: Contact,
  env: DeliveryEnv,
  post: HttpPost,
): Promise<DeliveryResult> {
  const channel = pickChannel(contact, env);
  if (channel === "none") {
    return {
      ok: false,
      skipped: configuredChannels(env).length === 0 ? "no delivery channel configured" : "this person has no reachable phone or email",
    };
  }

  if (channel === "whatsapp") {
    const to = whatsappNumber(contact.phone) as string;
    const res = await post(
      `${WHATSAPP_API}/${env.whatsappPhoneId}/messages`,
      { authorization: `Bearer ${env.whatsappToken}`, "content-type": "application/json" },
      { messaging_product: "whatsapp", to, type: "text", text: { preview_url: true, body: whatsappText(alert, env.siteUrl) } },
    );
    return res.ok ? { ok: true, channel } : { ok: false, error: describe(res.status, res.body) };
  }

  const mail = emailMessage(alert, env.siteUrl);
  const res = await post(
    RESEND_API,
    { authorization: `Bearer ${env.resendKey}`, "content-type": "application/json" },
    { from: env.mailFrom, to: [contact.email], subject: mail.subject, text: mail.text, html: mail.html },
  );
  return res.ok ? { ok: true, channel } : { ok: false, error: describe(res.status, res.body) };
}

/** Reads the provider credentials from the environment, once per request. */
export function envFromProcess(processEnv: Record<string, string | undefined>, siteUrl: string): DeliveryEnv {
  return {
    whatsappToken: processEnv.WHATSAPP_TOKEN ?? "",
    whatsappPhoneId: processEnv.WHATSAPP_PHONE_NUMBER_ID ?? "",
    resendKey: processEnv.RESEND_API_KEY ?? "",
    mailFrom: processEnv.ALERT_FROM_EMAIL ?? "",
    siteUrl,
  };
}

/** `fetch`-backed POST, the production wiring for `deliver`. */
export function httpPost(fetchImpl: typeof fetch): HttpPost {
  return async (url, headers, payload) => {
    const res = await fetchImpl(url, { method: "POST", headers, body: JSON.stringify(payload) });
    const body = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, body };
  };
}
