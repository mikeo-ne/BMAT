import type { ChannelId } from "@/lib/alerts";
import { formatEatClock } from "@/lib/format";
import { eatDate, eatHour, type BroadcastSpin } from "@/lib/playout";
import { FM_STATIONS, REGIONS, type Region } from "@/lib/regions";
import { publicHttpsUrl } from "@/lib/public-url";
import type { Track } from "@/lib/types";

export const TRIGGERS = [
  {
    id: "first",
    label: "First-Ever Airplay Alert",
    hint: "The first captured FM play in your connected panel history, not a claim about all radio worldwide.",
  },
  {
    id: "milestone",
    label: "Milestone Spin Alerts",
    hint: "Fire once at each threshold, using the recording’s all-time captured FM count.",
  },
  {
    id: "prime",
    label: "Prime-Time Airplay Drops",
    hint: "Capital FM, CBS FM and Galaxy FM, 06–10 / 16–20 EAT. These are configurable reporting windows, not verified show schedules.",
  },
] as const;
export type TriggerId = (typeof TRIGGERS)[number]["id"];
export const PRIME_STATIONS = ["capital-kla", "cbs-kla", "galaxy-kla"];
export const MESSAGE_TOKENS = [
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
] as const;
export type MessageToken = (typeof MESSAGE_TOKENS)[number];
export const DEFAULT_MESSAGE_TEMPLATE =
  "🔥 Airplay Alert! '{{title}}' just played on {{station}} ({{location}}) at {{time}}. Total spins today: {{spinsToday}}. {{trigger}}";
export const NOTIFICATION_STORAGE_KEY = "east-sound:notifications:v1";
export const NOTIFICATION_CHANGE_EVENT = "east-sound:notifications-changed";

export interface AlertSubscription {
  id: string;
  name: string;
  trackId: string | "all";
  stationId: string | "all";
  region: Region | "All";
  channels: ChannelId[];
  triggers: TriggerId[];
  milestones: number[];
  enabled: boolean;
  createdAt: string;
  activatedAt?: string;
}
export interface WebhookDestination {
  /** Write-only input / worker-only decrypted value. Never returned or cached by the server. */
  secret?: string;
  secretConfigured?: boolean;
  id: string;
  label: string;
  kind: "json" | "discord" | "telegram";
  url: string;
  enabled: boolean;
}
export interface NotificationPreferences {
  version: 1;
  whatsapp: { phone: string; consent: boolean; template: string };
  email: {
    address: string;
    consent: boolean;
    daily: boolean;
    weekly: boolean;
    hour: number;
    weeklyDay: number;
  };
  webhooks: WebhookDestination[];
  subscriptions: AlertSubscription[];
}

export function defaultNotificationPreferences(): NotificationPreferences {
  return {
    version: 1,
    whatsapp: { phone: "", consent: false, template: DEFAULT_MESSAGE_TEMPLATE },
    email: {
      address: "",
      consent: false,
      daily: true,
      weekly: true,
      hour: 7,
      weeklyDay: 1,
    },
    webhooks: [],
    subscriptions: [],
  };
}

