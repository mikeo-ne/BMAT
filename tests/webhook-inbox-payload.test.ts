import { describe, expect, it } from "vitest";
import { webhookInboxPayload } from "@/lib/webhook-inbox-payload";
import {
  notificationWebhookPayload,
  type NotificationEvent,
} from "@/lib/notifications";
import { INTEGRATION_SETUP_GUIDES } from "@/lib/integration-onboarding";
import { roleMayOpen, safeReturnPath } from "@/lib/auth-types";
const event: NotificationEvent = {
  id: "sub:spin:first:webhook",
  subscriptionId: "sub",
  spinId: "spin",
  trackId: "track",
  title: "Test recording",
  artist: "QA artist",
  stationId: "capital-kla",
  station: "Capital FM",
  region: "Central",
  atIso: "2026-11-02T07:00:00.000Z",
  trigger: "first",
  channel: "webhook",
  ordinal: 1,
  spinsToday: 1,
  milestone: null,
  message: "A signed external claim, not captured evidence.",
  source: "captured",
};
const testPayload = () => ({
  id: "cfg_example",
  type: "east-sound.configuration-test",
  source: "east-sound",
  mode: "configuration-test",
  occurred_at: "2026-11-02T07:00:00.000Z",
  message: "Configuration only",
});
describe("minimized diagnostic webhook contract", () => {
  it("accepts the actual outgoing alert envelope without turning it into verified airplay", () => {
    const result = webhookInboxPayload(notificationWebhookPayload(event));
    expect(result?.eventId).toBe(event.id);
    expect(result?.summary.kind).toBe("signed-external-alert");
    expect(result?.summary.recording).toEqual({
      title: event.title,
      artist: event.artist,
    });
    expect(result?.summary).not.toHaveProperty("source", "captured");
    expect(result?.summary).not.toHaveProperty("verified", true);
  });
  it("supports URI-encoded IDs emitted by existing subscriptions without relying on unsigned headers", () => {
    const id =
      encodeURIComponent("label's (first!) subscription") +
      ":" +
      encodeURIComponent("spin/source") +
      ":first:webhook";
    expect(
      webhookInboxPayload(notificationWebhookPayload({ ...event, id }))
        ?.eventId,
    ).toBe(id);
  });
  it("keeps configuration tests separately marked and excludes unrelated secret fields", () => {
    const result = webhookInboxPayload({
      ...testPayload(),
      access_token: "never-persist-this",
      password: "secret",
      headers: { authorization: "private" },
    });
    expect(result?.summary.kind).toBe("configuration-test");
    expect(JSON.stringify(result)).not.toContain("never-persist-this");
    expect(JSON.stringify(result)).not.toContain("authorization");
  });
  it("minimizes oversized display fields without changing the signed identity", () => {
    const payload = notificationWebhookPayload({
      ...event,
      message: "m".repeat(5000),
      title: "t".repeat(400),
    });
    const result = webhookInboxPayload(payload)!;
    expect(result.eventId).toBe(event.id);
    expect(result.summary.message).toHaveLength(2000);
    expect(result.summary.recording?.title).toHaveLength(180);
    expect(result.summary.truncated).toBe(true);
  });
  it("never creates a lone surrogate while minimizing emoji at a display boundary", () => {
    const result = webhookInboxPayload({
      ...testPayload(),
      message: "x" + "🔥".repeat(1000),
    })!;
    expect(result.summary.message.length).toBeLessThanOrEqual(2000);
    expect(result.summary.message.isWellFormed()).toBe(true);
    expect(result.summary.truncated).toBe(true);
  });
  it.each(["bad\u0000message", "bad\ud800message"])(
    "rejects display text that PostgreSQL JSONB cannot safely retain",
    (message) =>
      expect(webhookInboxPayload({ ...testPayload(), message })).toBeNull(),
  );
  it.each([
    null,
    [],
    {},
    { ...testPayload(), id: "email@example.com" },
    { ...testPayload(), occurred_at: "not-a-time" },
    { ...testPayload(), source: "unrecognised" },
    { ...testPayload(), message: "" },
    { ...testPayload(), id: "x".repeat(2049) },
  ])("refuses malformed envelopes without retaining their input", (payload) =>
    expect(webhookInboxPayload(payload)).toBeNull(),
  );
  it("refuses simulator and unknown alert types", () => {
    expect(
      webhookInboxPayload(
        notificationWebhookPayload({ ...event, source: "simulator" }),
      ),
    ).toBeNull();
    expect(
      webhookInboxPayload({
        ...notificationWebhookPayload(event),
        type: "airplay.invented",
      }),
    ).toBeNull();
  });
  it("does not interpret Meta or email-provider delivery callbacks as airplay alerts", () => {
    expect(
      webhookInboxPayload({ object: "whatsapp_business_account", entry: [] }),
    ).toBeNull();
    expect(
      webhookInboxPayload({ type: "email.delivered", data: {} }),
    ).toBeNull();
  });
});
describe("honest operator onboarding and role-scoped navigation", () => {
  it("lists all three adapters without including credential values or changing the sender switches", () => {
    expect(INTEGRATION_SETUP_GUIDES.map((g) => g.id)).toEqual([
      "whatsapp",
      "email",
      "webhook",
    ]);
    expect(
      INTEGRATION_SETUP_GUIDES.find((g) => g.id === "email")?.requirements.join(
        " ",
      ),
    ).toContain("only to the email associated with your Resend account");
    expect(
      INTEGRATION_SETUP_GUIDES.find((g) => g.id === "whatsapp")?.description,
    ).toContain("without deleting or migrating");
    expect(
      INTEGRATION_SETUP_GUIDES.every((g) =>
        g.variables.every((key) => /^[A-Z_]+$/.test(key)),
      ),
    ).toBe(true);
  });
  it("allows only an artist to return to the private integration setup page", () => {
    expect(roleMayOpen("artist", "/dashboard/alerts/setup")).toBe(true);
    for (const role of ["public", "broadcaster", "cmo"] as const)
      expect(roleMayOpen(role, "/dashboard/alerts/setup")).toBe(false);
    expect(safeReturnPath("/dashboard/alerts/setup", "artist")).toBe(
      "/dashboard/alerts/setup",
    );
    expect(
      safeReturnPath(
        "https://untrusted.example/dashboard/alerts/setup",
        "artist",
      ),
    ).toBe("/dashboard/artist");
  });
});
