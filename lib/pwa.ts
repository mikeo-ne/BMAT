/**
 * Installable app plumbing.
 *
 * "SongBoost is in my pocket" is a real advantage; a home-screen icon, an
 * offline shell and a push notification close most of it without an app store.
 * Everything here is pure or feature-detected so the same code runs in demo
 * mode, on iOS Safari (no install prompt) and in the tests.
 */

export const APP_NAME = "East Sound";
export const APP_SHORT_NAME = "East Sound";
export const APP_DESCRIPTION = "Radio and TV airplay for Uganda — every spin, with the clip to prove it.";
export const THEME_COLOR = "#020617";
export const BACKGROUND_COLOR = "#020617";

export type InstallState = "unsupported" | "prompt" | "ios" | "installed";

/** Browsers that fire `beforeinstallprompt`, and the iOS case that does not. */
export function installState(opts: {
  hasPrompt: boolean;
  standalone: boolean;
  userAgent: string;
}): InstallState {
  if (opts.standalone) return "installed";
  if (opts.hasPrompt) return "prompt";
  // iOS never fires the event; Safari users install via Share → Add to Home Screen.
  if (/iphone|ipad|ipod/i.test(opts.userAgent)) return "ios";
  return "unsupported";
}

/** VAPID keys arrive as URL-safe base64; PushManager wants bytes. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = typeof atob === "function" ? atob(base64) : "";
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export type PushSubscriptionJson = { endpoint: string; keys: { p256dh: string; auth: string } };

/** The row we store for a device; returns null for an unusable subscription. */
export function subscriptionRow(
  profileId: string,
  sub: PushSubscriptionJson | null,
  userAgent: string,
): { profile_id: string; endpoint: string; p256dh: string; auth: string; user_agent: string } | null {
  if (!profileId || !sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return null;
  return {
    profile_id: profileId,
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    user_agent: userAgent.slice(0, 200),
  };
}

export const PUSH_TEST_PAYLOAD = {
  title: "East Sound alerts are on",
  body: "You will hear about first spins, chart moves and disputes here.",
  url: "/dashboard",
} as const;