/** Uganda numbers must have nine subscriber digits. Other international E.164 numbers are also supported. */
export function normaliseWhatsappPhone(value: string): string | null {
  const phone = value.trim().replace(/[\s()-]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return null;
  if (phone.startsWith("+256") && !/^\+256[1-9]\d{8}$/.test(phone)) return null;
  return phone;
}
export function validEmail(value: string): boolean {
  return (
    value.length <= 254 &&
    /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value) &&
    !/[\r\n]/.test(value)
  );
}
export function templateIssues(template: string): string[] {
  const errors: string[] = [];
  if (!template.trim() || template.length > 1000)
    errors.push("Use a message template between 1 and 1,000 characters.");
  const rest = template.replace(
    /{{\s*([A-Za-z][A-Za-z0-9]*)\s*}}/g,
    (_, key: string) => {
      if (!MESSAGE_TOKENS.includes(key as MessageToken))
        errors.push(`Unknown template token: ${key}.`);
      return "";
    },
  );
  if (rest.includes("{{") || rest.includes("}}"))
    errors.push("Close each template token with two braces.");
  return errors;
}
export function renderMessageTemplate(
  template: string,
  values: Record<MessageToken, string | number>,
): string {
  return template
    .replace(/{{\s*([A-Za-z][A-Za-z0-9]*)\s*}}/g, (match, key: string) =>
      MESSAGE_TOKENS.includes(key as MessageToken)
        ? String(values[key as MessageToken])
        : match,
    )
    .slice(0, 1024);
}
export function parseMilestones(value: string): number[] | null {
  const parts = value.split(/[\s,;]+/).filter(Boolean);
  if (
    !parts.length ||
    parts.length > 20 ||
    parts.some(
      (part) =>
        !/^\d+$/.test(part) || Number(part) < 1 || Number(part) > 1000000000,
    )
  )
    return null;
  return [...new Set(parts.map(Number))].sort((a, b) => a - b);
}

export function subscriptionIssues(
  subscription: AlertSubscription,
  catalogue?: Track[],
): string[] {
  const issues: string[] = [];
  if (!subscription.name.trim() || subscription.name.length > 100)
    issues.push("Name the subscription (up to 100 characters).");
  if (
    catalogue &&
    subscription.trackId !== "all" &&
    !catalogue.some((track) => track.id === subscription.trackId)
  )
    issues.push("Select an available recording.");
  if (
    subscription.stationId !== "all" &&
    !FM_STATIONS.some((station) => station.id === subscription.stationId)
  )
    issues.push("Select a known FM station.");
  if (subscription.region !== "All" && !REGIONS.includes(subscription.region))
    issues.push("Choose a valid region.");
  if (!subscription.channels.length)
    issues.push("Select at least one notification channel.");
  if (!subscription.triggers.length)
    issues.push("Select at least one trigger.");
  if (
    subscription.triggers.includes("milestone") &&
    (!subscription.milestones.length ||
      subscription.milestones.length > 20 ||
      subscription.milestones.some(
        (number) =>
          !Number.isInteger(number) || number < 1 || number > 1000000000,
      ))
  )
    issues.push("Provide up to 20 positive, whole-number milestones.");
  return issues;
}

