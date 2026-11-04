import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { alertStatus, emailMessage, escapeHtml, whatsappNumber, whatsappText, MAX_BODY, type AlertLog } from "@/lib/alerts/compose";
import { secretMatches } from "@/lib/alerts/auth";
import { configuredChannels, deliver, envFromProcess, pickChannel, type HttpResult } from "@/lib/alerts/deliver";
import { drain, type OutboxStore, type PendingAlert } from "@/lib/alerts/outbox";

/**
 * Alerts are the part of the platform a client sees without opening the app,
 * so the failure modes matter more than the happy path: a missing phone must
 * not crash the queue, a rejected token must be recorded rather than retried
 * silently, and nothing may ever be sent twice.
 */

const alert = (over: Partial<PendingAlert> = {}): PendingAlert => ({
  id: "a1",
  profile_id: "p1",
  kind: "firstspin",
  title: "First spin on Capital FM",
  body: "Kampala Nights was just detected on Capital FM.",
  link: "/dashboard/artist",
  attempts: 0,
  ...over,
});

const waEnv = { whatsappToken: "tok", whatsappPhoneId: "1234", siteUrl: "https://east.test" };
const mailEnv = { resendKey: "re_key", mailFrom: "alerts@east.test", siteUrl: "https://east.test" };

const ok: HttpResult = { ok: true, status: 200, body: "{}" };
const fail = (status = 400, body = '{"error":"bad"}'): HttpResult => ({ ok: false, status, body });

describe("compose", () => {
  it("normalises Ugandan numbers for the WhatsApp API", () => {
    expect(whatsappNumber("+256 772 123 456")).toBe("256772123456");
    expect(whatsappNumber("0772123456")).toBe("0772123456");
  });

  it("refuses numbers that cannot be delivered to", () => {
    expect(whatsappNumber(null)).toBeNull();
    expect(whatsappNumber("")).toBeNull();
    expect(whatsappNumber("12345")).toBeNull();
    expect(whatsappNumber("+256772123456789012")).toBeNull();
  });

  it("puts the headline, body and absolute link in a WhatsApp message", () => {
    const text = whatsappText(alert(), "https://east.test");
    expect(text.startsWith("*First spin on Capital FM*")).toBe(true);
    expect(text).toContain("Kampala Nights");
    expect(text).toContain("https://east.test/dashboard/artist");
  });

  it("keeps long messages inside the WhatsApp size limit", () => {
    const long = whatsappText(alert({ body: "x".repeat(2000) }), "");
    expect(long.length).toBeLessThanOrEqual(MAX_BODY);
    expect(long.endsWith("…")).toBe(true);
  });

  it("escapes anything a user could have typed into the email HTML", () => {
    expect(escapeHtml('<script>"x" & \'y\'</script>')).toBe("&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;");
    const mail = emailMessage(alert({ title: "Nile <b>Breeze</b>" }), "https://east.test");
    expect(mail.subject).toBe("Nile <b>Breeze</b>");
    expect(mail.html).toContain("Nile &lt;b&gt;Breeze&lt;/b&gt;");
    expect(mail.html).not.toContain("<b>Breeze");
  });
});

