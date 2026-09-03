import { describe, expect, it } from "vitest";

import {
  alertStations,
  buildDefaultRules,
  CHANNELS,
  simulateAlertEvents,
  toggleChannel,
  unverifiedMessage,
  webhookPayload,
  whatsappMessage,
} from "@/lib/alerts";
import { buildSeedTracks } from "@/lib/catalog";

const NOW = new Date("2026-09-03T12:00:00Z");
const CATALOGUE = buildSeedTracks(NOW);
const RULES = buildDefaultRules(CATALOGUE);
const STATION = { id: "capital-kla", name: "Capital FM", frequency: "91.3 MHz", hub: "Kampala" };

describe("alert message copy", () => {
  it("matches the shipped push format exactly", () => {
    expect(whatsappMessage("Katono", STATION, "2026-09-03T12:42:00Z")).toBe(
      "🔥 AIRPLAY ALERT: Your track 'Katono' was just played on Capital FM (91.3 Kampala) at 15:42 EAT! Verified by the UPRS registry.",
    );
  });

  it("renders the air time in East Africa Time, not UTC", () => {
    const message = whatsappMessage("Katono", STATION, "2026-09-03T00:15:00Z");
    expect(message).toContain("03:15 EAT");
  });

  it("drops the frequency when a station has none", () => {
    const bare = { ...STATION, frequency: "—" };
    expect(whatsappMessage("Katono", bare, "2026-09-03T12:42:00Z")).toContain(
      "on Capital FM (Kampala)",
    );
  });

  it("flags an unverified play differently", () => {
    const message = unverifiedMessage("Katono", STATION, "2026-09-03T12:42:00Z");
    expect(message).toContain("⚠️ UNVERIFIED AIRPLAY");
    expect(message).toContain("Not billable until resolved.");
    expect(message).not.toContain("🔥 AIRPLAY ALERT");
  });
});

describe("rules", () => {
  it("seeds track and station rules with a channel on each", () => {
    expect(RULES.some((r) => r.targetType === "track")).toBe(true);
    expect(RULES.some((r) => r.targetType === "station")).toBe(true);
    for (const rule of RULES) {
      expect(rule.label).toBeTruthy();
    }
  });

  it("exposes three channels", () => {
    expect(CHANNELS.map((c) => c.id)).toEqual(["whatsapp", "email", "webhook"]);
  });

  it("toggles a channel on and off", () => {
    const rule = { ...RULES[0], channels: ["whatsapp" as const] };

    const added = toggleChannel(rule, "email");
    expect(added.channels).toContain("email");
    expect(added.channels).toContain("whatsapp");

    const removed = toggleChannel(added, "email");
    expect(removed.channels).not.toContain("email");
    expect(removed.channels).toEqual(["whatsapp"]);
  });

  it("never mutates the rule it was given", () => {
    const rule = { ...RULES[0], channels: ["whatsapp" as const] };
    toggleChannel(rule, "email");
    expect(rule.channels).toEqual(["whatsapp"]);
  });
});

describe("station references", () => {
  it("carries a frequency and hub for the whole FM panel", () => {
    const stations = alertStations();
    expect(stations.length).toBeGreaterThan(10);

    for (const station of stations) {
      expect(station.frequency).toMatch(/^\d+\.\d MHz$/);
      expect(station.hub).toBeTruthy();
    }
  });
});

describe("event simulation", () => {
  it("is deterministic for a given rule set", () => {
    const a = simulateAlertEvents(RULES, CATALOGUE, NOW);
    const b = simulateAlertEvents(RULES, CATALOGUE, NOW);
    expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id));
  });

  it("emits nothing for a disabled rule", () => {
    const disabled = RULES.map((r) => ({ ...r, enabled: false }));
    expect(simulateAlertEvents(disabled, CATALOGUE, NOW)).toEqual([]);
  });

  it("emits nothing for a rule with no channels selected", () => {
    const muted = RULES.map((r) => ({ ...r, channels: [] }));
    expect(simulateAlertEvents(muted, CATALOGUE, NOW)).toEqual([]);
  });

  it("honours verifiedOnly by dropping unverified plays", () => {
    const events = simulateAlertEvents(RULES, CATALOGUE, NOW);
    const verifiedOnlyIds = new Set(
      RULES.filter((r) => r.verifiedOnly).map((r) => r.id),
    );

    for (const event of events) {
      if (verifiedOnlyIds.has(event.ruleId)) {
        expect(event.verified).toBe(true);
      }
    }
  });

  it("routes each event to a channel its rule actually has", () => {
    const byId = new Map(RULES.map((r) => [r.id, r]));
    for (const event of simulateAlertEvents(RULES, CATALOGUE, NOW)) {
      expect(byId.get(event.ruleId)!.channels).toContain(event.channel);
    }
  });

  it("returns events newest first", () => {
    const events = simulateAlertEvents(RULES, CATALOGUE, NOW);
    for (let i = 1; i < events.length; i++) {
      expect(events[i - 1].atIso >= events[i].atIso).toBe(true);
    }
  });
});

describe("webhook payload", () => {
  it("carries everything a subscriber needs to reconcile a play", () => {
    const [event] = simulateAlertEvents(RULES, CATALOGUE, NOW);
    const payload = webhookPayload(event);
    const station = payload.station as Record<string, string>;

    expect(payload.event).toBe("airplay.verified");
    expect(payload.occurred_at).toBe(event.atIso);
    expect(payload.track_id).toBe(event.trackId);
    expect(payload.title).toBe(event.title);
    expect(station.name).toBe(event.station.name);
    expect(station.hub).toBe(event.station.hub);
    expect(payload.verified).toBe(event.verified);
    expect(payload.source).toBe("bmat");
  });
});