export function preferencesIssues(config: NotificationPreferences): string[] {
  const errors = templateIssues(config.whatsapp.template);
  if (config.whatsapp.phone && !normaliseWhatsappPhone(config.whatsapp.phone))
    errors.push(
      "Use an international WhatsApp number, for example +256 772 123456 (nine digits after +256).",
    );
  if (config.whatsapp.consent && !config.whatsapp.phone)
    errors.push("Enter the consenting recipient’s WhatsApp number.");
  if (config.email.address && !validEmail(config.email.address))
    errors.push("Enter a valid email address.");
  if (config.email.consent && !config.email.address)
    errors.push("Enter the consenting recipient’s email address.");
  if (
    !Number.isInteger(config.email.hour) ||
    config.email.hour < 0 ||
    config.email.hour > 23
  )
    errors.push("Choose a digest hour between 00 and 23 EAT.");
  if (
    !Number.isInteger(config.email.weeklyDay) ||
    config.email.weeklyDay < 0 ||
    config.email.weeklyDay > 6
  )
    errors.push("Choose a valid weekly digest day.");
  for (const destination of config.webhooks) {
    if (!destination.label.trim() || destination.label.length > 100)
      errors.push("Name every webhook destination.");
    if (!publicHttpsUrl(destination.url))
      errors.push(
        `Use a public HTTPS URL for ${destination.label || "each webhook"}. Local/private addresses, credentials and fragments are not allowed.`,
      );
  }
  return errors;
}

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
/** Strictly bound stored/worker configuration. Invalid input is never partially applied. */
export function parseNotificationPreferences(
  input: unknown,
): NotificationPreferences | null {
  if (
    !object(input) ||
    input.version !== 1 ||
    !object(input.whatsapp) ||
    !object(input.email) ||
    !Array.isArray(input.webhooks) ||
    !Array.isArray(input.subscriptions) ||
    input.webhooks.length > 10 ||
    input.subscriptions.length > 100
  )
    return null;
  const wa = input.whatsapp,
    email = input.email;
  if (
    typeof wa.phone !== "string" ||
    wa.phone.length > 40 ||
    typeof wa.consent !== "boolean" ||
    typeof wa.template !== "string" ||
    wa.template.length > 1000
  )
    return null;
  if (
    typeof email.address !== "string" ||
    email.address.length > 254 ||
    typeof email.consent !== "boolean" ||
    typeof email.daily !== "boolean" ||
    typeof email.weekly !== "boolean" ||
    typeof email.hour !== "number" ||
    typeof email.weeklyDay !== "number"
  )
    return null;
  const ids = new Set<string>([
    "__proto__",
    "constructor",
    "prototype",
    "toString",
    "valueOf",
    "hasOwnProperty",
  ]);
  for (const hook of input.webhooks) {
    if (
      !object(hook) ||
      typeof hook.id !== "string" ||
      !/^[\w:-]{1,100}$/.test(hook.id) ||
      ids.has(hook.id) ||
      typeof hook.label !== "string" ||
      typeof hook.url !== "string" ||
      typeof hook.enabled !== "boolean" ||
      !["json", "discord", "telegram"].includes(String(hook.kind))
    )
      return null;
    ids.add(hook.id);
  }
  for (const sub of input.subscriptions) {
    if (
      !object(sub) ||
      typeof sub.id !== "string" ||
      !/^[\w:-]{1,100}$/.test(sub.id) ||
      ids.has(sub.id) ||
      typeof sub.name !== "string" ||
      typeof sub.trackId !== "string" ||
      sub.trackId.length > 160 ||
      typeof sub.stationId !== "string" ||
      !["All", ...REGIONS].includes(String(sub.region)) ||
      typeof sub.enabled !== "boolean" ||
      typeof sub.createdAt !== "string" ||
      !Number.isFinite(Date.parse(sub.createdAt)) ||
      (sub.activatedAt !== undefined &&
        (typeof sub.activatedAt !== "string" ||
          !Number.isFinite(Date.parse(sub.activatedAt))))
    )
      return null;
    if (
      !Array.isArray(sub.channels) ||
      !sub.channels.length ||
      sub.channels.length > 3 ||
      sub.channels.some(
        (channel) => !["whatsapp", "email", "webhook"].includes(channel),
      ) ||
      new Set(sub.channels).size !== sub.channels.length
    )
      return null;
    if (
      !Array.isArray(sub.triggers) ||
      sub.triggers.length > 3 ||
      sub.triggers.some(
        (trigger) => !TRIGGERS.some((option) => option.id === trigger),
      ) ||
      new Set(sub.triggers).size !== sub.triggers.length
    )
      return null;
    if (
      !Array.isArray(sub.milestones) ||
      sub.milestones.length > 20 ||
      sub.milestones.some(
        (number) =>
          !Number.isInteger(number) || number < 1 || number > 1000000000,
      )
    )
      return null;
    ids.add(sub.id);
  }
  const config = input as unknown as NotificationPreferences;
  if (
    preferencesIssues(config).length ||
    config.subscriptions.some((sub) => subscriptionIssues(sub).length)
  )
    return null;
  return {
    ...config,
    whatsapp: {
      ...config.whatsapp,
      phone: config.whatsapp.phone
        ? normaliseWhatsappPhone(config.whatsapp.phone)!
        : "",
    },
    email: { ...config.email, address: config.email.address.trim() },
  };
}
export function channelReady(
  config: NotificationPreferences,
  channel: ChannelId,
): boolean {
  if (channel === "whatsapp")
    return (
      !!normaliseWhatsappPhone(config.whatsapp.phone) &&
      config.whatsapp.consent &&
      !templateIssues(config.whatsapp.template).length
    );
  if (channel === "email")
    return validEmail(config.email.address) && config.email.consent;
  return config.webhooks.some(
    (hook) => hook.enabled && !!publicHttpsUrl(hook.url),
  );
}
export function activeSubscriptionCount(
  config: NotificationPreferences,
  catalogue?: Track[],
): number {
  return config.subscriptions.filter(
    (sub) =>
      sub.enabled &&
      !subscriptionIssues(sub, catalogue).length &&
      sub.channels.some((channel) => channelReady(config, channel)),
  ).length;
}

