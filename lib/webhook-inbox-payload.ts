import type { WebhookReceiptSummary } from "@/lib/webhook-inbox-types";
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
function safeText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    !value.includes("\u0000") &&
    value.isWellFormed()
  );
}
/** Keep UTF-16 bounds without cutting an emoji/supplementary character in half (JSONB rejects lone surrogates). */
function previewText(value: string, limit: number): string {
  const result = value.slice(0, limit),
    last = result.charCodeAt(result.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? result.slice(0, -1) : result;
}
/** Minimized inbox projection, not a new broadcast record. Unknown fields/headers/secrets are never persisted. */
export function webhookInboxPayload(
  value: unknown,
): { eventId: string; summary: WebhookReceiptSummary } | null {
  if (
    !record(value) ||
    typeof value.id !== "string" ||
    !/^[A-Za-z0-9:._~%!()*'\-]{1,2048}$/.test(value.id) ||
    value.source !== "east-sound" ||
    typeof value.type !== "string" ||
    typeof value.occurred_at !== "string" ||
    value.occurred_at.length > 64 ||
    !/^\d{4}-\d\d-\d\dT/.test(value.occurred_at) ||
    !Number.isFinite(Date.parse(value.occurred_at)) ||
    !safeText(value.message) ||
    !value.message.trim()
  )
    return null;
  const base = {
    eventType: value.type,
    occurredAt: new Date(value.occurred_at).toISOString(),
    message: previewText(value.message, 2000),
    truncated: value.message.length > 2000,
  };
  if (
    value.type === "east-sound.configuration-test" &&
    value.mode === "configuration-test"
  )
    return {
      eventId: value.id,
      summary: { ...base, kind: "configuration-test" },
    };
  if (
    !/^airplay\.(first|prime|milestone|custom_threshold)$/.test(value.type) ||
    value.mode !== "captured" ||
    !record(value.recording) ||
    !record(value.station) ||
    !safeText(value.recording.title) ||
    !safeText(value.recording.artist) ||
    !safeText(value.station.name) ||
    typeof value.station.region !== "string" ||
    !["Central", "Eastern", "Western", "Northern"].includes(
      value.station.region,
    )
  )
    return null;
  return {
    eventId: value.id,
    summary: {
      ...base,
      kind: "signed-external-alert",
      recording: {
        title: previewText(value.recording.title, 180),
        artist: previewText(value.recording.artist, 120),
      },
      station: {
        name: previewText(value.station.name, 160),
        region: value.station.region,
      },
      truncated:
        base.truncated ||
        value.recording.title.length > 180 ||
        value.recording.artist.length > 120 ||
        value.station.name.length > 160,
    },
  };
}
