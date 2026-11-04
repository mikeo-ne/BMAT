import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  activeSubscriptionCount,
  channelReady,
  defaultNotificationPreferences,
  normaliseWhatsappPhone,
  notificationCandidates,
  notificationWebhookPayload,
  parseMilestones,
  parseNotificationPreferences,
  renderMessageTemplate,
  templateIssues,
  testNotification,
  type MessageToken,
} from "@/lib/notifications";
import {
  buildAirplayDigest,
  digestDue,
  digestText,
  renderDigestPdf,
} from "@/lib/notification-digests";
import { publicHttpsUrl } from "@/lib/public-url";
import {
  CAPTURE_NOW,
  capturedSpin,
  optedInPreferences,
  REFERENCE_CATALOGUE,
  subscription,
} from "@/tests/fixtures/captured";

const candidates = (
  spins: ReturnType<typeof capturedSpin>[],
  config = optedInPreferences(),
) => notificationCandidates(spins, REFERENCE_CATALOGUE, config, CAPTURE_NOW);

describe("validated, consent-based channel preferences", () => {
  it.each(["+256772123456", "+256 772 123456", "+256 (772) 123-456"])(
    "normalises Uganda E.164 %s",
    (phone) => {
      expect(normaliseWhatsappPhone(phone)).toBe("+256772123456");
    },
  );
  it.each([
    "0772123456",
    "+2560772123456",
    "+25677212345",
    "+2567721234567",
    "+256abc123456",
    "",
    "+00000000",
  ])("rejects invalid phone %s", (phone) =>
    expect(normaliseWhatsappPhone(phone)).toBeNull(),
  );
  it("also accepts a valid non-Uganda international number", () =>
    expect(normaliseWhatsappPhone("+254712345678")).toBe("+254712345678"));
  it("starts with no recipients, subscriptions, webhooks or inferred consent", () => {
    const config = defaultNotificationPreferences();
    expect(parseNotificationPreferences(config)).toEqual(config);
    expect(activeSubscriptionCount(config)).toBe(0);
    for (const channel of ["whatsapp", "email", "webhook"] as const)
      expect(channelReady(config, channel)).toBe(false);
  });
  it("counts one locally active subscription, not one per channel or provider connection", () => {
    const config = optedInPreferences({ channels: ["whatsapp", "email"] });
    expect(activeSubscriptionCount(config, REFERENCE_CATALOGUE)).toBe(1);
    config.whatsapp.consent = false;
    expect(activeSubscriptionCount(config, REFERENCE_CATALOGUE)).toBe(1);
    config.email.consent = false;
    expect(activeSubscriptionCount(config, REFERENCE_CATALOGUE)).toBe(0);
  });
  it("does not count paused or deleted-recording subscriptions", () => {
    const config = optedInPreferences();
    config.subscriptions.push(subscription({ id: "paused", enabled: false }));
    config.subscriptions.push(
      subscription({ id: "deleted", trackId: "deleted-track" }),
    );
    expect(activeSubscriptionCount(config, REFERENCE_CATALOGUE)).toBe(1);
  });
  it.each([
    (config: ReturnType<typeof optedInPreferences>) => {
      config.subscriptions.push({ ...config.subscriptions[0] });
    },
    (config: ReturnType<typeof optedInPreferences>) => {
      config.subscriptions[0].channels = ["whatsapp", "whatsapp"];
    },
    (config: ReturnType<typeof optedInPreferences>) => {
      config.subscriptions[0].triggers = [];
    },
    (config: ReturnType<typeof optedInPreferences>) => {
      config.subscriptions[0].activatedAt = "not-a-date";
    },
    (config: ReturnType<typeof optedInPreferences>) => {
      config.email.hour = 24;
    },
    (config: ReturnType<typeof optedInPreferences>) => {
      config.email.weeklyDay = 7;
    },
    (config: ReturnType<typeof optedInPreferences>) => {
      config.whatsapp.template = "{{unknown}}";
    },
    (config: ReturnType<typeof optedInPreferences>) => {
      config.webhooks = [
        {
          id: "hook",
          label: "Unsafe",
          kind: "json",
          enabled: true,
          url: "http://localhost/private",
        },
      ];
    },
  ])("rejects malformed configurations atomically", (mutate) => {
    const config = optedInPreferences();
    mutate(config);
    expect(parseNotificationPreferences(config)).toBeNull();
  });
  it("bounds subscriptions, webhooks and milestones", () => {
    const config = optedInPreferences();
    config.subscriptions = Array.from({ length: 101 }, (_, i) =>
      subscription({ id: `sub-${i}` }),
    );
    expect(parseNotificationPreferences(config)).toBeNull();
    expect(parseMilestones("1, 100;1000 100")).toEqual([1, 100, 1000]);
    for (const value of ["", "-1", "0", "1.5", "1e3", "1000000001"])
      expect(parseMilestones(value)).toBeNull();
  });
  it("validates tokens and renders without recursively interpreting user values", () => {
    expect(templateIssues("{{title}} played on {{station}}")).toEqual([]);
    expect(templateIssues("{{title}").length).toBeGreaterThan(0);
    expect(templateIssues("{{invented}}")[0]).toMatch(/Unknown/);
    const values = Object.fromEntries(
      [
        "title",
        "artist",
        "station",
        "location",
        "region",
        "time",
        "spinsToday",
        "totalSpins",
        "milestone",
        "trigger",
      ].map((key) => [key, key]),
    ) as Record<MessageToken, string>;
    expect(
      renderMessageTemplate("{{ title }}: {{spinsToday}}", {
        ...values,
        title: "{{station}}",
      }),
    ).toBe("{{station}}: spinsToday");
    expect(
      renderMessageTemplate("{{title}}", {
        ...values,
        title: "a".repeat(2000),
      }),
    ).toHaveLength(1024);
  });
  it.each([
    "http://hooks.example.com",
    "https://localhost/x",
    "https://127.0.0.1",
    "https://0x7f000001",
    "https://[::1]",
    "https://a.internal",
    "https://a.test",
    "https://user:password@hooks.example.com",
    "https://hooks.example.com:8443",
    "https://hooks.example.com/#fragment",
  ])("blocks non-public webhook/source reference %s", (url) =>
    expect(publicHttpsUrl(url)).toBeNull(),
  );
  it("accepts a public HTTPS relay URL", () =>
    expect(
      publicHttpsUrl("https://hooks.example.com/airplay?team=music")?.hostname,
    ).toBe("hooks.example.com"));
});