export interface NotificationEvent {
  id: string;
  subscriptionId: string;
  spinId: string;
  trackId: string;
  title: string;
  artist: string;
  stationId: string;
  station: string;
  region: Region;
  atIso: string;
  trigger: TriggerId | "custom_threshold";
  channel: ChannelId;
  ordinal: number;
  spinsToday: number;
  milestone: number | null;
  message: string;
  source: "captured" | "simulator";
}
function eventMessage(
  template: string,
  spin: BroadcastSpin,
  track: Track,
  trigger: TriggerId,
  ordinal: number,
  spinsToday: number,
) {
  const station = FM_STATIONS.find((entry) => entry.id === spin.stationId);
  return renderMessageTemplate(template, {
    title: track.title,
    artist: track.primaryArtist,
    station: spin.stationName,
    location: station?.location ?? spin.region,
    region: spin.region,
    time: formatEatClock(spin.detectedAt),
    spinsToday,
    totalSpins: ordinal,
    milestone: trigger === "milestone" ? ordinal : "—",
    trigger:
      trigger === "first"
        ? "First captured FM play in the connected panel."
        : trigger === "milestone"
          ? `Milestone: ${ordinal.toLocaleString("en-GB")} captured FM spins.`
          : "Prime-time airplay.",
  });
}

/** Global, de-duplicated FM counters are updated BEFORE subscription filters are applied. */
export function notificationCandidates(
  history: BroadcastSpin[],
  catalogue: Track[],
  config: NotificationPreferences,
  now = new Date(),
): NotificationEvent[] {
  const seen = new Set<string>();
  const totals = new Map<string, number>();
  const daily = new Map<string, number>();
  const result: NotificationEvent[] = [];
  const tracks = new Map(catalogue.map((track) => [track.id, track]));
  const subscriptions = config.subscriptions.filter(
    (sub) => sub.enabled && !subscriptionIssues(sub, catalogue).length,
  );
  const sorted = [...history]
    .filter(
      (spin) =>
        spin.source === "captured" &&
        spin.medium === "FM" &&
        spin.trackId &&
        tracks.has(spin.trackId) &&
        Number.isFinite(Date.parse(spin.detectedAt)) &&
        Date.parse(spin.detectedAt) <= now.getTime(),
    )
    .sort(
      (a, b) =>
        a.detectedAt.localeCompare(b.detectedAt) || a.id.localeCompare(b.id),
    );
  for (const spin of sorted) {
    if (seen.has(spin.id)) continue;
    seen.add(spin.id);
    const track = tracks.get(spin.trackId!)!;
    const ordinal = (totals.get(track.id) ?? 0) + 1;
    totals.set(track.id, ordinal);
    const dayKey = `${track.id}:${eatDate(spin.detectedAt)}`;
    const spinsToday = (daily.get(dayKey) ?? 0) + 1;
    daily.set(dayKey, spinsToday);
    for (const sub of subscriptions) {
      if (
        Date.parse(spin.detectedAt) <
          Date.parse(sub.activatedAt ?? sub.createdAt) ||
        (sub.trackId !== "all" && sub.trackId !== track.id) ||
        (sub.stationId !== "all" && sub.stationId !== spin.stationId) ||
        (sub.region !== "All" && sub.region !== spin.region)
      )
        continue;
      const hour = eatHour(spin.detectedAt);
      const matching: TriggerId[] = sub.triggers.filter((trigger) =>
        trigger === "first"
          ? ordinal === 1
          : trigger === "milestone"
            ? sub.milestones.includes(ordinal)
            : PRIME_STATIONS.includes(spin.stationId) &&
              ((hour >= 6 && hour < 10) || (hour >= 16 && hour < 20)),
      );
      for (const trigger of matching)
        for (const channel of sub.channels.filter((channel) =>
          channelReady(config, channel),
        )) {
          result.push({
            id: `${encodeURIComponent(sub.id)}:${encodeURIComponent(spin.id)}:${trigger}:${channel}`,
            subscriptionId: sub.id,
            spinId: spin.id,
            trackId: track.id,
            title: track.title,
            artist: track.primaryArtist,
            stationId: spin.stationId,
            station: spin.stationName,
            region: spin.region,
            atIso: spin.detectedAt,
            trigger,
            channel,
            ordinal,
            spinsToday,
            milestone: trigger === "milestone" ? ordinal : null,
            source: "captured",
            message: eventMessage(
              config.whatsapp.template,
              spin,
              track,
              trigger,
              ordinal,
              spinsToday,
            ),
          });
        }
    }
  }
  return result.sort(
    (a, b) => b.atIso.localeCompare(a.atIso) || a.id.localeCompare(b.id),
  );
}

