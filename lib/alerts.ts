import { createRandom, hashSeed } from "@/lib/airplay";
import { formatEatClock } from "@/lib/format";
import { FM_STATIONS, type Station } from "@/lib/regions";
import type { Track } from "@/lib/types";

/* -------------------------------------------------------------------------- */
/* Channels                                                                    */
/* -------------------------------------------------------------------------- */

export type ChannelId = "whatsapp" | "email" | "webhook";

export interface AlertChannel {
  id: ChannelId;
  label: string;
  hint: string;
}

export const CHANNELS: AlertChannel[] = [
  { id: "whatsapp", label: "WhatsApp", hint: "Instant push to the artist's number" },
  { id: "email", label: "Email", hint: "Daily digest or per-play, with the audit trail attached" },
  { id: "webhook", label: "Webhook", hint: "POST a signed JSON payload to your endpoint" },
];

/* -------------------------------------------------------------------------- */
/* Rules                                                                       */
/* -------------------------------------------------------------------------- */

export type RuleTarget = "track" | "station";

export interface AlertRule {
  id: string;
  targetType: RuleTarget;
  targetId: string;
  /** What the rule is about, shown in the list. */
  label: string;
  channels: ChannelId[];
  enabled: boolean;
  /** Only fire for plays BMAT could fingerprint against the catalogue. */
  verifiedOnly: boolean;
}

/** Default rules so the panel is populated on first load. */
export function buildDefaultRules(catalogue: Track[]): AlertRule[] {
  const rules: AlertRule[] = [];

  for (const [i, track] of catalogue.slice(0, 4).entries()) {
    rules.push({
      id: `rule_track_${i + 1}`,
      targetType: "track",
      targetId: track.id,
      label: track.title,
      channels: i === 0 ? ["whatsapp"] : i === 1 ? ["whatsapp", "email"] : ["email"],
      enabled: i < 3,
      verifiedOnly: i % 2 === 0,
    });
  }

  for (const [i, station] of ["capital-kla", "cbs-kla", "gaaki-jin"].entries()) {
    const found = FM_STATIONS.find((s) => s.id === station);
    rules.push({
      id: `rule_station_${i + 1}`,
      targetType: "station",
      targetId: station,
      label: found?.name ?? station,
      channels: i === 0 ? ["whatsapp", "webhook"] : ["webhook"],
      enabled: i < 2,
      verifiedOnly: true,
    });
  }

  return rules;
}

export function toggleChannel(rule: AlertRule, channel: ChannelId): AlertRule {
  const has = rule.channels.includes(channel);
  return {
    ...rule,
    channels: has ? rule.channels.filter((c) => c !== channel) : [...rule.channels, channel],
  };
}

/* -------------------------------------------------------------------------- */
/* Play events                                                                 */
/* -------------------------------------------------------------------------- */

export interface StationRef {
  id: string;
  name: string;
  frequency: string;
  hub: string;
}

/** The whole FM panel, with frequency and hub, as alert rules see it. */
export function alertStations(): StationRef[] {
  return FM_STATIONS.map((station: Station) => ({
    id: station.id,
    name: station.name,
    frequency: station.frequency,
    hub: station.location,
  }));
}

export interface AlertEvent {
  id: string;
  ruleId: string;
  channel: ChannelId;
  trackId: string;
  title: string;
  station: StationRef;
  /** UTC instant of the play. */
  atIso: string;
  verified: boolean;
  message: string;
}

const SIGNATURES = ["EastSound", "BMAT Fingerprint", "the UPRS registry"];

/**
 * Deterministic play events for the rules that are switched on.
 *
 * Roughly one play in seven comes back unverified, which is the case worth
 * alerting on separately — an unverified play is not billable.
 */
export function simulateAlertEvents(
  rules: AlertRule[],
  catalogue: Track[],
  now: Date = new Date(),
): AlertEvent[] {
  const stations = alertStations();
  const events: AlertEvent[] = [];

  const active = rules.filter((r) => r.enabled && r.channels.length > 0);

  for (const rule of active) {
    const rand = createRandom(hashSeed(`alerts:${rule.id}`));
    const count = 3 + Math.floor(rand() * 4); // 3-6 plays per rule

    for (let i = 0; i < count; i++) {
      const track =
        rule.targetType === "track"
          ? (catalogue.find((t) => t.id === rule.targetId) ?? catalogue[0])
          : catalogue[Math.floor(rand() * catalogue.length)];

      if (!track) continue;

      const station =
        rule.targetType === "station"
          ? stations.find((s) => s.id === rule.targetId) ?? stations[0]
          : stations[Math.floor(rand() * stations.length)];

      if (!station) continue;

      // Spread across the working day, EAT.
      const hour = 6 + Math.floor(rand() * 14);
      const minute = Math.floor(rand() * 60);
      const atIso = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), (hour - 3 + 24) % 24, minute),
      ).toISOString();

      const verified = rand() > 0.14;
      if (rule.verifiedOnly && !verified) continue;

      for (const channel of rule.channels) {
        events.push({
          id: `${rule.id}:${i}:${channel}`,
          ruleId: rule.id,
          channel,
          trackId: track.id,
          title: track.title,
          station,
          atIso,
          verified,
          message: verified
            ? whatsappMessage(track.title, station, atIso)
            : unverifiedMessage(track.title, station, atIso),
        });
      }
    }
  }

  return events.sort((a, b) => b.atIso.localeCompare(a.atIso));
}

/**
 * The push copy, in the shape the product ships.
 *
 * `🔥 AIRPLAY ALERT: Your track 'Katono' was just played on Capital FM
 * (91.3 Kampala) at 15:42 EAT! Verified by EastSound.`
 */
export function whatsappMessage(title: string, station: StationRef, atIso: string): string {
  const signature = SIGNATURES[hashSeed(`${title}:${station.id}`) % SIGNATURES.length];
  const freq = station.frequency === "—" ? "" : `${station.frequency.replace(" MHz", "")} `;
  return `🔥 AIRPLAY ALERT: Your track '${title}' was just played on ${station.name} (${freq}${station.hub}) at ${formatEatClock(atIso)}! Verified by ${signature}.`;
}

/** Same event, when BMAT could not fingerprint the playout. */
export function unverifiedMessage(title: string, station: StationRef, atIso: string): string {
  const freq = station.frequency === "—" ? "" : `${station.frequency.replace(" MHz", "")} `;
  return `⚠️ UNVERIFIED AIRPLAY: A play resembling '${title}' was logged on ${station.name} (${freq}${station.hub}) at ${formatEatClock(atIso)}, but no fingerprint match was returned. Not billable until resolved.`;
}

/** The JSON body a webhook subscriber would receive. */
export function webhookPayload(event: AlertEvent): Record<string, unknown> {
  return {
    event: "airplay.verified",
    occurred_at: event.atIso,
    track_id: event.trackId,
    title: event.title,
    station: {
      id: event.station.id,
      name: event.station.name,
      frequency: event.station.frequency,
      hub: event.station.hub,
    },
    verified: event.verified,
    source: "bmat",
  };
}