describe("capture-only, global-counter alert triggers", () => {
  it("first ever means the first captured FM play in connected history, even without an ISRC", () => {
    const events = candidates(
      [capturedSpin()],
      optedInPreferences({ triggers: ["first"] }),
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      trigger: "first",
      ordinal: 1,
      source: "captured",
    });
    expect(events[0].message).toContain("First captured FM play");
  });
  it("deduplicates provider IDs and ignores demo, TV, unmatched and future records", () => {
    const row = capturedSpin();
    const events = candidates(
      [
        row,
        row,
        capturedSpin({ id: "demo", source: "demo" }),
        capturedSpin({ id: "tv", medium: "TV", stationId: "nbs-tv-kla" }),
        capturedSpin({ id: "unknown", trackId: null }),
        capturedSpin({ id: "future", detectedAt: "2026-11-02T00:00:00.000Z" }),
      ],
      optedInPreferences({ triggers: ["first", "milestone"], milestones: [2] }),
    );
    expect(events.map((event) => event.trigger)).toEqual(["first"]);
  });
  it("fires once at the exact 100th and 1,000th FM spins, independently of reporting windows", () => {
    const history = Array.from({ length: 1001 }, (_, i) =>
      capturedSpin({
        id: `milestone-${i}`,
        detectedAt: new Date(
          Date.parse("2026-11-01T13:00:00Z") + i * 1000,
        ).toISOString(),
      }),
    );
    const events = candidates(
      history,
      optedInPreferences({ triggers: ["milestone"] }),
    );
    expect(
      events.map((event) => event.milestone).sort((a, b) => a! - b!),
    ).toEqual([100, 1000]);
  });
  it("updates global totals before station and region filtering", () => {
    const history = [
      capturedSpin({
        id: "one",
        stationId: "mega-gul",
        region: "Northern",
        detectedAt: "2026-11-01T12:00:00Z",
      }),
      capturedSpin({ id: "two", detectedAt: "2026-11-01T13:00:00Z" }),
    ];
    const events = candidates(
      history,
      optedInPreferences({
        stationId: "capital-kla",
        region: "Central",
        triggers: ["first", "milestone"],
        milestones: [2],
      }),
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      trigger: "milestone",
      ordinal: 2,
      spinsToday: 2,
    });
  });
  it("uses EAT calendar dates for daily message counters", () => {
    const events = candidates(
      [
        capturedSpin({ id: "old-day", detectedAt: "2026-10-31T20:59:59Z" }),
        capturedSpin({ id: "new-day", detectedAt: "2026-10-31T21:00:00Z" }),
      ],
      optedInPreferences({ triggers: ["milestone"], milestones: [2] }),
    );
    expect(events[0]).toMatchObject({ ordinal: 2, spinsToday: 1 });
  });
  it.each(["capital-kla", "cbs-kla", "galaxy-kla"])(
    "supports morning and drive on %s",
    (stationId) => {
      const rows = ["03:00", "06:59", "07:00", "13:00", "16:59", "17:00"].map(
        (time, i) =>
          capturedSpin({
            id: `prime-${i}`,
            stationId,
            detectedAt: `2026-11-01T${time}:00Z`,
          }),
      );
      expect(
        candidates(rows, optedInPreferences({ triggers: ["prime"] })),
      ).toHaveLength(4);
    },
  );
  it("does not treat another FM station as one of the configured prime-time broadcasters", () =>
    expect(
      candidates(
        [capturedSpin({ stationId: "mega-gul" })],
        optedInPreferences({ triggers: ["prime"] }),
      ),
    ).toHaveLength(0));
  it("never retrospectively sends on subscription activation, while retaining all-time counters", () => {
    const config = optedInPreferences({
      createdAt: "2026-11-01T12:30:00Z",
      triggers: ["first", "milestone"],
      milestones: [2],
    });
    const events = candidates(
      [
        capturedSpin({ id: "before", detectedAt: "2026-11-01T12:00:00Z" }),
        capturedSpin({ id: "after" }),
      ],
      config,
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ trigger: "milestone", ordinal: 2 });
    config.subscriptions[0].activatedAt = "2026-11-01T14:00:00Z";
    expect(candidates([capturedSpin()], config)).toHaveLength(0);
  });
  it("does not send on a paused rule or a channel without consent", () => {
    const config = optedInPreferences({ enabled: false });
    expect(candidates([capturedSpin()], config)).toHaveLength(0);
    config.subscriptions[0].enabled = true;
    config.whatsapp.consent = false;
    expect(candidates([capturedSpin()], config)).toHaveLength(0);
  });
  it("escapes compound IDs so a colon in a provider or subscription ID cannot collide", () => {
    const a = candidates(
      [capturedSpin({ id: "b:c" })],
      optedInPreferences({ id: "a", triggers: ["first"] }),
    )[0];
    const b = candidates(
      [capturedSpin({ id: "c" })],
      optedInPreferences({ id: "a:b", triggers: ["first"] }),
    )[0];
    expect(a.id).not.toBe(b.id);
  });
  it("keeps phone simulations out of capture counts and flags webhook previews as simulated", () => {
    const config = optedInPreferences();
    const test = testNotification(REFERENCE_CATALOGUE, config, CAPTURE_NOW)!;
    expect(test.source).toBe("simulator");
    expect(test.message).toContain("TEST — SIMULATED AIRPLAY");
    expect(notificationWebhookPayload(test).mode).toBe("simulator");
    expect(candidates([])).toEqual([]);
    expect(testNotification([], config)).toBeNull();
  });
});

