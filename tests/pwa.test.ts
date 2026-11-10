import { describe, expect, it } from "vitest";

import { installState, subscriptionRow, urlBase64ToUint8Array } from "@/lib/pwa";

/**
 * Install and push decisions differ by browser; the wrong branch is a button
 * that does nothing (Chrome) or a hint that never appears (iOS).
 */
describe("installState", () => {
  it("is installed when running standalone", () => {
    expect(installState({ hasPrompt: true, standalone: true, userAgent: "Mozilla/5.0 Chrome" })).toBe("installed");
  });

  it("offers the native prompt on Chrome/Android", () => {
    expect(installState({ hasPrompt: true, standalone: false, userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/120" })).toBe("prompt");
  });

  it("falls back to the Share-sheet hint on iOS, which never fires the event", () => {
    expect(installState({ hasPrompt: false, standalone: false, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari" })).toBe("ios");
    expect(installState({ hasPrompt: false, standalone: false, userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0)" })).toBe("ios");
  });

  it("stays quiet on desktops that cannot install", () => {
    expect(installState({ hasPrompt: false, standalone: false, userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Firefox/121" })).toBe("unsupported");
  });
});

describe("subscriptionRow", () => {
  const sub = { endpoint: "https://push.example/abc", keys: { p256dh: "key", auth: "secret" } };

  it("builds the row we store for a device", () => {
    expect(subscriptionRow("user-1", sub, "Mozilla/5.0")).toEqual({
      profile_id: "user-1",
      endpoint: "https://push.example/abc",
      p256dh: "key",
      auth: "secret",
      user_agent: "Mozilla/5.0",
    });
  });

  it("refuses an incomplete subscription rather than storing a broken device", () => {
    expect(subscriptionRow("user-1", null, "UA")).toBeNull();
    expect(subscriptionRow("", sub, "UA")).toBeNull();
    expect(subscriptionRow("user-1", { endpoint: "", keys: { p256dh: "k", auth: "a" } }, "UA")).toBeNull();
    expect(subscriptionRow("user-1", { endpoint: "x", keys: { p256dh: "", auth: "" } }, "UA")).toBeNull();
  });
});

describe("urlBase64ToUint8Array", () => {
  it("decodes the URL-safe base64 a VAPID key uses", () => {
    // "hello" in base64url, unpadded.
    expect(Array.from(urlBase64ToUint8Array("aGVsbG8"))).toEqual([104, 101, 108, 108, 111]);
  });
});