describe("deliver", () => {
  it("prefers WhatsApp when a number and the platform are configured", () => {
    expect(pickChannel({ phone: "+256772123456", email: "a@b.c" }, waEnv)).toBe("whatsapp");
  });

  it("falls back to email when only an address is available", () => {
    expect(pickChannel({ phone: null, email: "a@b.c" }, { ...waEnv, ...mailEnv })).toBe("email");
  });

  it("posts a text message to the Cloud API with digits-only recipient", async () => {
    const post = vi.fn(async () => ok);
    const result = await deliver(alert(), { phone: "+256 772 123 456" }, waEnv, post);
    expect(result).toEqual({ ok: true, channel: "whatsapp" });
    const [url, headers, payload] = post.mock.calls[0] as unknown as [string, Record<string, string>, Record<string, unknown>];
    expect(url).toBe("https://graph.facebook.com/v22.0/1234/messages");
    expect(headers.authorization).toBe("Bearer tok");
    expect(payload).toMatchObject({ messaging_product: "whatsapp", to: "256772123456", type: "text" });
  });

  it("sends email through Resend with both text and HTML parts", async () => {
    const post = vi.fn(async () => ok);
    const result = await deliver(alert(), { email: "artist@east.test" }, mailEnv, post);
    expect(result).toEqual({ ok: true, channel: "email" });
    const [url, , payload] = post.mock.calls[0] as unknown as [string, Record<string, string>, Record<string, unknown>];
    expect(url).toBe("https://api.resend.com/emails");
    expect(payload).toMatchObject({ from: "alerts@east.test", to: ["artist@east.test"], subject: "First spin on Capital FM" });
    expect(String(payload.html)).toContain("Kampala Nights");
  });

  it("reports the provider's status instead of pretending it worked", async () => {
    const result = await deliver(alert(), { phone: "+256772123456" }, waEnv, async () => fail(401, '{"error":{"message":"token expired"}}'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("token expired");
  });

  it("skips quietly when nobody has a reachable channel", async () => {
    const post = vi.fn(async () => ok);
    const none = await deliver(alert(), {}, {}, post);
    expect(none).toMatchObject({ ok: false, skipped: "no delivery channel configured" });
    const unreachable = await deliver(alert(), {}, waEnv, post);
    expect(unreachable).toMatchObject({ ok: false, skipped: expect.stringContaining("no reachable phone or email") });
    expect(post).not.toHaveBeenCalled();
  });

  it("knows which channels a deployment has switched on", () => {
    expect(configuredChannels({})).toEqual([]);
    expect(configuredChannels({ whatsappToken: "t" })).toEqual([]);
    expect(configuredChannels(waEnv)).toEqual(["whatsapp"]);
    expect(configuredChannels({ ...waEnv, ...mailEnv })).toEqual(["whatsapp", "email"]);
  });
});

type ContactLookup = (profileId: string) => Promise<{ phone?: string | null; email?: string | null }>;

function fakeStore(rows: PendingAlert[], contact: ContactLookup = async () => ({ phone: "+256772123456" })) {
  const sent: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  const store: OutboxStore = {
    pending: async () => rows,
    contact,
    markSent: async (id) => void sent.push(id),
    markSkipped: async (id) => void skipped.push(id),
    markFailed: async (id, error, attempts) => void failed.push(`${id}:${attempts}:${error}`),
  };
  return { store, sent, skipped, failed };
}

describe("drain", () => {
  it("delivers every pending row and marks it sent", async () => {
    const { store, sent } = fakeStore([alert(), alert({ id: "a2", profile_id: "p2" })]);
    const summary = await drain(store, waEnv, async () => ok);
    expect(summary).toMatchObject({ picked: 2, sent: 2, failed: 0, skipped: 0 });
    expect(sent).toEqual(["a1", "a2"]);
  });

  it("keeps going when one recipient fails, and records why", async () => {
    const { store, sent, failed } = fakeStore([alert(), alert({ id: "a2" })]);
    let call = 0;
    const post = async () => (++call === 1 ? fail(500, "boom") : ok);
    const summary = await drain(store, waEnv, post);
    expect(summary).toMatchObject({ picked: 2, sent: 1, failed: 1 });
    expect(summary.errors[0]).toContain("boom");
    expect(sent).toEqual(["a2"]);
    expect(failed[0]).toMatch(/^a1:1:/);
  });

  it("counts an unreachable person as skipped, not failed", async () => {
    const { store, skipped } = fakeStore([], async () => ({ phone: null, email: null }));
    store.pending = async () => [alert()];
    const summary = await drain(store, waEnv, async () => ok);
    expect(summary).toMatchObject({ picked: 1, sent: 0, skipped: 1, failed: 0 });
    expect(skipped).toEqual(["a1"]);
  });

  it("survives a lookup that throws and still tries the rest", async () => {
    const contact = vi.fn(async (id: string) => {
      if (id === "p1") throw new Error("profile gone");
      return { phone: "+256772123456" };
    });
    const { store, failed, sent } = fakeStore([alert(), alert({ id: "a2", profile_id: "p2" })], contact);
    const summary = await drain(store, waEnv, async () => ok);
    expect(summary).toMatchObject({ sent: 1, failed: 1 });
    expect(failed[0]).toContain("profile gone");
    expect(sent).toEqual(["a2"]);
  });

  it("respects the batch limit", async () => {
    const { store } = fakeStore([alert()]);
    const pending = vi.fn(async () => [alert()]);
    store.pending = pending;
    await drain(store, waEnv, async () => ok, { limit: 7 });
    expect(pending).toHaveBeenCalledWith(7);
  });
});

describe("alertStatus", () => {
  const row = (over: Partial<AlertLog> = {}): AlertLog => ({
    id: "a1",
    kind: "firstspin",
    title: "First spin on Capital FM",
    created_at: "2026-11-04T09:00:00Z",
    sent_at: null,
    channel: null,
    last_error: null,
    attempts: 0,
    ...over,
  });

  it("says which channel carried the message", () => {
    expect(alertStatus(row({ sent_at: "2026-11-04T09:01:00Z", channel: "whatsapp" }))).toEqual({ text: "Sent by WhatsApp", tone: "sent" });
    expect(alertStatus(row({ sent_at: "2026-11-04T09:01:00Z", channel: "email" }))).toEqual({ text: "Sent by email", tone: "sent" });
  });

  it("explains a message that could not go anywhere", () => {
    expect(alertStatus(row({ sent_at: "2026-11-04T09:01:00Z", last_error: "no delivery channel configured" }))).toEqual({
      text: "Not delivered — no delivery channel configured",
      tone: "failed",
    });
  });

  it("shows queued and retrying states honestly", () => {
    expect(alertStatus(row())).toEqual({ text: "Queued", tone: "pending" });
    expect(alertStatus(row({ attempts: 2 }))).toEqual({ text: "Retrying (attempt 3)", tone: "pending" });
  });
});

describe("secretMatches", () => {
  const req = (headers: Record<string, string>) => new Request("https://east.test/api/cron/alerts", { headers });

  it("accepts the bearer token Vercel's scheduler sends", () => {
    expect(secretMatches(req({ authorization: "Bearer abc123" }), "abc123")).toBe(true);
  });

  it("accepts the short header used by manual curls", () => {
    expect(secretMatches(req({ "x-cron-secret": "abc123" }), "abc123")).toBe(true);
  });

  it("rejects everything else — a missing secret must never authorise", () => {
    expect(secretMatches(req({ authorization: "Bearer nope" }), "abc123")).toBe(false);
    expect(secretMatches(req({}), "abc123")).toBe(false);
    expect(secretMatches(req({ authorization: "Bearer " }), "")).toBe(false);
  });
});

describe("envFromProcess", () => {
  it("maps the server variables and leaves missing providers empty", () => {
    const env = envFromProcess({ WHATSAPP_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "9" }, "https://east.test");
    expect(env).toMatchObject({ whatsappToken: "t", whatsappPhoneId: "9", resendKey: "", siteUrl: "https://east.test" });
    expect(configuredChannels(env)).toEqual(["whatsapp"]);
  });
});

describe("alert cron route", () => {
  const rpc = vi.fn(async () => ({ data: 2, error: null }));
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "is", "order", "eq", "update"]) chain[method] = () => chain;
  chain.limit = async () => ({ data: [], error: null });
  chain.maybeSingle = async () => ({ data: null, error: null });

  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@supabase/supabase-js", () => ({
      createClient: () => ({ rpc, from: () => chain, auth: { admin: { getUserById: async () => ({ data: { user: null } }) } } }),
    }));
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    process.env.CRON_SECRET = "s3cret";
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.RESEND_API_KEY;
    delete process.env.ALERT_FROM_EMAIL;
    vi.doUnmock("@supabase/supabase-js");
  });

  it("refuses to run without a secret configured", async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await import("@/app/api/cron/alerts/route");
    const res = await GET(new Request("https://east.test/api/cron/alerts"));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("CRON_SECRET");
  });

  it("rejects a wrong bearer token", async () => {
    const { GET } = await import("@/app/api/cron/alerts/route");
    const res = await GET(new Request("https://east.test/api/cron/alerts", { headers: { authorization: "Bearer nope" } }));
    expect(res.status).toBe(401);
  });

  it("queues nothing when no provider is configured, so nothing breaks", async () => {
    rpc.mockClear();
    const { GET } = await import("@/app/api/cron/alerts/route");
    const res = await GET(new Request("https://east.test/api/cron/alerts", { headers: { authorization: "Bearer s3cret" } }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.channels).toEqual([]);
    expect(body.enqueued).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("enqueues then drains when WhatsApp is wired up", async () => {
    process.env.WHATSAPP_TOKEN = "tok";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "1234";
    rpc.mockClear();
    const { GET } = await import("@/app/api/cron/alerts/route");
    const res = await GET(new Request("https://east.test/api/cron/alerts?limit=5", { headers: { authorization: "Bearer s3cret" } }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, channels: ["whatsapp"], enqueued: 2, picked: 0, sent: 0 });
    expect(rpc).toHaveBeenCalledWith("enqueue_alerts");
  });
});