describe("completed-period EAT recaps and genuine PDF exports", () => {
  it("a daily recap excludes today, includes exact EAT bounds, and deduplicates captures", () => {
    const row = capturedSpin({
      id: "yesterday",
      detectedAt: "2026-10-30T21:00:00Z",
    });
    const digest = buildAirplayDigest(
      [
        row,
        row,
        capturedSpin(),
        capturedSpin({
          id: "unmatched",
          trackId: null,
          detectedAt: "2026-10-31T20:59:59Z",
        }),
        capturedSpin({ id: "excluded", detectedAt: "2026-10-31T21:00:00Z" }),
        capturedSpin({
          id: "demo",
          source: "demo",
          detectedAt: row.detectedAt,
        }),
      ],
      REFERENCE_CATALOGUE,
      "daily",
      CAPTURE_NOW,
    );
    expect(digest).toMatchObject({
      startDay: "2026-10-31",
      endDay: "2026-10-31",
      totalAudited: 2,
      matched: 1,
      unmatched: 1,
    });
    expect(digest.regions).toHaveLength(4);
    expect(digest.topStation?.name).toBe("Capital FM");
    expect(digestText(digest)).toContain("No prior baseline");
  });
  it("compares complete adjacent seven-day regional periods without dividing by zero", () => {
    const rows = [
      capturedSpin({ id: "prior", detectedAt: "2026-10-20T12:00:00Z" }),
      ...[0, 1].map((i) =>
        capturedSpin({ id: `recent-${i}`, detectedAt: "2026-10-30T12:00:00Z" }),
      ),
    ];
    const digest = buildAirplayDigest(
      rows,
      REFERENCE_CATALOGUE,
      "weekly",
      CAPTURE_NOW,
    );
    expect(digest).toMatchObject({
      startDay: "2026-10-25",
      endDay: "2026-10-31",
      matched: 2,
    });
    expect(digest.regions[0]).toMatchObject({
      previous: 1,
      spins: 2,
      change: 1,
    });
    expect(digest.regions[1].change).toBeNull();
  });
  it("schedules morning email by EAT, configured weekday and explicit opt-in", () => {
    const config = optedInPreferences();
    expect(digestDue("daily", config, new Date("2026-11-02T03:59:00Z"))).toBe(
      false,
    );
    expect(digestDue("daily", config, new Date("2026-11-02T04:00:00Z"))).toBe(
      true,
    );
    expect(digestDue("weekly", config, new Date("2026-11-02T04:00:00Z"))).toBe(
      true,
    );
    expect(digestDue("weekly", config, CAPTURE_NOW)).toBe(false);
    config.email.consent = false;
    expect(digestDue("daily", config, CAPTURE_NOW)).toBe(false);
  });
  it("exports a valid PDF, including Unicode fallback, long names and pagination", async () => {
    const digest = buildAirplayDigest(
      [],
      REFERENCE_CATALOGUE,
      "weekly",
      CAPTURE_NOW,
    );
    digest.tracks = Array.from({ length: 90 }, (_, i) => ({
      id: `pdf-${i}`,
      title: `UNFORGETTABLE — 🎵 ${"W".repeat(200)}`,
      artist: "MAUIMØON",
      spins: i + 1,
    }));
    const bytes = await renderDigestPdf(digest);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
    expect(pdf.getTitle()).toContain("weekly");
  });
});
