/**
 * Turning a row in `alert_outbox` into something a person reads on a phone.
 *
 * Pure functions only — no network, no env, no Supabase — so the wording can be
 * tested (and later reviewed by a native speaker) without a live project.
 */

export type AlertKind = "firstspin" | "play" | "daily" | "chart" | "dispute" | "payout";

export type Alert = {
  id: string;
  kind: AlertKind | string;
  title: string;
  body: string;
  link: string | null;
  created_at?: string;
};

/** WhatsApp rejects bodies over 4096 characters; keep well below that. */
export const MAX_BODY = 900;

/** WhatsApp Cloud API wants digits only: `+256 772 123 456` → `256772123456`. */
export function whatsappNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function absolute(link: string | null, siteUrl: string): string | null {
  if (!link) return null;
  const base = siteUrl.replace(/\/+$/, "");
  return base ? `${base}${link.startsWith("/") ? "" : "/"}${link}` : link;
}

/** The one-line-per-idea shape that reads well in a WhatsApp notification. */
export function whatsappText(alert: Alert, siteUrl = ""): string {
  const parts = [`*${alert.title}*`, "", alert.body];
  const url = absolute(alert.link, siteUrl);
  if (url) parts.push("", url);
  const text = parts.join("\n");
  return text.length > MAX_BODY ? `${text.slice(0, MAX_BODY - 1)}…` : text;
}

export function emailMessage(alert: Alert, siteUrl = ""): { subject: string; text: string; html: string } {
  const url = absolute(alert.link, siteUrl);
  const text = [alert.title, "", alert.body, ...(url ? ["", url] : [])].join("\n");
  const html = [
    `<h2 style="font:600 18px system-ui,sans-serif;margin:0 0 8px">${escapeHtml(alert.title)}</h2>`,
    `<p style="font:15px/1.5 system-ui,sans-serif;color:#334155;margin:0 0 16px">${escapeHtml(alert.body)}</p>`,
    url ? `<p style="margin:0"><a href="${escapeHtml(url)}" style="font:14px system-ui,sans-serif">Open East Sound</a></p>` : "",
    `<p style="font:12px system-ui,sans-serif;color:#94a3b8;margin:24px 0 0">You are getting this because alert settings are on for your account.</p>`,
  ]
    .filter(Boolean)
    .join("");
  return { subject: alert.title, text, html };
}

export type AlertLog = {
  id: string;
  kind: string;
  title: string;
  created_at: string;
  sent_at: string | null;
  channel: string | null;
  last_error: string | null;
  attempts: number;
};

const CHANNEL_NAME: Record<string, string> = { email: "email", whatsapp: "WhatsApp", sms: "SMS" };

/** "email+sms" → "email and SMS"; "email+whatsapp+sms" → "email, WhatsApp and SMS". */
export function channelNames(channel: string): string {
  const n = channel.split("+").filter(Boolean).map((c) => CHANNEL_NAME[c] ?? c);
  return n.length <= 1 ? (n[0] ?? "") : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
}

/** "whatsapp: template not approved; sms: InsufficientBalance" → "WhatsApp or SMS". */
function failedNames(err: string): string {
  const n = [...err.matchAll(/(?:^|;\s*)(email|whatsapp|sms):/g)].map((m) => CHANNEL_NAME[m[1]]);
  return n.length ? n.join(" or ") : "every channel";
}

/** One human line for the dashboard: did this alert actually leave the building? */
export function alertStatus(row: AlertLog): { text: string; tone: "sent" | "pending" | "failed" } {
  if (row.sent_at && row.channel) {
    if (!row.last_error) return { text: `Sent by ${channelNames(row.channel)}`, tone: "sent" };
    return { text: `Sent by ${channelNames(row.channel)} — not by ${failedNames(row.last_error)}`, tone: "failed" };
  }
  if (row.sent_at) return { text: row.last_error ? `Not delivered — ${row.last_error}` : "Nothing to deliver to", tone: "failed" };
  if (row.attempts > 0) return { text: `Retrying (attempt ${row.attempts + 1})`, tone: "pending" };
  return { text: "Queued", tone: "pending" };
}
