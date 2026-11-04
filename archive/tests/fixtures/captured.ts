import { buildSeedTracks } from "@/lib/catalog";
import {
  defaultNotificationPreferences,
  type AlertSubscription,
  type NotificationPreferences,
} from "@/lib/notifications";
import type { BroadcastSpin } from "@/lib/playout";
import { FM_STATIONS } from "@/lib/regions";

export const CAPTURE_NOW = new Date("2026-11-01T18:00:00.000Z");
export const REFERENCE_CATALOGUE = buildSeedTracks(CAPTURE_NOW);

/** Explicit test-only event; never written to the application's data directory. */
export function capturedSpin(
  overrides: Partial<BroadcastSpin> = {},
): BroadcastSpin {
  const track = REFERENCE_CATALOGUE[0];
  const station = FM_STATIONS.find(
    (row) => row.id === (overrides.stationId ?? "capital-kla"),
  );
  return {
    id: "qa-captured-1",
    source: "captured",
    detectedAt: "2026-11-01T13:00:00.000Z",
    stationId: station?.id ?? "nbs-tv-kla",
    stationName: station?.name ?? "NBS TV",
    region: station?.region ?? "Central",
    medium: station ? "FM" : "TV",
    trackId: track.id,
    title: track.title,
    primaryArtist: track.primaryArtist,
    isrc: null,
    durationSec: track.audio.durationSec ?? 154,
    confidence: 0.98,
    ...(overrides.trackId === null ? { title: null, primaryArtist: null } : {}),
    ...overrides,
  };
}
export function subscription(
  overrides: Partial<AlertSubscription> = {},
): AlertSubscription {
  return {
    id: "qa-subscription",
    name: "QA opted-in subscription",
    trackId: "all",
    stationId: "all",
    region: "All",
    channels: ["whatsapp"],
    triggers: ["first", "milestone", "prime"],
    milestones: [100, 1000],
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}
export function optedInPreferences(
  overrides: Partial<AlertSubscription> = {},
): NotificationPreferences {
  const config = defaultNotificationPreferences();
  config.whatsapp.phone = "+256772123456";
  config.whatsapp.consent = true;
  config.email.address = "qa-recipient@example.com";
  config.email.consent = true;
  config.subscriptions = [subscription(overrides)];
  return config;
}