/** A test uses real release metadata but NEVER enters the captured log, KPI totals or live outbox. */
export function testNotification(
  catalogue: Track[],
  config: NotificationPreferences,
  now = new Date(),
  trigger: TriggerId = "prime",
): NotificationEvent | null {
  const preferred = config.subscriptions.find(
    (sub) => sub.enabled && sub.trackId !== "all",
  );
  const track =
    catalogue.find((entry) => entry.id === preferred?.trackId) ?? catalogue[0];
  if (!track) return null;
  const station = FM_STATIONS.find((entry) => entry.id === "capital-kla")!;
  const ordinal =
    trigger === "first"
      ? 1
      : trigger === "milestone"
        ? (preferred?.milestones[0] ?? 100)
        : 14;
  const spin: BroadcastSpin = {
    id: "simulator",
    detectedAt: now.toISOString(),
    stationId: station.id,
    stationName: station.name,
    region: station.region,
    medium: "FM",
    trackId: track.id,
    title: track.title,
    primaryArtist: track.primaryArtist,
    isrc: null,
    durationSec: track.audio.durationSec ?? 180,
    confidence: 0,
    source: "demo",
  };
  return {
    id: `test:${now.toISOString()}`,
    subscriptionId: "simulator",
    spinId: "simulator",
    trackId: track.id,
    title: track.title,
    artist: track.primaryArtist,
    stationId: station.id,
    station: station.name,
    region: station.region,
    atIso: spin.detectedAt,
    trigger,
    channel: "whatsapp",
    ordinal,
    spinsToday: trigger === "first" ? 1 : 14,
    milestone: trigger === "milestone" ? ordinal : null,
    source: "simulator",
    message: `TEST — SIMULATED AIRPLAY\n${eventMessage(config.whatsapp.template, spin, track, trigger, ordinal, trigger === "first" ? 1 : 14)}`,
  };
}
export function notificationWebhookPayload(event: NotificationEvent) {
  return {
    id: event.id,
    type: `airplay.${event.trigger}`,
    source: "east-sound",
    mode: event.source,
    occurred_at: event.atIso,
    recording: { id: event.trackId, title: event.title, artist: event.artist },
    station: { id: event.stationId, name: event.station, region: event.region },
    fm_spins_in_connected_history: event.ordinal,
    fm_spins_today: event.spinsToday,
    milestone: event.milestone,
    message: event.message,
  };
}

export interface ProviderReadiness {
  whatsapp: boolean;
  email: boolean;
  webhook: boolean;
  liveEnabled: boolean;
  worker: boolean;
}
